import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { EnvConfig } from "../../config/env.validation";

export const REDIS_CONNECTION = Symbol("REDIS_CONNECTION");

/**
 * Conexión única de Redis compartida por toda la app. Este es el ÚNICO lugar
 * que conoce detalles del proveedor (hoy: Upstash, vía REDIS_URL con esquema
 * `rediss://` que activa TLS automáticamente en ioredis). Migrar de Upstash a
 * Redis Cloud/self-hosted en el futuro es cambiar esta variable de entorno,
 * nada de código — mismo principio que SupabaseModule con Supabase.
 *
 * `maxRetriesPerRequest: null` es obligatorio para BullMQ (si no, lanza una
 * excepción al pasarle la conexión a un Worker) — confirmado en la
 * documentación oficial de BullMQ (docs.bullmq.io/guide/connections).
 * `keyPrefix` deliberadamente NO se usa aquí: BullMQ tiene su propio
 * mecanismo de prefijo y la documentación oficial advierte que no son
 * compatibles.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        return new Redis(config.get("REDIS_URL", { infer: true }), {
          maxRetriesPerRequest: null,
        });
      },
    },
  ],
  exports: [REDIS_CONNECTION],
})
export class RedisModule {}
