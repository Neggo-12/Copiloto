import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import type { LocationState, NormalizedLocation } from "./location.types";

/** Después de cuánto tiempo sin reporte se considera que se perdió la señal (GPS o red). */
const STALE_AFTER_MS = 30_000;
/** Limpieza dura en Redis si el usuario queda desconectado por mucho tiempo — evita acumular claves huérfanas. */
const REDIS_KEY_TTL_SECONDS = 300;

function stateKey(userId: string): string {
  return `location:current:${userId}`;
}

/**
 * Estado "caliente" del Location Engine: última posición conocida por
 * usuario, en Redis (nunca en Postgres — eso es para persistencia/histórico
 * según política de retención, regla de CLAUDE.md §7). Todavía no existe un
 * consumidor real de histórico (eso llega con Emergency Corridor tracking en
 * Fase 3), así que no se crea una tabla de PostGIS todavía — se deja
 * documentado como decisión explícita, no como olvido.
 */
@Injectable()
export class LocationStateService {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: Redis) {}

  async getCurrent(userId: string): Promise<LocationState | null> {
    const raw = await this.redis.get(stateKey(userId));
    if (!raw) return null;

    const location = JSON.parse(raw) as NormalizedLocation;
    const stale = Date.now() - location.serverTimestamp > STALE_AFTER_MS;
    return { location, stale };
  }

  async setCurrent(location: NormalizedLocation): Promise<void> {
    await this.redis.set(stateKey(location.userId), JSON.stringify(location), "EX", REDIS_KEY_TTL_SECONDS);
  }
}
