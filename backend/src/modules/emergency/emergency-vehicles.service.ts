import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";

export interface EmergencyVehicleStatus {
  verified: boolean;
  active: boolean;
  vehicleType: string;
  plate: string;
  organization: string | null;
  verifiedAt: string | null;
}

/** Forma cruda de la fila tal como la devuelve la query de Supabase. */
interface EmergencyVehicleRow {
  verified: boolean;
  active: boolean;
  vehicle_type: string;
  plate: string;
  organization: string | null;
  verified_at: string | null;
}

/** Fila completa para la pantalla de administrador — incluye a quién pertenece (`driver_id`) y su nombre/teléfono reales, no solo el estado del propio conductor (a diferencia de `EmergencyVehicleStatus`). */
export interface AdminEmergencyVehicleRow {
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  plate: string;
  organization: string | null;
  verified: boolean;
  active: boolean;
  verifiedAt: string | null;
}

export interface AssignAmbulanceInput {
  phone: string;
  phoneCountryCode: string;
  plate: string;
  organization?: string;
}

/**
 * Envuelve la tabla `emergency_vehicles` (ver
 * supabase/migrations/20260818234636_emergency_authorization_layer.sql y
 * ADR-0006). Usa el cliente admin (bypassa RLS) porque el backend YA validó
 * quién es el usuario vía SupabaseAuthGuard — la autorización real pasa por
 * aquí, no por RLS del cliente, siguiendo CLAUDE.md §5: "La aplicación
 * autoriza, valida y ejecuta".
 */
@Injectable()
export class EmergencyVehiclesService {
  private readonly logger = new Logger(EmergencyVehiclesService.name);

  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient) {}

  async getStatusForDriver(driverId: string): Promise<EmergencyVehicleStatus | null> {
    const { data, error } = await this.supabase
      .from("emergency_vehicles")
      .select("verified, active, vehicle_type, plate, organization, verified_at")
      .eq("driver_id", driverId)
      .maybeSingle();

    if (error) {
      this.logger.error(`getStatusForDriver(${driverId}): ${error.message}`);
      throw error;
    }

    if (!data) return null;

    const row: EmergencyVehicleRow = data;

    return {
      verified: row.verified,
      active: row.active,
      vehicleType: row.vehicle_type,
      plate: row.plate,
      organization: row.organization,
      verifiedAt: row.verified_at,
    };
  }

  /**
   * Busca el `user_id` real del dueño de un teléfono — mismo criterio que
   * `MessagingService`: el administrador conoce el teléfono real de la
   * persona, no su UUID interno, así que la resolución pasa por aquí en vez
   * de exigir el id crudo en el formulario.
   */
  async resolveProfileIdByPhone(phone: string, phoneCountryCode: string): Promise<string | null> {
    const { data } = await this.supabase
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .eq("phone_country_code", phoneCountryCode)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }

  /** Todas las filas reales de `emergency_vehicles`, con nombre/teléfono del conductor ya resueltos — para la pantalla de administrador. */
  async listAll(): Promise<AdminEmergencyVehicleRow[]> {
    const { data, error } = await this.supabase
      .from("emergency_vehicles")
      .select("driver_id, vehicle_type, plate, organization, verified, active, verified_at")
      .order("created_at", { ascending: false });
    if (error) {
      this.logger.error(`listAll(): ${error.message}`);
      throw error;
    }

    const rows = (data ?? []) as {
      driver_id: string;
      vehicle_type: string;
      plate: string;
      organization: string | null;
      verified: boolean;
      active: boolean;
      verified_at: string | null;
    }[];
    if (rows.length === 0) return [];

    const driverIds = rows.map((row) => row.driver_id);
    const { data: profileRows } = await this.supabase
      .from("profiles")
      .select("id, display_name, phone, phone_country_code")
      .in("id", driverIds);
    const profileById = new Map(
      (profileRows ?? []).map((row) => [
        row.id as string,
        { name: row.display_name as string, phone: `${row.phone_country_code as string} ${row.phone as string}` },
      ]),
    );

    return rows.map((row) => ({
      driverId: row.driver_id,
      driverName: profileById.get(row.driver_id)?.name ?? "Usuario",
      driverPhone: profileById.get(row.driver_id)?.phone ?? "",
      vehicleType: row.vehicle_type,
      plate: row.plate,
      organization: row.organization,
      verified: row.verified,
      active: row.active,
      verifiedAt: row.verified_at,
    }));
  }

  /**
   * Verifica/asigna una ambulancia — operación administrativa real (nunca
   * autoservicio, ver ADR-0006: la RLS de `emergency_vehicles` no tiene
   * ninguna policy de insert/update para `authenticated`, así que esto SOLO
   * funciona con el cliente admin, como el resto de este servicio).
   * `upsert` con `onConflict: "driver_id"` porque un conductor tiene a lo
   * sumo un vehículo de emergencia asociado (constraint único real de la
   * tabla) — reasignar placa/tipo a alguien ya registrado actualiza la
   * misma fila en vez de fallar por duplicado.
   */
  async assignVerified(adminUserId: string, input: AssignAmbulanceInput): Promise<AdminEmergencyVehicleRow | { error: "driver_not_found" }> {
    const driverId = await this.resolveProfileIdByPhone(input.phone, input.phoneCountryCode);
    if (!driverId) return { error: "driver_not_found" };

    const nowIso = new Date().toISOString();
    const { error } = await this.supabase.from("emergency_vehicles").upsert(
      {
        driver_id: driverId,
        // Único valor real que acepta la tabla (`emergency_vehicles_vehicle_type_check`,
        // constraint real verificada contra el esquema — no hay otro tipo
        // todavía, así que no tiene sentido pedírselo al administrador).
        vehicle_type: "ambulance",
        plate: input.plate,
        organization: input.organization ?? null,
        verified: true,
        verified_by: adminUserId,
        verified_at: nowIso,
        active: true,
        updated_at: nowIso,
      },
      { onConflict: "driver_id" },
    );
    if (error) {
      this.logger.error(`assignVerified(${driverId}): ${error.message}`);
      throw error;
    }

    const all = await this.listAll();
    return all.find((row) => row.driverId === driverId) ?? { error: "driver_not_found" };
  }

  /** Activa/desactiva sin borrar el registro — mismo criterio que documenta ADR-0006 ("permite desactivar sin borrar historial/auditoría"). No toca `verified`: revocar la verificación es una acción explícita distinta, no implícita al desactivar. */
  async setActive(driverId: string, active: boolean): Promise<void> {
    const { error } = await this.supabase
      .from("emergency_vehicles")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("driver_id", driverId);
    if (error) {
      this.logger.error(`setActive(${driverId}): ${error.message}`);
      throw error;
    }
  }
}
