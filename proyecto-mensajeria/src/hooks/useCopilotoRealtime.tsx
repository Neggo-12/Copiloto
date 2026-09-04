import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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

/**
 * Nota con hora fija que acaba de dispararse (ADR-0030) — llega por
 * `LocationBroadcastService.notify(userId, "reminder:due", ...)`, el mismo
 * `LocationReminder` completo que devuelve el backend (no un tipo aparte).
 * Solo llega si el socket de `/location` está conectado en ese momento
 * (todavía no hay FCM/APNs — ver MISSING_CAPABILITIES.md).
 */
export interface NoteReminderDueEvent {
  id: string;
  title: string | null;
  message: string;
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

/** Espejo de `CorridorCloseReason` en el backend (`emergency-corridor.types.ts`) — incluye `expired` desde 2026-09-01 (barrido real, ver `AlertPolicyService.sweepExpired`). */
export type CorridorCloseReason = "completed" | "cancelled" | "expired";

/** "Ya pasó" real — llega solo a quien alcanzó a ser alertado durante ESE traslado (`corridor:alerted:{ambulanceDriverId}` en el backend), no a cualquiera. */
export interface CorridorClosedEvent {
  ambulanceDriverId: string;
  reason: CorridorCloseReason;
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
  | {
      checked: true;
      isAmbulance: true;
      data: CorridorCandidatesResponse | null;
      polling: boolean;
    };

export interface CopilotoRealtimeState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  geoStatus: GeoStatus;
  alerts: CorridorAlertEvent[];
  closedNotices: CorridorClosedEvent[];
  reminderTriggers: ReminderTriggerEvent[];
  noteReminders: NoteReminderDueEvent[];
  ambulanceView: AmbulanceView;
  /** `null` mientras cierra (evita doble tap); lanza `BackendError` si falla — la pantalla decide cómo mostrarlo. */
  closeAmbulanceCorridor: (reason: "completed" | "cancelled") => Promise<void>;
}

const AMBULANCE_POLL_INTERVAL_MS = 8000;

/**
 * Gap real encontrado en pruebas (2026-09-02, el fundador manejando):
 * `remindersTriggered`/`reminder:due` solo llegaban como tarjeta muda en
 * "Alertas" (`NotificacionesScreen`) — nunca se anunciaban en voz, ni
 * siquiera con el asistente de voz ya conectado, porque `useGeminiVoiceSession`
 * (el micrófono/sesión Live) es un sistema totalmente aparte de este socket
 * `/location`. Eso rompe la propuesta real de "manos libres": el conductor
 * tendría que estar mirando la pantalla para enterarse.
 *
 * Fix mínimo (REUSE): `speechSynthesis` del navegador — no depende de que
 * haya una sesión Gemini Live activa, no toca el audio de Gemini (que usa su
 * propio `AudioContext`/PCM, un sistema distinto, verificado en
 * `useGeminiVoiceSession`/`gemini-live.service.ts` — no hay conflicto real
 * entre ambos), y funciona apenas se dispara el recordatorio, sin esperar a
 * que el usuario abra una conversación de voz. No cubre `corridor:alert`
 * (alerta de corredor de emergencia) a propósito — es una superficie más
 * sensible (ver puntos-movilidad-engineering) y el fundador no lo pidió
 * todavía; queda como siguiente paso si lo confirma.
 */
function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-ES";
  // `volume` no tiene default garantizado en todos los navegadores (algunos
  // heredan el último valor usado por otra utterance) — se fija explícito a
  // propósito, ver gap real reportado 2026-09-03 (recordatorio "casi no se
  // escuchó" con un intercomunicador Bluetooth conectado).
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

/**
 * Gap real reportado 2026-09-03: un recordatorio de ubicación se disparó de
 * verdad (quedó "Disparada"/"Cumplida" en Notas, confirmado con Postgres) y
 * el fundador "medio escuchó" el aviso de voz, manejando con un
 * intercomunicador Bluetooth conectado. `speechSynthesis` en navegador móvil
 * se puede frenar o sonar más bajo cuando la pantalla se apaga/bloquea — el
 * navegador entra en un modo de fondo más agresivo con los timers y el audio.
 * No es una garantía total (el enrutamiento de audio hacia un Bluetooth
 * externo tiene sus propios límites del navegador/SO, fuera del alcance de
 * esto), pero mantener la pantalla encendida mientras el rastreo de
 * ubicación está activo (Modo conducción) reduce ese riesgo real. Screen
 * Wake Lock API: soportada en iOS Safari/WebKit desde 16.4+ y en Chrome
 * Android — si no está disponible, falla en silencio (no bloquea el rastreo).
 */
async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return null;
  try {
    return await (navigator as Navigator & { wakeLock: WakeLock }).wakeLock.request("screen");
  } catch {
    // Puede fallar por batería baja, pestaña no visible en ese instante, etc.
    // — no es crítico para el rastreo real, así que se ignora.
    return null;
  }
}

