import { useCallback, useEffect, useState } from "react";
import { backend } from "@/lib/backend/client";

export type ReminderStatus = "pending" | "triggered" | "cancelled";

export interface LocationReminder {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  label: string | null;
  status: ReminderStatus;
  createdAt: string;
  triggeredAt: string | null;
  cancelledAt: string | null;
}

interface GeocodeResult {
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  placeId: string;
}

export interface LocationRemindersController {
  loading: boolean;
  error: string | null;
  reminders: LocationReminder[];
  refresh: () => Promise<void>;
  /** Crea un recordatorio con coordenadas ya resueltas (ej. GPS actual del navegador). */
  createAtCoordinates: (
    message: string,
    latitude: number,
    longitude: number,
    radiusMeters?: number,
    label?: string,
  ) => Promise<void>;
  /** Geocodifica una dirección de texto real vía `GET /navigation/geocode` (ADR-0010) y crea el recordatorio ahí. */
  createAtAddress: (message: string, address: string, radiusMeters?: number) => Promise<void>;
  cancel: (id: string) => Promise<void>;
}

/** Controlador real de "Recordatorios por ubicación" — `GET/POST /location-reminders`, `DELETE /location-reminders/:id` (ver ADR-0015). */
export function useLocationReminders(): LocationRemindersController {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<LocationReminder[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReminders(await backend.get<LocationReminder[]>("/location-reminders"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los recordatorios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createAtCoordinates = useCallback(
    async (
      message: string,
      latitude: number,
      longitude: number,
      radiusMeters?: number,
      label?: string,
    ) => {
      await backend.post("/location-reminders", {
        message,
        latitude,
        longitude,
        radiusMeters,
        label,
      });
      await refresh();
    },
    [refresh],
  );

  const createAtAddress = useCallback(
    async (message: string, address: string, radiusMeters?: number) => {
      const geocoded = await backend.get<GeocodeResult | null>(
        `/navigation/geocode?address=${encodeURIComponent(address)}`,
      );
      if (!geocoded) {
        throw new Error(`No encontré "${address}".`);
      }
      await backend.post("/location-reminders", {
        message,
        latitude: geocoded.location.latitude,
        longitude: geocoded.location.longitude,
        radiusMeters,
        label: geocoded.formattedAddress,
      });
      await refresh();
    },
    [refresh],
  );

  const cancel = useCallback(
    async (id: string) => {
      await backend.delete(`/location-reminders/${id}`);
      await refresh();
    },
    [refresh],
  );

  return { loading, error, reminders, refresh, createAtCoordinates, createAtAddress, cancel };
}
