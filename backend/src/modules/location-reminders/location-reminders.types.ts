export type ReminderStatus = "pending" | "triggered" | "cancelled";

/**
 * `location`: recordatorio geolocalizado (dispara por geofence, como antes).
 * `note`: nota/tarea de la libreta personal — sin coordenadas, no pasa por
 * el geofence. Unificación de "Notas" (antes local-only en el frontend) y
 * "Recordatorios" (antes solo geolocalizados) en una sola tabla — ver
 * ADR-0023.
 */
export type ReminderKind = "location" | "note";

export interface LocationReminder {
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
  /**
   * Hora fija de aviso (ADR-0030) — solo para `kind: "note"` (constraint
   * `location_reminders_remind_at_only_for_note` en la base real). `null`
   * significa que la nota no tiene recordatorio de hora fija programado.
   */
  remindAt: string | null;
}

/**
 * Forma reducida que se cachea en Redis — solo lo necesario para evaluar el
 * geofence en el hot path de cada `location:update`, no el registro
 * completo (ver `ReminderCacheService`). Solo existe para `kind: "location"`.
 */
export interface CachedReminder {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}
