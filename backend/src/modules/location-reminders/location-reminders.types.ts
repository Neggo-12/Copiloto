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

/**
 * Forma reducida que se cachea en Redis — solo lo necesario para evaluar el
 * geofence en el hot path de cada `location:update`, no el registro
 * completo (ver `ReminderCacheService`).
 */
export interface CachedReminder {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}
