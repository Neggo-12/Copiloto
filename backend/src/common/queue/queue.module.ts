import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { REDIS_CONNECTION } from "../redis/redis.module";
import type { Redis } from "ioredis";

/**
 * Wrapper de BullMQ sobre la conexión compartida de RedisModule. Los
 * dominios importan `QueueModule` (o registran su propia cola con
 * `BullModule.registerQueue`) en vez de tocar `bullmq`/`ioredis`
 * directamente — mantiene el proveedor de colas encapsulado en
 * infraestructura, no filtrado en el dominio.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [REDIS_CONNECTION],
      useFactory: (connection: Redis) => ({ connection }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
