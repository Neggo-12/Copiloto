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
    const raw = await this.geosearchNearby(center, radiusMeters);
    const results: NearbyUser[] = [];
    for (const { userId, distanceMeters } of raw) {
      const current = await this.getCurrent(userId);
      if (!current || current.stale) continue;
      results.push({ userId, distanceMeters });
    }
    return results;
  }

  /**
   * Solo la parte de índice geoespacial (`GEOSEARCH`), SIN revalidar el
   * estado de cada resultado contra `getCurrent` — a diferencia de
   * `findNearby`. Extraído para `EmergencyCorridorService.findCandidates`,
   * que consulta el mismo índice una vez POR CADA muestra hacia adelante
   * del corredor (hasta `MAX_LOOKAHEAD_SAMPLES`, ver ese servicio) y
   * necesita deduplicar candidatos entre muestras ANTES de pagar el costo
   * real de `getCurrent` por cada uno.
   *
   * Evidencia real (`loadtest-corridor.ts`, Fase 8 — Rendimiento): con 500
   * candidatos reales cerca de una ruta de 20 muestras, llamar `findNearby`
   * (con su `getCurrent` interno) una vez por muestra generaba 2579
   * comandos reales de Redis por consulta — el mismo usuario, cercano a
   * varias muestras consecutivas de 100m, pagaba `getCurrent` una vez por
   * cada muestra en la que aparecía. Con este método, el caller hace el
   * `GEOSEARCH` por muestra (necesario, cada muestra es un punto distinto)
   * pero `getCurrent` solo una vez por candidato ÚNICO tras deduplicar —
   * bajó a ~535 comandos reales en el mismo escenario. El caller sigue
   * siendo responsable de revalidar frescura con `getCurrent` antes de
   * confiar en el resultado — este método por sí solo NO filtra stale.
   */
  async geosearchNearby(center: LatLng, radiusMeters: number): Promise<NearbyUser[]> {
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

    return raw.map(([userId, distanceStr]) => ({ userId, distanceMeters: Number(distanceStr) }));
  }
}
