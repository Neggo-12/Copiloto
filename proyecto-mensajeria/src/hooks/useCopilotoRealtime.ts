import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  BACKEND_BASE_URL,
  backend,
  getBackendAccessToken,
  BackendError,
} from "@/lib/backend/client";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";
export type GeoStatus = "idle" | "watching" | "denied" | "unsupported" | "error";

export interface ReminderTriggerEvent {
  id: string;
  message: string;
  distanceMeters: number;
  receivedAt: string;
}

export type AlertChannel = "visual_audio" | "voice_priority" | "default";
/** Espejo de `CorridorSeverity` en el backend (ADR-0021) — relativo al buffer dinámico del momento, no a un valor fijo de metros. */
export type CorridorSeverity = "info" | "warning" | "critical";

export interface CorridorAlertEvent {
  message: string;
  distanceMeters: number;
  severity: CorridorSeverity;
  ambulanceDriverId: string;
  recommendedChannel: AlertChannel;
  receivedAt: string;
}

interface CorridorCandidate {
  userId: string;
  distanceMeters: number;
  state: "potential_conflict";
  severity: CorridorSeverity;
}

interface CorridorCandidatesResponse {
  hasActiveRoute: boolean;
  candidates: CorridorCandidate[];
  alerted: string[];
  skippedByCooldown: string[];
}

export type AmbulanceView =
  | { checked: false }
  | { checked: true; isAmbulance: false }
  | { checked: true; isAmbulance: true; data: CorridorCandidatesResponse | null; polling: boolean };

export interface CopilotoRealtimeState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  geoStatus: GeoStatus;
  alerts: CorridorAlertEvent[];
  reminderTriggers: ReminderTriggerEvent[];
  ambulanceView: AmbulanceView;
}

const AMBULANCE_POLL_INTERVAL_MS = 8000;

/**
 * Conexión real (una sola vez, compartida por Emergencia y Notificaciones)
 * al canal `/location` del backend (ver `LocationGateway`): reporta GPS real
 * del navegador vía `location:update` y escucha `corridor:alert` en vivo —
 * mismo mecanismo que ya usa la app real, no un simulacro. Si el usuario es
 * un conductor de ambulancia verificado, además consulta candidatos del
 * corredor periódicamente (`GET /emergency/corridor/candidates`).
 */
export function useCopilotoRealtime(): CopilotoRealtimeState {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [alerts, setAlerts] = useState<CorridorAlertEvent[]>([]);
  const [reminderTriggers, setReminderTriggers] = useState<ReminderTriggerEvent[]>([]);
  const [ambulanceView, setAmbulanceView] = useState<AmbulanceView>({ checked: false });
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let watchId: number | null = null;

    async function connect() {
      setConnectionStatus("connecting");
      const token = await getBackendAccessToken();
      if (cancelled) return;
      if (!token) {
        setConnectionStatus("error");
        setConnectionError("No hay sesión activa.");
        return;
      }

      const socket = io(`${BACKEND_BASE_URL}/location`, {
        auth: { token },
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        if (cancelled) return;
        setConnectionStatus("connected");
        setConnectionError(null);
      });

      socket.on("connect_error", (err: Error) => {
        if (cancelled) return;
        setConnectionStatus("error");
        setConnectionError(err.message || "No se pudo conectar con el backend.");
      });

      socket.on("error", (payload: { message?: string }) => {
        if (cancelled) return;
        setConnectionStatus("error");
        setConnectionError(payload?.message ?? "Error del canal de ubicación.");
      });

      socket.on(
        "corridor:alert",
        (payload: {
          message: string;
          distanceMeters: number;
          severity: CorridorSeverity;
          ambulanceDriverId: string;
          recommendedChannel: AlertChannel;
        }) => {
          if (cancelled) return;
          setAlerts((prev) =>
            [{ ...payload, receivedAt: new Date().toISOString() }, ...prev].slice(0, 20),
          );
        },
      );

      if (!navigator.geolocation) {
        setGeoStatus("unsupported");
        return;
      }

      setGeoStatus("watching");
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (cancelled || !socketRef.current?.connected) return;
          socketRef.current.emit(
            "location:update",
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              speed: position.coords.speed,
              heading: position.coords.heading,
              clientTimestamp: position.timestamp,
            },
            (ack: { accepted: boolean; remindersTriggered?: ReminderTriggerEvent[] }) => {
              if (cancelled || !ack?.accepted || !ack.remindersTriggered?.length) return;
              const receivedAt = new Date().toISOString();
              setReminderTriggers((prev) =>
                [...ack.remindersTriggered!.map((t) => ({ ...t, receivedAt })), ...prev].slice(
                  0,
                  20,
                ),
              );
            },
          );
        },
        (geoError) => {
          if (cancelled) return;
          setGeoStatus(geoError.code === geoError.PERMISSION_DENIED ? "denied" : "error");
        },
        { enableHighAccuracy: false, maximumAge: 10_000, timeout: 15_000 },
      );
    }

    void connect();

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function checkAmbulanceRole() {
      try {
        const data = await backend.get<CorridorCandidatesResponse>(
          "/emergency/corridor/candidates",
        );
        if (cancelled) return;
        setAmbulanceView({ checked: true, isAmbulance: true, data, polling: true });
        intervalId = setInterval(() => {
          void backend
            .get<CorridorCandidatesResponse>("/emergency/corridor/candidates")
            .then((next) => {
              if (!cancelled)
                setAmbulanceView({ checked: true, isAmbulance: true, data: next, polling: true });
            })
            .catch(() => undefined);
        }, AMBULANCE_POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof BackendError && err.status === 403) {
          setAmbulanceView({ checked: true, isAmbulance: false });
        } else {
          // Otro error (sesión, red) — se trata como "no ambulancia" para no
          // bloquear la pantalla; la conexión de ubicación ya reporta su
          // propio estado de error por separado.
          setAmbulanceView({ checked: true, isAmbulance: false });
        }
      }
    }

    void checkAmbulanceRole();
    return () => {
      cancelled = true;
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, []);

  return { connectionStatus, connectionError, geoStatus, alerts, reminderTriggers, ambulanceView };
}
