# ADR-0036: Fase 8 (Hardening) — los gateways de WebSocket no tienen rate limiting real

- Fecha: 2026-09-02
- Estado: hallazgo documentado, **sin corregir todavía** — pendiente de decisión del fundador sobre los límites reales por canal (ver "Pendiente" abajo).

## Contexto

Con los 12 escenarios de simulación del corredor de emergencia completos
(ADR-0022), el cronograma (`05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md`)
señala la Fase 8 (Hardening + piloto controlado) como el siguiente paso — su
único bloqueo, "Fase 3 y 4 completas y estables", ya se cumple. El roadmap
maestro (`04_ROADMAP_Y_ALCANCE.md`, Etapa 8) lista explícitamente "WebSocket
security" (Seguridad) y "WebSocket scaling" (Rendimiento) como parte del
alcance de hardening.

Primer paso real de auditoría (Discover, antes de escribir cualquier código):
revisar los dos gateways reales del proyecto (`LocationGateway`,
`AssistantVoiceGateway`) contra esos dos criterios.

## Hallazgo real (verificado, no adivinado)

`RateLimitModule` (`@nestjs/throttler` + Redis real, `UserAwareThrottlerGuard`
registrado como `APP_GUARD` global) es el ÚNICO mecanismo de rate limiting de
todo el backend. Nunca se había verificado si protege también a los gateways
de WebSocket — ningún ADR ni escenario lo menciona.

Se armó una app NestJS real mínima (mismo `ThrottlerModule`/`UserAwareThrottlerGuard`
reales de `RateLimitModule`, Redis real corriendo local) con un gateway de
prueba, y se conectó con `socket.io-client` real (dos sockets reales
distintos, no mocks) para observar el comportamiento real:

1. Un guard de prueba (`CanActivate` con solo un `console.log`) registrado
   como `APP_GUARD` global **nunca se invocó** al emitir un mensaje real por
   `@SubscribeMessage("ping")` — confirmado de forma aislada, sin ninguna
   lógica de throttling de por medio.
2. Con el `UserAwareThrottlerGuard` REAL wireado igual que en
   `RateLimitModule`: **cero claves reales se crearon en Redis** tras enviar
   mensajes reales por el socket — la lógica de `storageService.increment()`
   nunca se ejecutó.
3. 65 mensajes reales enviados en ráfaga desde el MISMO socket (muy por
   encima del límite configurado de 60/min) — **los 65 pasaron sin ningún
   bloqueo real.**

**Conclusión verificada**: los guards registrados vía `APP_GUARD` global NO
se aplican a los handlers `@SubscribeMessage` de un gateway de WebSocket en
esta configuración (NestJS + `@nestjs/platform-socket.io`, adapter por
defecto, sin wiring adicional). Esto significa que, hoy:

- `LocationGateway.handleLocationUpdate` (`location:update`) — el reporte de
  GPS en tiempo real de CADA usuario conectado, potencialmente varias veces
  por segundo — no tiene ningún límite real de frecuencia.
- `AssistantVoiceGateway` (`voice:text`, `voice:audio-chunk`, `voice:audio-end`)
  — tampoco.

**Lo que SÍ sigue funcionando bien** (verificado en sesiones anteriores, no
afectado por este hallazgo): la AUTENTICACIÓN de ambos gateways no depende de
ningún guard — `handleConnection` verifica el token real contra Supabase
Auth (`supabase.auth.getUser(token)`) a mano, antes de aceptar cualquier
mensaje. Un socket sin token válido nunca llega a poder mandar
`location:update` ni nada más. Este hallazgo es sobre RATE LIMITING, no sobre
autorización.

## Hallazgo secundario, menor (mencionado, no corregido)

Ambos gateways usan `cors: { origin: "*" }`. Un WebSocket no está sujeto al
mismo mecanismo de same-origin policy que `fetch`/XHR, así que esto no es en
sí mismo la superficie de ataque principal (la autenticación real sigue
siendo el token, no el origen) — pero antes de producción real vale la pena
reemplazarlo por un origen explícito, mismo criterio que ya aplica
`main.ts` para CORS HTTP (`origin: true` solo en desarrollo, deshabilitado en
producción "hasta que exista un dominio real que restringir explícitamente").

## Por qué no se corrige en este mismo cambio

Elegir un límite real por canal es una decisión de producto, no algo para
adivinar:

- `location:update` real: la ambulancia consulta candidatos cada 5-10s
  (documentado en `EmergencyCorridorController`), pero el reporte de
  ubicación en sí (`location:update`) puede — y según
  `MISSING_CAPABILITIES.md` DEBE eventualmente — mandarse de forma continua
  mientras la app esté abierta, no solo durante navegación activa. Un límite
  mal elegido podría degradar la precisión del corredor real (menos
  frecuencia = detección más tardía de un candidato).
- `voice:audio-chunk`: tráfico legítimo de alta frecuencia durante una
  sesión de voz activa (chunks de audio real, no un evento esporádico) — un
  límite genérico de "N mensajes/minuto" pensado para HTTP no tiene sentido
  aplicado tal cual aquí.

Como `@nestjs/throttler` no llega a los gateways (confirmado arriba), la
corrección real no puede ser "agregar un decorador" — necesitaría un chequeo
manual con Redis (mismo patrón `SET NX EX`/`INCR EX` que ya usa
`AlertPolicyService`/`EmergencyCorridorService` en este proyecto, reusando
infraestructura ya real) dentro de cada handler, con un límite específico
por canal. Construir eso sin que el fundador defina los números reales sería
inventar un límite que después alguien tiene que deshacer o pelear —
"no adivines" aplica también a decisiones de producto, no solo a código.

## Pendiente (para decidir, no para adivinar)

1. ¿Cuál es un límite razonable real para `location:update` por usuario
   (mensajes/segundo o mensajes/minuto)? Referencia: un reporte GPS típico de
   apps de navegación es cada 1-5s en movimiento activo.
2. ¿`voice:audio-chunk` necesita un límite de frecuencia, o el límite natural
   ya lo impone el tamaño real de los chunks de audio del cliente (es decir,
   el riesgo real es abrir MUCHAS sesiones concurrentes, no mandar mensajes
   rápido dentro de una)? Relacionado: `AssistantVoiceGateway.handleConnection`
   abre una sesión real de Gemini Live (con costo real) por cada conexión
   aceptada, sin ningún límite de sesiones concurrentes por usuario —
   vector real de abuso de costo si un token real se filtra, evaluado aquí
   pero no corregido todavía por la misma razón (falta decidir el límite).
3. Reemplazar `cors: { origin: "*" }` por un origen real explícito antes de
   producción (mismo criterio ya aplicado a CORS HTTP en `main.ts`).

## Verificación

Script throwaway (`verify-ws-throttle.ts`, borrado tras la corrida, no
comiteado) — app NestJS real + Redis real + `socket.io-client` real,
confirmando los 3 puntos del hallazgo arriba. `typecheck`/`lint`/`build` del
backend no se tocaron (este cambio es solo de documentación — no se escribió
ningún fix todavía, a propósito).

## Referencias

- `docs/decisions/04_ROADMAP_Y_ALCANCE.md` (Etapa 8 — Hardening)
- `docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md` (Fase 8)
- `backend/src/common/rate-limit/rate-limit.module.ts`, `backend/src/common/guards/user-aware-throttler.guard.ts`
- `backend/src/modules/location/location.gateway.ts`, `backend/src/modules/assistant/assistant-voice.gateway.ts`
