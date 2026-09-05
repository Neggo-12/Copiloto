# ADR-0008 — Redis + BullMQ como infraestructura real (Upstash → Railway desde 2026-09-05)

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

## Actualización 2026-09-04 — migración decidida de Upstash a Railway

La cuota mensual de Upstash (500.000 comandos, plan Fixed) se agotó en producción y
causó incidentes reales encadenados (ver decisiones (28), (37), (38) en
`docs/decisions/README.md`): caída total del backend al arrancar, luego fallo de
TODO endpoint, mitigados con fail-open/try-catch pero sin resolver la causa real. El
fundador decidió (decisión (39)) mover Redis a un servicio dentro del mismo proyecto
de Railway en vez de subir de plan de Upstash — el desacople de proveedor descrito
arriba (`REDIS_URL` como único punto de contacto) sigue siendo válido y es lo que hace
esta migración un cambio de variable de entorno, no de código. **Pendiente real de
ejecución por el fundador** (acción de dashboard de Railway, fuera del alcance de este
asistente) — este ADR y el comentario de `redis.module.ts` se actualizan para reflejar
Railway como proveedor solo cuando la migración esté hecha y verificada de punta a
punta contra la instancia real, mismo estándar de verificación que el resto de este
documento.

## Actualización 2026-09-05 — migración ejecutada, con un bug real encontrado y corregido en el camino

El fundador provisionó el servicio Redis dentro del proyecto de Railway y apuntó
`REDIS_URL` del backend a él. Primer intento falló: el deploy entró en el mismo loop
de reinicio infinito ya documentado (ver decisión (37)), esta vez con
`TypeError: Invalid URL` — confirmado con evidencia real (dos exports de logs de
Railway descargados por el fundador, `logs.1788570103751.json` y
`logs.1788570622039.json`). Causa raíz real, no adivinada: al editar la variable en el
dashboard de Railway, la referencia `${{Redis.REDIS_URL}}` quedó concatenada AL FINAL
del valor viejo de Upstash en vez de reemplazarlo — el segundo log muestra literalmente
las dos connection strings pegadas sin separador
(`rediss://...@ace-perch-148578.upstash.io:6379redis://...@redis.railway.internal:6379`),
por eso `ioredis`/`new URL()` no podía parsearla. Corregido borrando el campo por
completo antes de insertar la referencia — el fundador confirmó el servicio "online" en
el dashboard después de este segundo intento. `RedisModule`/`ADR-0008` no necesitaron
ningún cambio de código, tal como predecía el desacople de proveedor original de este
ADR. Pendiente honesto, sin marcar como 100% verificado: falta repetir la prueba de
humo real de este ADR (`POST /system/queue/ping` → `GET /system/queue/ping/:jobId`)
contra la instancia nueva para tener la misma confirmación de punta a punta que se hizo
en 2026-08-19 con Upstash — "online" en el dashboard confirma que el proceso arrancó,
no que Redis+BullMQ funcionan de punta a punta.

**Verificado real 2026-09-05:** el fundador corrió la prueba de humo contra la
instancia real de producción (Railway): `POST /system/queue/ping` →
`{"jobId":"1"}`, `GET /system/queue/ping/1` →
`{"state":"completed","result":{"pong":true,"respondedAt":"2026-09-05T01:21:42.588Z"}}`.
Migración cerrada por completo, sin nada pendiente ni simulado — mismo estándar de
verificación que el resto de este ADR. Detalle completo en la decisión (41),
`docs/decisions/README.md`.

## Referencias

- `docs/decisions/ADR-0007-backend-nestjs.md`
- `.claude/skills/puntos-movilidad-engineering/references/mobility-emergency.md` (cooldown/deduplicación de alertas)
- `backend/src/common/redis/redis.module.ts`, `backend/src/common/queue/`, `backend/src/modules/system/`
- https://docs.bullmq.io/guide/connections
- https://upstash.com/docs/redis/integrations/bullmq