interface WakeLockSentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}
interface WakeLock {
  request(type: "screen"): Promise<WakeLockSentinel>;
}

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
  const [closedNotices, setClosedNotices] = useState<CorridorClosedEvent[]>([]);
  const [reminderTriggers, setReminderTriggers] = useState<ReminderTriggerEvent[]>([]);
  const [noteReminders, setNoteReminders] = useState<NoteReminderDueEvent[]>([]);
  const [ambulanceView, setAmbulanceView] = useState<AmbulanceView>({
    checked: false,
  });
  const socketRef = useRef<Socket | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let cancelled = false;
    let watchId: number | null = null;

    // El Wake Lock se libera solo cuando la pestaña se oculta (cambiar de
    // app, apagar pantalla) — hay que volver a pedirlo cuando el usuario
    // regresa, mientras el rastreo siga activo.
    async function reacquireWakeLockOnVisible() {
      if (document.visibilityState !== "visible" || cancelled) return;
      if (wakeLockRef.current && !wakeLockRef.current.released) return;
      wakeLockRef.current = await requestWakeLock();
    }

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

      socket.on(
        "corridor:closed",
        (payload: { ambulanceDriverId: string; reason: CorridorCloseReason }) => {
          if (cancelled) return;
          setClosedNotices((prev) =>
            [{ ...payload, receivedAt: new Date().toISOString() }, ...prev].slice(0, 20),
          );
        },
      );

      socket.on(
        "reminder:due",
        (payload: { id: string; title: string | null; message: string }) => {
          if (cancelled) return;
          setNoteReminders((prev) =>
            [{ ...payload, receivedAt: new Date().toISOString() }, ...prev].slice(0, 20),
          );
          speak(`Recordatorio: ${payload.title?.trim() || payload.message}`);
        },
      );

      if (!navigator.geolocation) {
        setGeoStatus("unsupported");
        return;
      }

      setGeoStatus("watching");
      wakeLockRef.current = await requestWakeLock();
      if (!cancelled && typeof document !== "undefined") {
        document.addEventListener("visibilitychange", reacquireWakeLockOnVisible);
      }
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
              for (const triggered of ack.remindersTriggered) {
                speak(`Recordatorio: ${triggered.message}`);
              }
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
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", reacquireWakeLockOnVisible);
      }
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
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
        setAmbulanceView({
          checked: true,
          isAmbulance: true,
          data,
          polling: true,
        });
        intervalId = setInterval(() => {
          void backend
            .get<CorridorCandidatesResponse>("/emergency/corridor/candidates")
            .then((next) => {
              if (!cancelled)
                setAmbulanceView({
                  checked: true,
                  isAmbulance: true,
                  data: next,
                  polling: true,
                });
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

  /**
   * `POST /emergency/corridor/close` real — antes no existía ningún caller
   * en el frontend (gap documentado en ADR-0020: "no existe todavía UI de
   * ambulancia... solo consumo de candidatos/alertas del lado del posible
   * afectado"). Tras cerrar, refresca candidatos una vez para que
   * `ambulanceView` refleje `hasActiveRoute: false` de inmediato — el
   * polling normal de 8s ya lo haría, pero esperar hasta 8s después de que
   * el conductor tocó "Finalizar" se sentiría roto.
   */
  async function closeAmbulanceCorridor(reason: "completed" | "cancelled"): Promise<void> {
    await backend.post<{
      closed: true;
      reason: CorridorCloseReason;
      notified: string[];
    }>("/emergency/corridor/close", { reason });
    try {
      const next = await backend.get<CorridorCandidatesResponse>("/emergency/corridor/candidates");
      setAmbulanceView({
        checked: true,
        isAmbulance: true,
        data: next,
        polling: true,
      });
    } catch {
      // El polling normal (cada 8s) termina de refrescar esto solo — no es
      // crítico que este refresh optimista puntual falle.
    }
  }

  return {
    connectionStatus,
    connectionError,
    geoStatus,
    alerts,
    closedNotices,
    reminderTriggers,
    noteReminders,
    ambulanceView,
    closeAmbulanceCorridor,
  };
}

/**
 * Bug real reportado 2026-09-02 (el fundador probando en la calle, saliendo
 * de la pestaña Copiloto hacia Chats/Notas/Contactos): antes, `CopilotoTab`
 * llamaba `useCopilotoRealtime()` directamente, así que el socket de
 * `/location` y el `watchPosition` real se cerraban (efecto de limpieza del
 * hook) apenas `CopilotoTab` se desmontaba — que es exactamente lo que pasa
 * al cambiar de pestaña PRINCIPAL (`MainShell` en `routes/index.tsx` solo
 * renderiza una pestaña a la vez). El conductor dejaba de compartir
 * ubicación y de recibir recordatorios en cuanto abría Chats, rompiendo la
 * propuesta real de "manos libres mientras manejas".
 *
 * Fix (REUSE del mismo patrón `createContext`/`useContext` que ya usa
 * `AppStore.tsx`): el hook real (`useCopilotoRealtime` arriba, SIN cambios
 * en su lógica) ahora se monta UNA sola vez en `MainShell` — que vive mientras
 * el usuario está en cualquiera de las 5 pestañas principales, no solo en
 * Copiloto — y se comparte por contexto. `CopilotoTab` consume
 * `useCopilotoRealtimeContext()` en vez de llamar el hook directamente.
 */
const CopilotoRealtimeContext = createContext<CopilotoRealtimeState | null>(null);

export function CopilotoRealtimeProvider({ children }: { children: ReactNode }) {
  const value = useCopilotoRealtime();
  return (
    <CopilotoRealtimeContext.Provider value={value}>{children}</CopilotoRealtimeContext.Provider>
  );
}

export function useCopilotoRealtimeContext(): CopilotoRealtimeState {
  const ctx = useContext(CopilotoRealtimeContext);
  if (!ctx) {
    throw new Error("useCopilotoRealtimeContext debe usarse dentro de <CopilotoRealtimeProvider>");
  }
  return ctx;
}
