import { useCallback, useEffect, useMemo, useState } from "react";
import { backend } from "@/lib/backend/client";

/**
 * Sección unificada de recordatorios/notas/tareas (ADR-0023). Antes eran dos
 * capacidades separadas: "Notas" (pestaña principal, 100% local en el
 * frontend, sin backend real) y "Recordatorios" (sub-pestaña de Copiloto,
 * backend real pero solo geolocalizado). Ahora las dos viven en la misma
 * tabla (`location_reminders`, backend `LocationRemindersService`) y en la
 * misma sección de la app — reemplaza a `useNotes` y `useLocationReminders`.
 */
export type ReminderKind = "location" | "note";
export type ReminderStatus = "pending" | "triggered" | "cancelled";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  title: string | null;
  message: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  label: string | null;
  status: ReminderStatus;
  isTask: boolean;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  triggeredAt: string | null;
  cancelledAt: string | null;
  /** Hora fija de aviso (ADR-0030) — solo para notas (`kind: "note"`). `null` si no tiene una programada. */
  remindAt: string | null;
}

export type ReminderFilter = "all" | "pending" | "done";

export interface RemindersController {
  loading: boolean;
  error: string | null;
  /** Notas/tareas/recordatorios activos (sin archivar), más recientes primero. */
  reminders: Reminder[];
  archivedReminders: Reminder[];
  refresh: () => Promise<void>;
  search: (query: string) => Reminder[];
  /** Nota o tarea de texto — sin ubicación. */
  createNote: (input: {
    title?: string;
    message: string;
    isTask?: boolean;
    /** Hora fija de aviso opcional (ADR-0030), ISO 8601. */
    remindAt?: string | null;
  }) => Promise<Reminder | null>;
  /**
   * Recordatorio que se dispara al pasar por un lugar — dictado por voz o
   * escrito. Geocodifica la dirección con `GET /navigation/geocode`
   * (ADR-0010), mismo flujo que ya usa el tool de voz `create_location_reminder`.
   */
  createAtAddress: (
    message: string,
    address: string,
    radiusMeters?: number,
  ) => Promise<Reminder | null>;
  createAtCoordinates: (
    message: string,
    latitude: number,
    longitude: number,
    radiusMeters?: number,
    label?: string,
  ) => Promise<Reminder | null>;
  updateText: (id: string, patch: { title?: string | null; message?: string }) => Promise<void>;
  /** Programa, reprograma o quita (`null`) la hora fija de aviso de una nota (ADR-0030). */
  scheduleReminder: (id: string, remindAt: string | null) => Promise<void>;
  setIsTask: (id: string, isTask: boolean) => Promise<void>;
  toggleTaskCompleted: (id: string) => Promise<void>;
  toggleArchived: (id: string) => Promise<void>;
  /** Cancela (soft) un recordatorio de ubicación pendiente — conserva el historial, pero sigue visible como "Cancelado". Ver `remove` para borrarlo del todo. */
  cancelLocation: (id: string) => Promise<void>;
  /**
   * Borra un recordatorio o nota permanentemente (cualquier `kind`) — deja
   * de aparecer en la libreta. Antes ("removeNote") solo funcionaba para
   * notas; los recordatorios de ubicación solo se podían cancelar (seguían
   * visibles como "Cancelado"). Generalizado a pedido real del fundador
   * (2026-09-01): "necesito un botón para eliminar los recordatorios...
   * que ya quiera borrar del todo".
   */
  remove: (id: string) => Promise<void>;
}

interface GeocodeResult {
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  placeId: string;
}

