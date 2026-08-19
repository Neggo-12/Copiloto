import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import type { CachedReminder, LocationReminder, ReminderStatus } from "./location-reminders.types";

/**
 * Radio del geofence si el usuario no especifica uno. 300m cubre "pasar
 * cerca de un sector" con margen razonable (más grande que el buffer de
 * 200m de Emergency Corridor, porque un recordatorio de sector es menos
 * preciso que un corredor sobre una ruta conocida). Valor inicial,
 * ajustable con evidencia real de uso — mismo criterio que los demás
 * umbrales del proyecto (60m desvío de ruta, 200m buffer de corredor).
 */
const DEFAULT_RADIUS_METERS = 300;

interface LocationReminderRow {
  id: string;
  message: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  label: string | null;
  status: ReminderStatus;
  created_at: string;
  triggered_at: string | null;
  cancelled_at: string | null;
}

function toLocationReminder(row: LocationReminderRow): LocationReminder {
  return {
    id: row.id,
    message: row.message,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radius_meters,
    label: row.label,
    status: row.status,
    createdAt: row.created_at,
    triggeredAt: row.triggered_at,
    cancelledAt: row.cancelled_at,
  };
}

const REMINDER_COLUMNS = "id, message, latitude, longitude, radius_meters, label, status, created_at, triggered_at, cancelled_at";

/**
 * Envuelve `location_reminders` (Postgres, fuente real de verdad). Mismo
 * patrón que `VehiclesService`/`EmergencyVehiclesService`: cliente admin
 * (bypassa RLS) porque `SupabaseAuthGuard` ya autorizó al usuario, cada
 * query filtra explícitamente por `user_id`, y el RLS de la tabla queda
 * como defensa en profundidad para cualquier acceso directo futuro.
 */
@Injectable()
export class LocationRemindersService {
  private readonly logger = new Logger(LocationRemindersService.name);

  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient) {}

  async create(
    userId: string,
    message: string,
    latitude: number,
    longitude: number,
    radiusMeters: number | undefined,
    label: string | null,
  ): Promise<LocationReminder> {
    const { data, error } = await this.supabase
      .from("location_reminders")
      .insert({
        user_id: userId,
        message,
        latitude,
        longitude,
        radius_meters: radiusMeters ?? DEFAULT_RADIUS_METERS,
        label,
      })
      .select(REMINDER_COLUMNS)
      .single();

    if (error) {
      this.logger.error(`create(${userId}): ${error.message}`);
      throw error;
    }

    return toLocationReminder(data);
  }

  async list(userId: string): Promise<LocationReminder[]> {
    const { data, error } = await this.supabase
      .from("location_reminders")
      .select(REMINDER_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      this.logger.error(`list(${userId}): ${error.message}`);
      throw error;
    }

    return ((data ?? []) as LocationReminderRow[]).map(toLocationReminder);
  }

  /** Forma reducida para poblar `ReminderCacheService` — solo lo necesario para evaluar el geofence. */
  async listPendingForCache(userId: string): Promise<CachedReminder[]> {
    const { data, error } = await this.supabase
      .from("location_reminders")
      .select("id, message, latitude, longitude, radius_meters")
      .eq("user_id", userId)
      .eq("status", "pending");

    if (error) {
      this.logger.error(`listPendingForCache(${userId}): ${error.message}`);
      throw error;
    }

    return ((data ?? []) as Array<Pick<LocationReminderRow, "id" | "message" | "latitude" | "longitude" | "radius_meters">>).map((row) => ({
      id: row.id,
      message: row.message,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusMeters: row.radius_meters,
    }));
  }

  /**
   * Idempotente a propósito: el `.eq("status", "pending")` hace que dos
   * evaluaciones concurrentes del mismo geofence (ej. dos reportes de
   * ubicación muy seguidos) no disparen el mismo recordatorio dos veces —
   * la segunda simplemente no actualiza ninguna fila.
   */
  async markTriggered(userId: string, reminderId: string): Promise<void> {
    const { error } = await this.supabase
      .from("location_reminders")
      .update({ status: "triggered", triggered_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", reminderId)
      .eq("status", "pending");

    if (error) {
      this.logger.error(`markTriggered(${userId}, ${reminderId}): ${error.message}`);
      throw error;
    }
  }

  async cancel(userId: string, reminderId: string): Promise<void> {
    const { error } = await this.supabase
      .from("location_reminders")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", reminderId)
      .eq("status", "pending");

    if (error) {
      this.logger.error(`cancel(${userId}, ${reminderId}): ${error.message}`);
      throw error;
    }
  }
}
