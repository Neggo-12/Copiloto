import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import type { ActiveRouteSession } from "./route-session.types";

/**
 * Cuánto dura una sesión de ruta activa en Redis antes de expirar sola si
 * nadie la cierra explícitamente (app cerrada, viaje abandonado). 4 horas
 * cubre cualquier trayecto real dentro de una ciudad con margen amplio; es
 * un valor inicial — se ajusta si la evidencia de uso real pide otra cosa.
 */
const SESSION_TTL_SECONDS = 4 * 60 * 60;

function sessionKey(userId: string): string {
  return `route:session:${userId}`;
}

/**
 * Estado "caliente" de qué ruta está siguiendo cada usuario ahora mismo — en
 * Redis, igual que `LocationStateService`, no en Postgres (no hay todavía un
 * consumidor real de histórico de viajes). Un usuario tiene como máximo una
 * ruta activa a la vez en este primer slice; múltiples rutas simultáneas no
 * tiene caso de uso real todavía.
 */
@Injectable()
export class RouteSessionService {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async start(userId: string, session: ActiveRouteSession): Promise<void> {
    await this.redis.set(sessionKey(userId), JSON.stringify(session), "EX", SESSION_TTL_SECONDS);
  }

  async getActive(userId: string): Promise<ActiveRouteSession | null> {
    const raw = await this.redis.get(sessionKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as ActiveRouteSession;
  }

  async clear(userId: string): Promise<void> {
    await this.redis.del(sessionKey(userId));
  }
}