export function useReminders(): RemindersController {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState<Reminder[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAll(await backend.get<Reminder[]>("/location-reminders"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar tus notas y recordatorios.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reminders = useMemo(
    () =>
      [...all]
        .filter((item) => !item.archivedAt)
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [all],
  );
  const archivedReminders = useMemo(
    () =>
      [...all]
        .filter((item) => item.archivedAt)
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [all],
  );

  const search = useCallback(
    (query: string) => {
      const term = query.trim().toLowerCase();
      if (!term) return reminders;
      return reminders.filter(
        (item) =>
          (item.title ?? "").toLowerCase().includes(term) ||
          item.message.toLowerCase().includes(term) ||
          (item.label ?? "").toLowerCase().includes(term),
      );
    },
    [reminders],
  );

  const createNote = useCallback(
    async (input: {
      title?: string;
      message: string;
      isTask?: boolean;
      remindAt?: string | null;
    }) => {
      // Sin guarda de "message vacío" a propósito: el botón "+" de la
      // libreta crea la nota EN BLANCO (mismo patrón desde que "Notas" era
      // 100% local) — el backend ya acepta `message: ""` para `kind:
      // "note"` (ver comentario real en `LocationRemindersController.create()`).
      // Bug real reportado 2026-09-01: esta guarda bloqueaba justo ese
      // caso y el botón "+" no hacía nada.
      const created = await backend.post<Reminder>("/location-reminders", {
        kind: "note",
        message: input.message.trim(),
        title: input.title?.trim() || undefined,
        isTask: input.isTask ?? false,
        remindAt: input.remindAt ?? undefined,
      });
      await refresh();
      return created;
    },
    [refresh],
  );

  const createAtCoordinates = useCallback(
    async (
      message: string,
      latitude: number,
      longitude: number,
      radiusMeters?: number,
      label?: string,
    ) => {
      if (!message.trim()) return null;
      const created = await backend.post<Reminder>("/location-reminders", {
        kind: "location",
        message: message.trim(),
        latitude,
        longitude,
        radiusMeters,
        label,
      });
      await refresh();
      return created;
    },
    [refresh],
  );

  const createAtAddress = useCallback(
    async (message: string, address: string, radiusMeters?: number) => {
      if (!message.trim() || !address.trim()) return null;
      const geocoded = await backend.get<GeocodeResult | null>(
        `/navigation/geocode?address=${encodeURIComponent(address)}`,
      );
      if (!geocoded) {
        throw new Error(`No encontré "${address}".`);
      }
      return createAtCoordinates(
        message,
        geocoded.location.latitude,
        geocoded.location.longitude,
        radiusMeters,
        geocoded.formattedAddress,
      );
    },
    [createAtCoordinates],
  );

  const updateText = useCallback(
    async (id: string, patch: { title?: string | null; message?: string }) => {
      await backend.patch(`/location-reminders/${id}`, patch);
      await refresh();
    },
    [refresh],
  );

  const scheduleReminder = useCallback(
    async (id: string, remindAt: string | null) => {
      await backend.patch(`/location-reminders/${id}/remind-at`, { remindAt });
      await refresh();
    },
    [refresh],
  );

  const setIsTask = useCallback(
    async (id: string, isTask: boolean) => {
      await backend.patch(`/location-reminders/${id}/task`, { isTask });
      await refresh();
    },
    [refresh],
  );

  const toggleTaskCompleted = useCallback(
    async (id: string) => {
      const current = all.find((item) => item.id === id);
      if (!current?.isTask) return;
      await backend.patch(`/location-reminders/${id}/complete`, {
        completed: !current.completedAt,
      });
      await refresh();
    },
    [all, refresh],
  );

  const toggleArchived = useCallback(
    async (id: string) => {
      const current = all.find((item) => item.id === id);
      if (!current) return;
      await backend.patch(`/location-reminders/${id}/archive`, { archived: !current.archivedAt });
      await refresh();
    },
    [all, refresh],
  );

  const cancelLocation = useCallback(
    async (id: string) => {
      await backend.delete(`/location-reminders/${id}`);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await backend.delete(`/location-reminders/${id}/permanent`);
      await refresh();
    },
    [refresh],
  );

  return {
    loading,
    error,
    reminders,
    archivedReminders,
    refresh,
    search,
    createNote,
    createAtAddress,
    createAtCoordinates,
    updateText,
    scheduleReminder,
    setIsTask,
    toggleTaskCompleted,
    toggleArchived,
    cancelLocation,
    remove,
  };
}
