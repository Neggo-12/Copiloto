import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import type { CachedReminder, LocationReminder, ReminderKind, ReminderStatus } from "./location-reminders.types";

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
  kind: ReminderKind;
  title: string | null;
  message: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  label: string | null;
  status: ReminderStatus;
  is_task: boolean;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  triggered_at: string | null;
  cancelled_at: string | null;
  remind_at: string | null;
}

function toLocationReminder(row: LocationReminderRow): LocationReminder {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    message: row.message,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radius_meters,
    label: row.label,
    status: row.status,
    isTask: row.is_task,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    triggeredAt: row.triggered_at,
    cancelledAt: row.cancelled_at,
    remindAt: row.remind_at,
  };
}

const REMINDER_COLUMNS =
  "id, kind, title, message, latitude, longitude, radius_meters, label, status, is_task, completed_at, archived_at, created_at, triggered_at, cancelled_at, remind_at";

export interface CreateLocationReminderInput {
  kind: "location";
  message: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  label?: string | null;
}

export interface CreateNoteInput {
  kind: "note";
  message: string;
  title?: string | null;
  isTask?: boolean;
  /** Hora fija de aviso (ADR-0030), opcional. Solo válido para notas. */
  remindAt?: string | null;
}

export type CreateReminderInput = CreateLocationReminderInput | CreateNoteInput;

/**
 * Envuelve `location_reminders` (Postgres, fuente real de verdad). Mismo
 * patrón que `VehiclesService`/`EmergencyVehiclesService`: cliente admin
 * (bypassa RLS) porque `SupabaseAuthGuard` ya autorizó al usuario, cada
 * query filtra explícitamente por `user_id`, y el RLS de la tabla queda
 * como defensa en profundidad para cualquier acceso directo futuro.
 *
 * Unifica dos capacidades antes separadas — recordatorios geolocalizados
 * (`kind: "location"`) y la libreta de notas/tareas (`kind: "note"`, antes
 * 100% local en el frontend, sin backend real) — en una sola tabla, un solo
 * `user_id = auth.uid()` de RLS, y una sola sección en la app. Ver
 * ADR-0023.
 */
