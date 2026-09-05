import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { EnvConfig } from "../../config/env.validation";

export const REDIS_CONNECTION = Symbol("REDIS_CONNECTION");

/**
 * Conexión única de Redis compartida por toda la app. Este es el ÚNICO lugar
 * que conoce detalles del proveedor (desde 2026-09-05: Redis provisionado
 * dentro del mismo proyecto de Railway que el backend — antes Upstash, migrado
 * por la cuota de comandos agotada, ver ADR-0008 y decisión (41) en
 * `docs/decisions/README.md`). `REDIS_URL` sigue siendo la única variable que
 * conoce al proveedor — cambiarlo de nuevo en el futuro es cambiar esa
 * variable de entorno, nada de código — mismo principio que SupabaseModule
 * con Supabase.
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
