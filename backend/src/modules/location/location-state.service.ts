import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import type { LatLng } from "../../common/geo/types";
import type { LocationState, NormalizedLocation } from "./location.types";

/**
 * Después de cuánto tiempo sin reporte se considera que se perdió la señal
 * (GPS o red). Exportada (no solo interna) para que otros consumidores
 * (`EmergencyCorridorService`) puedan citar el mismo número real en logs en
 * vez de duplicarlo — ver Escenario 6 del simulador, "GPS atrasado".
 */
export const STALE_AFTER_MS = 30_000;
/** Limpieza dura en Redis si el usuario queda desconectado por mucho tiempo — evita acumular claves huérfanas. */
const REDIS_KEY_TTL_SECONDS = 300;
/** Índice geoespacial (Redis GEO) de posiciones actuales — un único sorted set, no una clave por usuario. */
const GEO_INDEX_KEY = "location:geo";

function stateKey(userId: string): string {
  return `location:current:${userId}`;
}

export interface NearbyUser {
  userId: string;
  distanceMeters: number;
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
    await this.redis.geoadd(GEO_INDEX_KEY, location.longitude, location.latitude, location.userId);
  }

  /**
   * Usuarios dentro de un radio de un punto, usando el índice geoespacial de
   * Redis (`GEOSEARCH`, Redis 6.2+, disponible en Upstash). Elegido sobre
   * PostGIS a propósito: es posición "caliente" de segundos, no histórico
   * persistente — mismo principio que ya rige `LocationStateService`
   * (Redis = estado efímero, Postgres = verdad persistente).
   *
   * Limitación real de Redis: los miembros de un GEO set no expiran
   * individualmente (a diferencia de `location:current:<userId>`, que sí
   * tiene TTL). Por eso cada candidato se revalida contra su estado real
   * antes de devolverlo — un usuario que dejó de reportar hace rato no debe
   * aparecer como "cerca" solo porque su última posición sigue en el índice.
   */
  async findNearby(center: LatLng, radiusMeters: number): Promise<NearbyUser[]> {
    const raw = (await this.redis.geosearch(
      GEO_INDEX_KEY,
      "FROMLONLAT",
      center.longitude,
      center.latitude,
      "BYRADIUS",
      radiusMeters,
      "m",
      "ASC",
      "WITHDIST",
    )) as [string, string][];

    const results: NearbyUser[] = [];
    for (const [userId, distanceStr] of raw) {
      const current = await this.getCurrent(userId);
      if (!current || current.stale) continue;
      results.push({ userId, distanceMeters: Number(distanceStr) });
    }
    return results;
  }
}
