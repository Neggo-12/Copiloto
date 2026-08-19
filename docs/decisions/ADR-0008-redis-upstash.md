# ADR-0008 — Redis + BullMQ como infraestructura real (Upstash)

**Fecha:** 2026-08-19
**Estado:** Aceptado — decisión explícita y definitiva del fundador, no debe volver a quedar pendiente.

## Contexto

Redis/BullMQ quedaron pendientes en ADR-0007 de que el fundador eligiera proveedor.
El fundador decidió **Upstash Redis** y fue explícito en dos cosas: (1) esta decisión
no debe frenar un cambio de proveedor más adelante cuando haya presupuesto para algo
más grande — la arquitectura tiene que quedar sólida ahora, no reconstruirse después
— y (2) quiere resultados reales verificados, no simulados.

## Decisión

**Desacople del proveedor:** un único punto de contacto conoce que el proveedor es
Upstash: `REDIS_URL` (una sola variable de entorno, connection string `rediss://...`
con TLS incluido en el esquema). `RedisModule` es el único lugar que construye el
cliente; `QueueModule` (BullMQ) y cualquier dominio futuro solo reciben la conexión
ya armada, nunca importan `ioredis` directo. Cambiar a Redis Cloud, ElastiCache o
self-hosted en el futuro es cambiar esa variable — cero cambios de código. Es el
mismo patrón ya usado con `SupabaseModule`.

**Verificación oficial antes de codear** (regla del proyecto — no asumir configuración
por defecto):
- Documentación oficial de BullMQ (`docs.bullmq.io/guide/connections`): `maxRetriesPerRequest: null`
  es obligatorio al pasar la conexión a un Worker (BullMQ lanza excepción si no) —
  aplicado en `RedisModule`. `keyPrefix` de ioredis es explícitamente incompatible
  con BullMQ — no se usa.
- Documentación oficial de Upstash (`upstash.com/docs/redis/integrations/bullmq`):
  TLS obligatorio (`rediss://` ya lo activa automáticamente en ioredis). **Aviso de
  costos:** BullMQ consulta Redis constantemente incluso sin actividad — Upstash
  recomienda su plan **Fixed** en vez de Pay-As-You-Go para este caso de uso, para
  evitar costos altos por el polling constante. Comunicado al fundador antes de que
  provisione la cuenta.

**Registro central de colas** (`src/common/queue/queue-names.ts`): ningún dominio
escribe el nombre de una cola como string suelto. Se reservan ya `emergency-alerts`
(Fase 3, cooldown/expiración de alertas del corredor) y `location-reminders`
(Fase 7) como constantes tipadas, **sin processor todavía** — la interfaz queda
lista para no rediseñar nada cuando se construyan esos dominios, pero no se
implementa lógica de negocio que todavía no tiene dueño real (regla de "no
complejidad sin evidencia", que sigue vigente aunque Redis ya sea infraestructura
definitiva).

**Prueba de humo real, no simulada:** cola `system` con un job `ping` — no es
lógica de negocio, existe únicamente para demostrar que Redis+BullMQ+worker
funcionan de punta a punta. Expuesta en `POST /system/queue/ping` (encola) y
`GET /system/queue/ping/:jobId` (consulta estado/resultado). Sin auth a propósito
por ahora (es infraestructura interna); anotado como pendiente de un guard si el
backend llega a exponerse públicamente.

## Verificación

- `bun run typecheck`, `bun run lint`, `bun run build`: limpios, 0 errores.
- **Prueba real de punta a punta, sin simulación:** se levantó un Redis real
  (`redis-server`, no un mock) en el entorno de verificación, se arrancó el backend
  contra él, se hizo `POST /system/queue/ping` → devolvió `{"jobId":"1"}`; el log del
  proceso muestra al `SystemQueueProcessor` recibiendo y procesando el job en vivo;
  `GET /system/queue/ping/1` → `{"state":"completed","result":{"pong":true,...}}`.
  Los tres pasos (encolar, procesar, consultar) se verificaron con una conexión Redis
  real, no con mocks.
- Arranque sin `REDIS_URL`: falla rápido y claro (`Faltan variables de entorno
  requeridas: REDIS_URL...`) — ya no es opcional, es infraestructura real.

**Actualizado 2026-08-19:** el fundador provisionó la cuenta real de Upstash (plan
Fixed, región AWS — mismo proveedor de nube que Supabase, `ca-central-1`) y repitió
la prueba de humo contra su instancia real de producción: `POST /system/queue/ping`
→ `{"jobId":"1"}`, `GET /system/queue/ping/1` → `"state":"completed"`. Fase 1 del
cronograma queda cerrada por completo, sin nada pendiente ni simulado.

## Consecuencias

- El backend ahora **requiere** Redis para arrancar, incluso para `/health`. Es
  intencional: Redis dejó de ser una pieza opcional del proyecto.
- ~~Falta que el fundador provisione la cuenta real de Upstash~~ — resuelto
  2026-08-19, ver arriba.
- Sigue pendiente, sin resolver aquí: dónde corre `backend/` de forma permanente en
  producción (hoy solo corrió local y en CI) — un Worker de BullMQ necesita un
  proceso vivo constante, no solo un request-response server. Anotado como el
  siguiente vacío real a resolver, no bloqueante para cerrar esta fase.

## Referencias

- `docs/decisions/ADR-0007-backend-nestjs.md`
- `.claude/skills/puntos-movilidad-engineering/references/mobility-emergency.md` (cooldown/deduplicación de alertas)
- `backend/src/common/redis/redis.module.ts`, `backend/src/common/queue/`, `backend/src/modules/system/`
- https://docs.bullmq.io/guide/connections
- https://upstash.com/docs/redis/integrations/bullmq
