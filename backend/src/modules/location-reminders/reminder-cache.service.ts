import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import { LocationRemindersService } from "./location-reminders.service";
import type { CachedReminder } from "./location-reminders.types";

/**
 * Cuánto dura la lista cacheada de recordatorios pendientes de un usuario
 * antes de refrescarse sola si nadie la invalida explícitamente. Es una red
 * de seguridad, no el mecanismo principal de frescura — cada
 * create/cancel/trigger invalida la caché de inmediato (`invalidate`/
 * `refresh`). Mismo criterio que `DrivingModeService`: si por algún bug la
 * caché quedara desincronizada, el peor caso es hasta 24h de espera para
 * autocorregirse en el próximo `location:update` (cache-miss → relee
 * Postgres), no una corrupción silenciosa permanente.
 */
const CACHE_TTL_SECONDS = 24 * 60 * 60;

function cacheKey(userId: string): string {
  return `reminders:pending:${userId}`;
}

/**
 * Por qué existe esta caché: `LocationGateway` recibe un `location:update`
 * de CADA usuario conectado, potencialmente cada 15-20s (cadencia
 * recomendada en ADR-0013). Consultar Postgres en cada uno de esos pings
 * para saber "¿tiene recordatorios pendientes?" es exactamente el costo que
 * ADR-0013 ya evitó para Alert Policy (por eso Alert Policy es pull, no
 * evaluación en cada `location:update` de cualquier usuario) — acá se evita
 * ese mismo costo con una caché Redis de lectura-a-través (Postgres sigue
 * siendo la fuente real), sin cambiar el patrón de disparo de
 * `location:update` que ya existe.
 */
@Injectable()
export class ReminderCacheService {
  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    private readonly reminders: LocationRemindersService,
  ) {}

  async getPending(userId: string): Promise<CachedReminder[]> {
    const cached = await this.redis.get(cacheKey(userId));
    if (cached !== null) {
      return JSON.parse(cached) as CachedReminder[];
    }
    return this.refresh(userId);
  }

  async refresh(userId: string): Promise<CachedReminder[]> {
    const pending = await this.reminders.listPendingForCache(userId);
    await this.redis.set(cacheKey(userId), JSON.stringify(pending), "EX", CACHE_TTL_SECONDS);
    return pending;
  }

  async invalidate(userId: string): Promise<void> {
    await this.redis.del(cacheKey(userId));
  }
}
