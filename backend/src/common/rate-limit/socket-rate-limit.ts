import type { Redis } from "ioredis";

/**
 * Rate limiting real para handlers de WebSocket (`@SubscribeMessage`) —
 * `RateLimitModule`/`UserAwareThrottlerGuard` (el `APP_GUARD` global de todo
 * el resto de la API) NO protege estos handlers: verificado con evidencia
 * real armando una app NestJS + Redis + `socket.io-client` reales, ver
 * ADR-0036. Mismo mecanismo real de contador de ventana fija que ya usa el
 * resto del proyecto para dedup/cooldown (`SET NX EX` en
 * `AlertPolicyService`/`EmergencyCorridorService`), no una librería nueva —
 * `INCR` es atómico en Redis, así que no hay condición de carrera entre dos
 * mensajes casi simultáneos del mismo usuario.
 *
 * Devuelve `true` si el mensaje entra dentro del límite (debe procesarse),
 * `false` si se pasó (debe descartarse SIN cerrar el socket — un pico
 * pasajero de tráfico real, como una ráfaga de reportes de GPS atrasados que
 * se vacían juntos al reconectar, ADR-0022 Escenario 6, no es un ataque; solo
 * un cliente roto o malicioso mandando MUY por encima de cualquier cadencia
 * real sostenida debería toparse con esto).
 */
export async function checkSocketRateLimit(redis: Redis, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) {
    // Recién creada esta ventana — le pone TTL una sola vez (evita pisar el
    // TTL real en cada mensaje, que dejaría la ventana "deslizándose" para
    // siempre en vez de ser una ventana fija real).
    await redis.expire(key, windowSeconds);
  }
  return count <= limit;
}
