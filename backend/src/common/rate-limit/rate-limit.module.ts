import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../redis/redis.module";
import { UserAwareThrottlerGuard } from "../guards/user-aware-throttler.guard";

/**
 * Rate limiting real de toda la API, aplicado como guard global. Usa el
 * mismo Redis compartido de siempre (`REDIS_CONNECTION`) como storage — NO
 * el storage en memoria por defecto de `@nestjs/throttler`, que se
 * desincroniza entre instancias si el backend algún día corre con más de un
 * proceso (mismo motivo que justificó Redis para `LocationStateService`,
 * `ReminderCacheService`, etc.).
 *
 * Límite por defecto (nombrado `"default"`): 60 peticiones/min, agrupadas
 * por usuario (`UserAwareThrottlerGuard`, no por IP — ver ese archivo).
 * Endpoints que cuestan dinero real (proxy de Google Maps en
 * `NavigationController`) o cómputo pesado (`SimulationController`) tienen
 * su propio límite más estricto vía `@Throttle({ default: {...} })` en su
 * propio controller — este módulo solo define el default global y el
 * guard, no toca controllers individuales.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CONNECTION],
      useFactory: (connection: Redis) => ({
        throttlers: [{ name: "default", ttl: 60_000, limit: 60 }],
        storage: new ThrottlerStorageRedisService(connection),
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: UserAwareThrottlerGuard }],
})
export class RateLimitModule {}
