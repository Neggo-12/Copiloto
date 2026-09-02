/**
 * CORS real para los gateways de WebSocket — ver ADR-0040. Hallazgo
 * pendiente desde ADR-0036: ambos gateways (`LocationGateway`,
 * `AssistantVoiceGateway`) usaban `cors: { origin: "*" }` fijo, en TODOS
 * los ambientes (a diferencia del CORS HTTP real de `main.ts`, que ya
 * distinguía desarrollo/producción).
 *
 * Por qué esto lee `process.env` directamente en vez de `ConfigService`
 * (a diferencia del resto del proyecto): el objeto que pasa el decorador
 * `@WebSocketGateway({ cors: ... })` se evalúa en el momento en que Node
 * IMPORTA el archivo del gateway — mucho antes de que `ConfigModule.forRoot()`
 * corra. Confirmado leyendo el orden real de imports de `app.module.ts`:
 * `LocationModule` (que importa `LocationGateway`) aparece en la lista de
 * `imports` del `@Module` de `AppModule`, así que Node ya evaluó por
 * completo ese archivo (y por lo tanto ya corrió el decorador
 * `@WebSocketGateway`) ANTES de que el propio decorador `@Module` de
 * `AppModule` se ejecute — que es lo que realmente llama a
 * `ConfigModule.forRoot()`. Usar `ConfigService` aquí simplemente no
 * funcionaría: en el momento en que se necesita el valor, el módulo de
 * configuración todavía no existe.
 *
 * Esto es seguro en producción real SOLO si `NODE_ENV`/`CORS_ORIGIN` los
 * pone la plataforma de hosting directo en el proceso (Railway/Render/Fly/etc,
 * antes de que Node arranque) — NO si dependen de que este backend lea el
 * archivo `.env` con `dotenv` (eso sí pasa demasiado tarde, recién dentro de
 * `ConfigModule.forRoot()`). En desarrollo local esto no importa: sin
 * `CORS_ORIGIN` real todavía, se usa el mismo permisivo `origin: true` que
 * ya usa el CORS HTTP de `main.ts` en desarrollo.
 */
export function resolveWebSocketCorsOrigin(): boolean | string[] {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const configured = process.env.CORS_ORIGIN;
  if (!configured) {
    // Producción sin un dominio real todavía configurado: falla CERRADO
    // (deshabilitado), nunca abierto ("*") — mismo criterio que ya aplica
    // `main.ts` para el CORS HTTP ("deshabilitado hasta que exista un
    // dominio real que restringir explícitamente").
    return false;
  }

  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
