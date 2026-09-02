import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import type { Server, ServerOptions } from "socket.io";
import { REDIS_CONNECTION } from "../redis/redis.module";

/**
 * Fase 8 (Rendimiento) — "WebSocket scaling", roadmap Etapa 8. Hallazgo real
 * (auditoría de `main.ts`, sin escenario de reproducción necesario — el gap
 * es estructural, no depende de carga): sin este adapter, Socket.IO usa su
 * adapter en memoria por defecto, así que `server.to(room).emit(...)`
 * (`LocationBroadcastService.notify`, usado por `AlertPolicyService` para
 * mandar alertas reales del corredor de emergencia) SOLO llega a sockets
 * conectados al MISMO proceso de Node — si el backend corre alguna vez con
 * más de una instancia (exactamente lo que dice el roadmap que hay que
 * soportar), un candidato conectado a la instancia B nunca recibiría una
 * alerta disparada por una ambulancia cuya petición HTTP cayó en la
 * instancia A, aunque el endpoint responda `notified: true` sin error — una
 * falla real y silenciosa, no un error visible.
 *
 * Verificado real contra la documentación oficial de `@socket.io/redis-adapter`
 * (github.com/socketio/socket.io-redis-adapter — soporta ioredis
 * explícitamente, no solo el paquete `redis` que usa el ejemplo oficial de
 * NestJS) antes de escribir esto — no se adivinó el API.
 *
 * Reusa la MISMA conexión real de Redis del proyecto (`REDIS_CONNECTION`,
 * ya obligatoria para arrancar el backend — ver `RedisModule`) vía
 * `.duplicate()` de ioredis, en vez de sumar una segunda librería de
 * cliente Redis (`redis`/node-redis, la que usa el ejemplo oficial de
 * NestJS) — REUSE explícito, misma configuración de conexión (incluye TLS
 * de Upstash) sin duplicar credenciales ni variables de entorno nuevas. Dos
 * conexiones nuevas (pub/sub) son obligatorias por el protocolo de Redis
 * pub/sub, que bloquea la conexión para cualquier otro comando mientras
 * está suscrita — no se puede compartir la conexión principal.
 *
 * Sin efecto real en una sola instancia (el caso de hoy, sin evidencia
 * todavía de despliegue multi-instancia — no hay Dockerfile/Procfile/etc.
 * en el repo): el mismo `server.to(room).emit()` sigue entregando local
 * igual que antes: el adapter de Redis solo AGREGA la publicación
 * cross-instancia, nunca cambia la entrega local. Se agrega ahora porque el
 * costo es bajo y reusa infraestructura ya obligatoria, y el roadmap ya
 * declara esta necesidad explícitamente — no es especulación sin evidencia.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(): void {
    const redis = this.app.get<Redis>(REDIS_CONNECTION);
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterConstructor as Parameters<Server["adapter"]>[0]);
    return server;
  }
}
