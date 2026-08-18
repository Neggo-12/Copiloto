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
}
