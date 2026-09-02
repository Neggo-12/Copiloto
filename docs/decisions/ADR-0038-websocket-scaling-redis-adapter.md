# ADR-0038: Fase 8 (Rendimiento) — Socket.IO sin adapter de Redis, eventos server-initiated no cruzaban instancias

- Fecha: 2026-09-02
- Estado: **corregido el mismo día**, con evidencia real antes/después (dos servidores Socket.IO reales, Redis real, sockets reales de `socket.io-client`).

## Contexto

Siguiendo el bloque "Rendimiento" de la Fase 8 (`04_ROADMAP_Y_ALCANCE.md`,
Etapa 8), que lista explícitamente "WebSocket scaling" como parte del
alcance. Después de corregir el N+1 real de `findCandidates` (ADR-0037),
seguía sin auditar la parte de escalado horizontal.

## Hallazgo real (auditoría de código, confirmado con evidencia empírica)

`main.ts` arrancaba Socket.IO sin ningún adapter configurado — Socket.IO usa
por defecto su adapter en memoria, que solo conoce los sockets conectados
al MISMO proceso de Node.

`LocationBroadcastService.notify()` (el único mecanismo real de eventos
*server-initiated* del proyecto — lo usa `AlertPolicyService` para mandar
alertas reales del corredor de emergencia a un candidato) llama
`this.server.to(userId).emit(event, payload)`. Con el adapter en memoria,
esto solo entrega a un socket que esté conectado a la MISMA instancia que
procesó la petición HTTP que disparó la alerta (`GET /emergency/corridor/candidates`).

Si el backend corre alguna vez con más de una instancia detrás de un load
balancer — exactamente lo que "WebSocket scaling" implica que hay que
soportar — un candidato conectado a la instancia B nunca recibiría una
alerta real disparada por una ambulancia cuya petición cayó en la instancia
A. El endpoint HTTP responde `notified: true` igual (la lógica de
dedup/cooldown de `AlertPolicyService` no sabe nada de instancias, solo de
Redis), así que la falla es **silenciosa** — nadie ve un error, la alerta
simplemente nunca le llega al candidato equivocado.

Verificado con evidencia real, no solo lectura de código
(`verify-ws-scaling.ts`, throwaway): dos servidores Socket.IO reales en
puertos distintos (simulan dos procesos separados), un socket real de
`socket.io-client` conectado al servidor B y unido a su room (`user-42`,
mismo patrón real de `LocationGateway.handleConnection`), un evento
`corridor:alert` disparado con `server.to("user-42").emit(...)` en el
servidor A — **el socket del servidor B nunca lo recibió** (timeout real de
800ms, cero eventos).

## Corrección real

`RedisIoAdapter` (`common/websocket/redis-io.adapter.ts`) — extiende
`IoAdapter` de `@nestjs/platform-socket.io`, mismo patrón oficial de NestJS
(verificado contra `github.com/nestjs/nest/blob/master/sample/02-gateways/src/adapters/redis-io.adapter.ts`
antes de escribir código, no adivinado), con una diferencia deliberada: el
ejemplo oficial de NestJS usa el paquete `redis` (node-redis) para los
clientes pub/sub; este proyecto usa `ioredis` en todas partes
(`REDIS_CONNECTION`), así que se verificó primero (contra el README oficial
de `@socket.io/redis-adapter`, `github.com/socketio/socket.io-redis-adapter`)
que el paquete soporta `ioredis` explícitamente — no solo `redis` — antes de
decidir reusar la conexión existente en vez de sumar una segunda librería
de cliente Redis.

`RedisIoAdapter.connectToRedis()` toma la MISMA `REDIS_CONNECTION` real ya
obligatoria para arrancar el backend y la duplica dos veces
(`redis.duplicate()`, método nativo de ioredis) para los clientes pub/sub
que exige el protocolo real de Redis pub/sub (una conexión suscrita no
puede ejecutar otros comandos mientras escucha) — mismas credenciales,
mismo TLS de Upstash, sin variables de entorno nuevas. Se instala una única
dependencia nueva real y necesaria: `@socket.io/redis-adapter@8.3.0`.

Wireado en `main.ts`, entre `NestFactory.create()` y `app.listen()`
(`app.useWebSocketAdapter(redisIoAdapter)`), antes de que cualquier gateway
real (`LocationGateway`, `AssistantVoiceGateway`) reciba su primera
conexión.

## Por qué corregirlo ahora sin evidencia de despliegue multi-instancia todavía

No hay Dockerfile/Procfile/`render.yaml`/`fly.toml` en el repo — hoy corre
como una sola instancia, así que este hallazgo no está causando ningún
problema real todavía. Se corrige de todas formas porque: (1) el roadmap ya
declara "WebSocket scaling" como parte explícita del alcance de esta fase,
no es especulación; (2) el costo es bajo — reusa infraestructura ya
obligatoria (Redis), una sola dependencia nueva bien establecida y
mantenida oficialmente por el equipo de Socket.IO; (3) verificado que no
cambia ningún comportamiento en una sola instancia (ver "Verificación" —
la entrega local sigue funcionando idéntica); (4) el costo de encontrarlo
en producción (alertas de un corredor de EMERGENCIA que nunca le llegan al
candidato correcto, en silencio) es mucho más alto que agregarlo ahora.

## Verificación

`verify-ws-scaling.ts` (throwaway, no comiteado), con Redis real local y
dos servidores Socket.IO reales:

1. **SIN el adapter** (comportamiento previo al fix): confirmado que el
   socket del servidor B NO recibe el evento disparado en el servidor A —
   reproduce el hallazgo real antes de aplicar la corrección.
2. **CON el adapter real** (Redis real, `createAdapter` real): el socket
   del servidor B SÍ recibe el evento real disparado en el servidor A.
3. **Entrega local sin cambios**: con el adapter puesto, un evento disparado
   y recibido dentro de la MISMA instancia sigue funcionando idéntico —
   confirma que el fix no rompe el caso de hoy (una sola instancia).

3/3 casos reales pasaron. `typecheck`/`lint`/`build` del backend completo
limpios. Script throwaway borrado tras la corrida, no comiteado.

## Pendiente real, no resuelto en este cambio

- Resto del bloque Rendimiento: Redis tuning, DB indexes, PostGIS
  optimization — todavía sin auditar.
- No se probó con más de dos procesos reales simultáneos, ni con fallos de
  red entre instancias/Redis — suficiente para confirmar el mecanismo real,
  no un test de resiliencia bajo fallas parciales.
- El CORS de ambos gateways (`origin: "*"`, ver ADR-0036) sigue pendiente,
  sin relación con este cambio.

## Referencias

- `docs/decisions/ADR-0036-websocket-rate-limiting-gap.md` (mismo bloque de Fase 8, mismo día, hallazgo distinto de WebSockets)
- `docs/decisions/ADR-0037-corridor-findcandidates-n-plus-one.md` (mismo día, mismo bloque Rendimiento)
- `docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md` (Fase 8)
- `backend/src/common/websocket/redis-io.adapter.ts` (nuevo)
- `backend/src/main.ts`
- `backend/src/modules/location/location-broadcast.service.ts` (el consumidor real que este fix protege)
- github.com/nestjs/nest/blob/master/sample/02-gateways/src/adapters/redis-io.adapter.ts (ejemplo oficial de NestJS, verificado antes de escribir código)
- github.com/socketio/socket.io-redis-adapter (README oficial, confirma soporte real de ioredis)
