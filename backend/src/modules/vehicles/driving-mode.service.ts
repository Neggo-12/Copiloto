import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import type { VehicleType } from "./vehicles.types";

/**
 * Cuánto dura el modo de manejo seleccionado antes de "olvidarse" solo si
 * nadie lo cambia. No es una sesión de viaje (eso ya lo cubre
 * `RouteSessionService`, TTL 4h) — es más parecido a una preferencia del
 * día ("hoy ando en la moto"), pero sigue siendo estado caliente, no
 * identidad persistente (esa vive en `user_vehicles`, Postgres). 24h cubre
 * un día completo con margen; pasado ese tiempo sin actividad, la app
 * simplemente vuelve a preguntar — que es el comportamiento correcto
 * pedido por el fundador ("o que la misma app identifique y el asistente
 * le pregunte"), no un bug. Valor inicial, ajustable con evidencia real de
 * uso (mismo criterio que `SESSION_TTL_SECONDS` en `RouteSessionService`).
 */
const DRIVING_MODE_TTL_SECONDS = 24 * 60 * 60;

function drivingModeKey(userId: string): string {
  return `driving:mode:${userId}`;
}

@Injectable()
export class DrivingModeService {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async set(userId: string, vehicleType: VehicleType): Promise<void> {
    await this.redis.set(drivingModeKey(userId), vehicleType, "EX", DRIVING_MODE_TTL_SECONDS);
  }

  async get(userId: string): Promise<VehicleType | null> {
    const value = await this.redis.get(drivingModeKey(userId));
    return value === "car" || value === "motorcycle" ? value : null;
  }

  async clear(userId: string): Promise<void> {
    await this.redis.del(drivingModeKey(userId));
  }
}
