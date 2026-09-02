# ADR-0036: Fase 8 (Hardening) — los gateways de WebSocket no tenían rate limiting real

- Fecha: 2026-09-02
- Estado: **corregido el mismo día** — el fundador delegó explícitamente los límites reales ("quiero que tomes tú la decisión y toma la mejor"), mismo criterio ya usado para `MIN_BUFFER_METERS`/`MAX_BUFFER_METERS` (ADR-0021). Ver "Corrección real" abajo.

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

## Por qué no se podía corregir con un decorador

Como `@nestjs/throttler` no llega a los gateways (confirmado arriba), la
corrección real no podía ser "agregar un decorador" — necesitaba un chequeo
manual con Redis dentro de cada handler.

## Corrección real

Nuevo helper genérico, `checkSocketRateLimit` (`common/rate-limit/socket-rate-limit.ts`)
— mismo patrón real de contador de ventana fija que ya usa el resto del
proyecto para dedup/cooldown (`SET NX EX`/`INCR EX` en
`AlertPolicyService`/`EmergencyCorridorService`), no una librería nueva:
`redis.incr(key)` (atómico) + `EXPIRE` solo la primera vez que la ventana se
crea. Devuelve `true`/`false`, nunca lanza ni cierra el socket — un pico de
tráfico real se descarta en silencio (el cliente reintenta su próximo
mensaje normal), nunca amerita desconectar a nadie.

Límites reales elegidos (el fundador delegó la decisión explícitamente — "la
decisión se la dejo a usted, tome la mejor", mismo criterio de ADR-0021 para
el buffer dinámico), generosos a propósito: el objetivo es frenar un cliente
roto o malicioso, nunca tráfico legítimo real, así que cada número se eligió
muy por encima de la cadencia real esperada:

- **`location:update`: 100 mensajes / 10s por usuario.** Un reporte GPS real
  en navegación activa típicamente llega cada 1-3s (≈20-60/min) — 100/10s
  (600/min equivalente, pero como ventana corta también tolera una ráfaga
  real de hasta 100 de golpe) deja margen de sobra incluso para una
  reconexión real que vacía de un tirón una cola de reportes atrasados (caso
  YA verificado con evidencia real en el Escenario 6, ADR-0022 — "una
  ráfaga... todos aceptados"): este fix no debía romper ese comportamiento
  ya correcto.
- **`voice:text`: 10 mensajes / 10s por usuario.** Un turno de texto es una
  acción humana discreta (escribir/dictar una pregunta) — nadie manda más de
  un puñado de turnos reales en 10s.
- **`voice:audio-chunk`: 50 mensajes / 5s por usuario.** Streaming real de
  micrófono manda varios chunks por segundo de por sí — un límite estricto
  rompería uso legítimo; 50/5s (10/s) da margen de sobra sobre cualquier
  cadencia real de micrófono, y solo ataja un cliente mandando muchísimo más
  rápido que cualquier audio real.
- **A lo sumo 1 sesión real de Gemini Live activa por usuario**, para el
  vector de costo (no de frecuencia) identificado en el hallazgo: cada
  sesión tiene costo real. Si el mismo usuario abre una conexión nueva
  (reconexión real por red perdida/app en background) mientras ya tenía una
  activa, `AssistantVoiceGateway.handleConnection` cierra la VIEJA (le manda
  `voice:closed` con `reason: "replaced_by_new_connection"` y la
  desconecta) antes de abrir la nueva — nunca deja sesiones huérfanas
  facturando en paralelo. Tracking en memoria (`Map<userId, socket>`), no en
  Redis a propósito: la sesión es un objeto vivo atado a este proceso, no
  algo que deba sobrevivir un reinicio ni compartirse entre instancias.

No se tocó `cors: { origin: "*"}` en este cambio — queda como el único punto
realmente pendiente de esta ADR, de menor severidad (la autenticación real
sigue siendo el token, no el origen), a resolver cuando exista un dominio de
producción real que restringir (mismo criterio que ya aplica `main.ts` para
CORS HTTP).

## Verificación

Con Redis real, 12/12 casos: `checkSocketRateLimit` permite exactamente el
límite y bloquea de ahí en adelante, con TTL real puesto en la clave, y
vuelve a permitir pasada la ventana real; `LocationGateway.handleLocationUpdate`
real (instanciado directo, mismo patrón de los Escenarios 10-12, único fake
Supabase por falta de credenciales en este sandbox) acepta exactamente 100
de 101 reportes reales seguidos y descarta el 101 con `rateLimited: true`
sin tocar el estado guardado; `AssistantVoiceGateway.handleText`/
`handleAudioChunk` reales aceptan exactamente el límite y descartan el
resto sin llegar a Gemini; conectar un socket nuevo del mismo usuario cierra
de verdad el socket viejo (`voice:closed` real + `disconnect`) y dos
conexiones nunca quedan activas en paralelo. `typecheck`/`lint`/`build` del
backend completo limpios. Scripts throwaway (`verify-ws-throttle.ts` del
hallazgo original y `verify-ws-rate-limit-fix.ts` de esta corrección),
borrados tras la corrida, no comiteados.

## Referencias

- `docs/decisions/04_ROADMAP_Y_ALCANCE.md` (Etapa 8 — Hardening)
- `docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md` (Fase 8)
- `backend/src/common/rate-limit/rate-limit.module.ts`, `backend/src/common/guards/user-aware-throttler.guard.ts`
- `backend/src/common/rate-limit/socket-rate-limit.ts` (helper real nuevo — `checkSocketRateLimit`)
- `backend/src/modules/location/location.gateway.ts`, `backend/src/modules/assistant/assistant-voice.gateway.ts`
- `docs/decisions/ADR-0021-corridor-dynamic-buffer-severity.md` (mismo criterio de decisión delegada al fundador, "tome la mejor")
