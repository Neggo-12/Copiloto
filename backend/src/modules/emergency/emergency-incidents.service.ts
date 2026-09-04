import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";

export type IncidentStatus = "creado" | "recibido" | "en_atencion" | "cancelado" | "cerrado";
export type IncidentConfidence = "alta" | "media" | "baja";

export interface CreatePoliceIncidentInput {
  userId: string;
  latitude: number;
  longitude: number;
  locationAccuracyMeters: number | null;
  confidenceLevel: IncidentConfidence;
}

/** Fila completa, con los datos reales del usuario ya incluidos (foto tomada al crear el incidente — ver comentario de la migración). */
export interface EmergencyIncident {
  id: string;
  userId: string;
  type: "policia";
  status: IncidentStatus;
  confidenceLevel: IncidentConfidence;
  latitude: number;
  longitude: number;
  locationAccuracyMeters: number | null;
  device: string;
  snapshotDisplayName: string;
  snapshotPhone: string | null;
  snapshotEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Forma cruda de la fila tal como la devuelve Supabase. */
interface EmergencyIncidentRow {
  id: string;
  user_id: string;
  type: "policia";
  status: IncidentStatus;
  confidence_level: IncidentConfidence;
  latitude: number;
  longitude: number;
  location_accuracy_meters: number | null;
  device: string;
  snapshot_display_name: string;
  snapshot_phone: string | null;
  snapshot_email: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: EmergencyIncidentRow): EmergencyIncident {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    status: row.status,
    confidenceLevel: row.confidence_level,
    latitude: row.latitude,
    longitude: row.longitude,
    locationAccuracyMeters: row.location_accuracy_meters,
    device: row.device,
    snapshotDisplayName: row.snapshot_display_name,
    snapshotPhone: row.snapshot_phone,
    snapshotEmail: row.snapshot_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Envuelve `emergency_incidents` (ver
 * supabase/migrations/20260903190000_emergency_incidents.sql y
 * docs/decisions/README.md decisión (33) — paquete de datos real ya
 * definido en la documentación propia de "Copiloto versión 2", no en
 * ninguna API pública). Mismo patrón real que `EmergencyVehiclesService`:
 * usa el cliente admin (bypassa RLS) porque la autorización real ya pasó
 * por `SupabaseAuthGuard`/la tool antes de llegar aquí — nunca por RLS del
 * cliente (CLAUDE.md §5).
 */
@Injectable()
export class EmergencyIncidentsService {
  private readonly logger = new Logger(EmergencyIncidentsService.name);

  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient) {}

  /**
   * Crea el incidente SIEMPRE con una foto real del nombre/teléfono/correo
   * de la cuenta al momento de crearlo (no una referencia que cambie si la
   * persona edita su perfil después — mismo criterio de evidencia que el
   * resto del dominio Emergency). `profiles.display_name` es el único campo
   * de identidad real que existe hoy (ver decisión (33): no hay
   * nombre/apellido separados en el esquema todavía) — se guarda tal cual.
   */
  async createPoliceIncident(input: CreatePoliceIncidentInput): Promise<EmergencyIncident> {
    const { data: profile, error: profileError } = await this.supabase
      .from("profiles")
      .select("display_name, phone, phone_country_code, email")
      .eq("id", input.userId)
      .maybeSingle();
    if (profileError) {
      this.logger.error(`createPoliceIncident/profile(${input.userId}): ${profileError.message}`);
      throw profileError;
    }

    const snapshotPhone =
      profile?.phone && typeof profile.phone === "string"
        ? `${(profile.phone_country_code as string | null) ?? ""} ${profile.phone}`.trim()
        : null;

    const insertResult = await this.supabase
      .from("emergency_incidents")
      .insert({
        user_id: input.userId,
        type: "policia",
        status: "creado",
        confidence_level: input.confidenceLevel,
        latitude: input.latitude,
        longitude: input.longitude,
        location_accuracy_meters: input.locationAccuracyMeters,
        device: "app_movil",
        snapshot_display_name: (profile?.display_name as string | null) ?? "Usuario",
        snapshot_phone: snapshotPhone,
        snapshot_email: (profile?.email as string | null) ?? null,
      })
      .select("*")
      .single();
    if (insertResult.error) {
      this.logger.error(`createPoliceIncident/insert(${input.userId}): ${insertResult.error.message}`);
      throw insertResult.error;
    }

    return mapRow(insertResult.data as EmergencyIncidentRow);
  }

  /** Todos los incidentes reales, más recientes primero — para el panel de administrador (`GET /emergency/admin/incidents`, mismo patrón real que `EmergencyVehiclesService.listAll()`). */
  async listAll(): Promise<EmergencyIncident[]> {
    const { data, error } = await this.supabase
      .from("emergency_incidents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      this.logger.error(`listAll(): ${error.message}`);
      throw error;
    }
    return ((data ?? []) as EmergencyIncidentRow[]).map(mapRow);
  }
}
