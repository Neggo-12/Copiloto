import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import type { UserVehicle, VehicleType } from "./vehicles.types";

interface UserVehicleRow {
  id: string;
  vehicle_type: VehicleType;
  plate: string;
  nickname: string | null;
  created_at: string;
  updated_at: string;
}

function toUserVehicle(row: UserVehicleRow): UserVehicle {
  return {
    id: row.id,
    vehicleType: row.vehicle_type,
    plate: row.plate,
    nickname: row.nickname,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Envuelve `user_vehicles` (migración `user_vehicles`, ver ADR-0014). A
 * diferencia de `emergency_vehicles`, este registro es autoservicio: el
 * propio usuario registra sus placas, sin verificación externa. Usa el
 * cliente admin (bypassa RLS) por el mismo motivo que
 * `EmergencyVehiclesService`: el backend ya autorizó al usuario vía
 * `SupabaseAuthGuard`, y cada query aquí filtra explícitamente por
 * `user_id` — la autorización real pasa por la aplicación; el RLS de la
 * tabla queda como defensa en profundidad para cualquier acceso directo
 * futuro (p.ej. `proyecto-mensajeria` hablando con Supabase directo).
 */
@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(@Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient) {}

  async list(userId: string): Promise<UserVehicle[]> {
    const { data, error } = await this.supabase
      .from("user_vehicles")
      .select("id, vehicle_type, plate, nickname, created_at, updated_at")
      .eq("user_id", userId)
      .order("vehicle_type", { ascending: true });

    if (error) {
      this.logger.error(`list(${userId}): ${error.message}`);
      throw error;
    }

    return ((data ?? []) as UserVehicleRow[]).map(toUserVehicle);
  }

  /**
   * Registra o actualiza el vehículo de ese tipo para el usuario (a lo sumo
   * uno por tipo). Upsert explícito: desde el punto de vista del usuario,
   * "registrar mi carro por primera vez" y "corregir la placa de mi carro"
   * son la misma operación.
   */
  async upsert(userId: string, vehicleType: VehicleType, plate: string, nickname: string | null): Promise<UserVehicle> {
    const normalizedPlate = plate.trim().toUpperCase();
    if (!normalizedPlate) {
      throw new Error("plate no puede estar vacío");
    }

    const { data, error } = await this.supabase
      .from("user_vehicles")
      .upsert(
        {
          user_id: userId,
          vehicle_type: vehicleType,
          plate: normalizedPlate,
          nickname: nickname ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,vehicle_type" },
      )
      .select("id, vehicle_type, plate, nickname, created_at, updated_at")
      .single();

    if (error) {
      this.logger.error(`upsert(${userId}, ${vehicleType}): ${error.message}`);
      throw error;
    }

    return toUserVehicle(data);
  }

  async remove(userId: string, vehicleType: VehicleType): Promise<void> {
    const { error } = await this.supabase.from("user_vehicles").delete().eq("user_id", userId).eq("vehicle_type", vehicleType);

    if (error) {
      this.logger.error(`remove(${userId}, ${vehicleType}): ${error.message}`);
      throw error;
    }
  }
}