@Injectable()
export class LocationRemindersService {
  private readonly logger = new Logger(LocationRemindersService.name);

  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient) {}

  async create(userId: string, input: CreateReminderInput): Promise<LocationReminder> {
    // Una sola forma de fila para las dos ramas (en vez de un union de dos
    // literales): con `SupabaseClient` sin schema generado, un insert()
    // tipado con un union de objetos de forma distinta confunde la
    // sobrecarga de `insert()`. Los campos que no aplican a cada `kind`
    // quedan en `null`/default, que es justo lo que la tabla espera.
    const insertRow: {
      user_id: string;
      kind: "location" | "note";
      message: string;
      latitude: number | null;
      longitude: number | null;
      // NOT NULL con default 300 en la tabla — para "note" se manda el
      // default explícito (columna no usada por ese `kind`, pero la
      // columna sigue siendo NOT NULL).
      radius_meters: number;
      label: string | null;
      title: string | null;
      is_task: boolean;
      remind_at: string | null;
    } =
      input.kind === "location"
        ? {
            user_id: userId,
            kind: "location",
            message: input.message,
            latitude: input.latitude,
            longitude: input.longitude,
            radius_meters: input.radiusMeters ?? DEFAULT_RADIUS_METERS,
            label: input.label ?? null,
            title: null,
            is_task: false,
            remind_at: null,
          }
        : {
            user_id: userId,
            kind: "note",
            message: input.message,
            latitude: null,
            longitude: null,
            radius_meters: DEFAULT_RADIUS_METERS,
            label: null,
            title: input.title ?? null,
            is_task: input.isTask ?? false,
            remind_at: input.remindAt ?? null,
          };

    const { data, error } = await this.supabase
      .from("location_reminders")
      .insert(insertRow)
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

  /**
   * Forma reducida para poblar `ReminderCacheService` — solo lo necesario
   * para evaluar el geofence. Filtra explícitamente `kind = "location"`:
   * las notas/tareas (`kind: "note"`) no tienen coordenadas y nunca deben
   * entrar al hot path de geofence de `GeofenceTriggerService`.
   */
  async listPendingForCache(userId: string): Promise<CachedReminder[]> {
    const { data, error } = await this.supabase
      .from("location_reminders")
      .select("id, message, latitude, longitude, radius_meters")
      .eq("user_id", userId)
      .eq("kind", "location")
      .eq("status", "pending");

    if (error) {
      this.logger.error(`listPendingForCache(${userId}): ${error.message}`);
      throw error;
    }

    return (
      (data ?? []) as Array<Pick<LocationReminderRow, "id" | "message" | "latitude" | "longitude" | "radius_meters">>
    ).map((row) => ({
      id: row.id,
      message: row.message,
      // Seguro por el .eq("kind", "location") de arriba: solo esas filas
      // tienen coordenadas garantizadas (constraint `location_requires_coords`).
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      radiusMeters: row.radius_meters as number,
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

  /**
   * Equivalente de `markTriggered` para notas con hora fija (ADR-0030):
   * mismo patrón idempotente (`WHERE status = 'pending'`), pero además
   * `SELECT`+`.maybeSingle()` en una sola llamada — así
   * `NoteReminderProcessor` sabe en un solo round-trip si debe notificar
   * (fila devuelta) o no hacer nada (`null`: ya se había cancelado/borrado
   * entre que BullMQ encoló el job y que disparó).
   */
  async markNoteReminderTriggered(userId: string, reminderId: string): Promise<LocationReminder | null> {
    const { data, error } = await this.supabase
      .from("location_reminders")
      .update({ status: "triggered", triggered_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", reminderId)
      .eq("kind", "note")
      .eq("status", "pending")
      // Defensa adicional (no solo `status`): completar o archivar una
      // nota NO cambia su `status` (ese campo solo lo mueve el flujo de
      // ubicación/geofence) — sin este filtro, una nota ya completada o
      // archivada igual dispararía su aviso si el job de BullMQ no
      // alcanzó a cancelarse a tiempo.
      .is("completed_at", null)
      .is("archived_at", null)
      .select(REMINDER_COLUMNS)
      .maybeSingle();

    if (error) {
      this.logger.error(`markNoteReminderTriggered(${userId}, ${reminderId}): ${error.message}`);
      throw error;
    }

    return data ? toLocationReminder(data) : null;
  }

  /**
   * Programa, reprograma o quita (`remindAt: null`) la hora fija de aviso de
   * una nota. Devuelve la fila actualizada para que el llamador (el
   * controller) pueda encolar/cancelar el job de BullMQ correspondiente sin
   * una segunda consulta.
   */
  async scheduleReminder(userId: string, id: string, remindAt: string | null): Promise<LocationReminder> {
    const { data, error } = await this.supabase
      .from("location_reminders")
      .update({ remind_at: remindAt })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("kind", "note")
      .select(REMINDER_COLUMNS)
      .single();

    if (error) {
      this.logger.error(`scheduleReminder(${userId}, ${id}): ${error.message}`);
      throw error;
    }

    return toLocationReminder(data);
  }

  /** Cancela un recordatorio de ubicación pendiente (deja de evaluarse en el geofence). */
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

  /** Edita título/cuerpo de una nota (autoguardado — mismo patrón que tenía el mock local). */
  async updateText(userId: string, id: string, patch: { title?: string | null; message?: string }): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update["title"] = patch.title;
    if (patch.message !== undefined) update["message"] = patch.message;
    if (Object.keys(update).length === 0) return;

    const { error } = await this.supabase.from("location_reminders").update(update).eq("user_id", userId).eq("id", id);

    if (error) {
      this.logger.error(`updateText(${userId}, ${id}): ${error.message}`);
      throw error;
    }
  }

  async setIsTask(userId: string, id: string, isTask: boolean): Promise<void> {
    // Al desmarcar "es tarea" también se limpia completed_at — una nota
    // simple no tiene estado de tarea que mostrar.
    const { error } = await this.supabase
      .from("location_reminders")
      .update({ is_task: isTask, completed_at: isTask ? undefined : null })
      .eq("user_id", userId)
      .eq("id", id);

    if (error) {
      this.logger.error(`setIsTask(${userId}, ${id}): ${error.message}`);
      throw error;
    }
  }

  async setTaskCompleted(userId: string, id: string, completed: boolean): Promise<void> {
    const { error } = await this.supabase
      .from("location_reminders")
      .update({ completed_at: completed ? new Date().toISOString() : null })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("is_task", true);

    if (error) {
      this.logger.error(`setTaskCompleted(${userId}, ${id}): ${error.message}`);
      throw error;
    }
  }

  async setArchived(userId: string, id: string, archived: boolean): Promise<void> {
    const { error } = await this.supabase
      .from("location_reminders")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("user_id", userId)
      .eq("id", id);

    if (error) {
      this.logger.error(`setArchived(${userId}, ${id}): ${error.message}`);
      throw error;
    }
  }

  /**
   * Borrado permanente — cualquier `kind`. Antes solo aplicaba a notas
   * (`.eq("kind", "note")`): los recordatorios de ubicación solo se podían
   * "cancelar" (`cancel()`, soft — conserva el historial de geofence), sin
   * forma real de quitarlos de la lista. Bug real reportado 2026-09-01 por
   * el fundador: cancelar no los hacía desaparecer (`status: "cancelled"`
   * seguía visible en la libreta) y pidió explícitamente un botón para
   * "borrar del todo". El caller (`LocationRemindersController`) es
   * responsable de invalidar `ReminderCacheService` tras esto — un
   * recordatorio de ubicación pendiente borrado sin invalidar el caché de
   * Redis seguiría disparando el geofence desde una copia vieja.
   */
  async remove(userId: string, id: string): Promise<void> {
    const { error } = await this.supabase
      .from("location_reminders")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);

    if (error) {
      this.logger.error(`remove(${userId}, ${id}): ${error.message}`);
      throw error;
    }
  }
}
