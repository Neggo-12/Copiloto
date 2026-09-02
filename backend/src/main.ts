import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { RedisIoAdapter } from "./common/websocket/redis-io.adapter";
import type { EnvConfig } from "./config/env.validation";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvConfig, true>);
  const nodeEnv = config.get("NODE_ENV", { infer: true });

  // WebSocket scaling real (ver ADR-0038, Etapa 8 — Rendimiento): sin esto,
  // `LocationGateway`/`AssistantVoiceGateway` solo entregan eventos
  // server-initiated (alertas reales del corredor de emergencia,
  // `LocationBroadcastService.notify`) a sockets conectados al MISMO
  // proceso de Node. Reusa la conexión real de Redis ya obligatoria para
  // arrancar el backend (`REDIS_CONNECTION`) — sin librería de cliente
  // Redis nueva.
  const redisIoAdapter = new RedisIoAdapter(app);
  redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // CORS solo en desarrollo, para que proyecto-mensajeria (Vite, puerto
  // variable por su detección de sandbox) pueda llamar a este backend desde
  // el navegador. `origin: true` refleja el origen de la petición — no hay
  // credenciales de cookie involucradas (el auth real va en el header
  // `Authorization: Bearer <token>`, no en cookies), así que no hace falta
  // `credentials: true`. En producción queda deshabilitado hasta que exista
  // un dominio real que restringir explícitamente.
  if (nodeEnv !== "production") {
    app.enableCors({ origin: true });
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
  console.log(`[backend] escuchando en :${port}`);
}

void bootstrap();
