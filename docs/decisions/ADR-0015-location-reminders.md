# ADR-0015 — Recordatorios por ubicación (Fase 7)

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con Postgres/Supabase real (esquema aplicado
y RLS simulado transaccionalmente con JWT real), Redis real (smoke test
13/13 contra una instancia local real, no mockeada), y `typecheck`/`lint`/
`build` limpios. Sin prueba HTTP/WebSocket end-to-end (mismo límite ya
documentado desde ADR-0009).

## Contexto

Primera pieza real de Fase 7, adelantada frente a Fase 4 (Simulación) y
Fase 6 (Asistente de voz) por decisión del fundador — ver el reordenamiento
registrado en `05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md`. El
caso de uso concreto que la dispara: *"avísame cuando pase por Belén de
comprar los panes"* — un recordatorio geográfico, no uno por hora fija (eso
es un tipo de recordatorio distinto, con BullMQ, todavía sin construir, ver
`MISSING_CAPABILITIES.md`).

Dictado por voz (Fase 6) queda fuera de este slice a propósito: hoy no hay
integración Realtime/STT en ningún punto del sistema. Este ADR entrega la
mitad que sí es real hoy — creación por texto/API — y deja el tool de voz
`create_location_reminder` como un consumidor futuro trivial de estos mismos
endpoints, no una reconstrucción.

## Decisión

**`location_reminders` (Postgres, nueva tabla) — identidad persistente.**
Autoservicio, mismo patrón RLS que `user_vehicles`/`notes`
(`user_id = auth.uid()` en `USING` y `WITH CHECK`). Campos: `message`,
`latitude`/`longitude` (el punto del geofence, no una dirección de texto),
`radius_meters` (default 300 — más grande que el buffer de 200m del
corredor de emergencia, porque un recordatorio de sector es intencionalmente
menos preciso que un corredor sobre una ruta conocida), `status`
(`pending`/`triggered`/`cancelled`), y timestamps de disparo/cancelación.

**Geocoding NO se hace dentro de este módulo.** `POST /location-reminders`
recibe coordenadas ya resueltas, no una dirección de texto. Resolver
"Belén, Medellín" a coordenadas es responsabilidad del llamador vía el
endpoint que ya existe, `GET /navigation/geocode` (ADR-0010) — no se
duplica geocoding aquí. La razón real, no solo de estilo: acoplar este
módulo a `NavigationModule` (para inyectar `GEOCODING_PROVIDER`) habría
creado un ciclo de módulos, porque `NavigationModule` ya importa
`LocationModule`, y `LocationModule` necesita importar el módulo de
recordatorios para que `LocationGateway` pueda evaluarlos. Mantener
`LocationRemindersModule` sin conocer Google Maps evita el ciclo
limpiamente, no con `forwardRef`. El futuro tool de voz hará esto en dos
llamadas: geocodificar, después crear.

**Detección del geofence: en cada `location:update` que el propio usuario
ya manda, no un job aparte.** `GeofenceTriggerService.checkAndTrigger()` se
llama desde `LocationGateway.handleLocationUpdate()` (mismo punto donde ya
se calcula el desvío de ruta) y usa la misma pieza matemática ya probada
tres veces en este proyecto (`haversineMeters`, `common/geo/`) — reutilizada,
no reimplementada. Un recordatorio se dispara **una sola vez** (pasa a
`triggered`, `UPDATE ... WHERE status='pending'` — idempotente por diseño:
dos evaluaciones concurrentes no lo disparan dos veces). No hay
recordatorios recurrentes; no se pidió y no hay evidencia de necesidad.

**Caché de lectura-a-través en Redis (`ReminderCacheService`), Postgres
sigue siendo la fuente real.** Por qué: `LocationGateway` recibe
`location:update` de CADA usuario conectado, potencialmente cada 15-20s
(cadencia recomendada en ADR-0013). Consultar Postgres en cada uno de esos
pings para "¿tiene recordatorios pendientes?" es exactamente el costo que
ADR-0013 ya evitó para Alert Policy (por eso Alert Policy es pull, no
evaluación en cada `location:update` de cualquier usuario). Acá no se puede
usar el mismo patrón "pull" porque el disparo SÍ tiene que ser inmediato al
cruzar el geofence — la solución es cachear en Redis la lista de
recordatorios pendientes por usuario (TTL 24h como red de seguridad, mismo
criterio que `DrivingModeService`), invalidada explícitamente en cada
create/cancel/disparo.

**Entrega: en el mismo ack de `location:update`, no por
`LocationBroadcastService`.** Quien reporta la ubicación es el propio dueño
del recordatorio, en el mismo socket — el resultado va en la respuesta de
esa misma llamada (`remindersTriggered`, igual que ya existe `route`). Usar
el broadcast entre módulos (pensado para que un usuario — la ambulancia —
notifique a un tercero) habría sido una dependencia cruzada innecesaria, y
habría recreado el mismo problema de ciclo de módulos descrito arriba.

**Endpoints (`LocationRemindersModule`, `SupabaseAuthGuard`):**

- `GET /location-reminders` — lista los recordatorios del usuario (todos los estados).
- `POST /location-reminders` — crea uno (`message`, `latitude`, `longitude`, `radiusMeters?`, `label?`).
- `DELETE /location-reminders/:id` — cancela uno (`status='cancelled'`, idempotente igual que el disparo).

## Verificación (real, sin mocks)

- `typecheck`/`lint`/`build`: limpios.
- **Esquema aplicado sobre el proyecto Supabase real** (`wrkuusacwkdazfwynhkz`,
  vía `mcp__Supabase__apply_migration`) y confirmado con
  `information_schema.columns`.
- **RLS y constraints verificados con simulación transaccional real** (`SET
  LOCAL ROLE authenticated` + `request.jwt.claims` con el `id` real de un
  perfil existente, `BEGIN`/`ROLLBACK`, mismo técnica de ADR-0006/ADR-0014):
  - un usuario crea su propio recordatorio real (coordenadas reales de
    Belén, Medellín) — OK.
  - un intento de insertar un recordatorio a nombre de OTRO `user_id` es
    bloqueado por RLS (`insufficient_privilege`), confirmado.
  - el usuario solo ve su propio recordatorio.
  - **idempotencia del disparo verificada explícitamente**: el mismo
    `UPDATE ... WHERE status='pending'` ejecutado dos veces sobre la misma
    fila afecta 1 fila la primera vez y 0 la segunda (`RETURNING id` vacío
    en el segundo intento) — confirmado con conteo real, no inferido.
  - `check(radius_meters > 0)` bloquea un valor negativo, confirmado.
- **`get_advisors(type="security")` después de aplicar:** sin advertencias
  nuevas — las mismas WARN preexistentes de siempre, ninguna relacionada
  con `location_reminders`.
- **Smoke test real de `ReminderCacheService` + `GeofenceTriggerService`
  contra una instancia de Redis real (loopback, no mockeada), con
  `LocationRemindersService` (Postgres) reemplazado por un stub en memoria**
  — el esquema/RLS de Postgres ya se verificó por separado arriba; aislar
  así es honesto sobre qué se cubre en cada prueba (mismo criterio que el
  smoke de Socket.IO en ADR-0013). **13/13 casos:** cache-miss inicial puebla
  Redis real desde el stub; posición lejana no dispara nada; posición dentro
  del geofence dispara exactamente el recordatorio correcto con
  `distanceMeters` correcto; `markTriggered` se llama exactamente una vez;
  la caché se refresca tras el disparo (ya no contiene el recordatorio
  disparado); una segunda evaluación en el mismo punto NO re-dispara
  (idempotencia confirmada en la capa de caché, no solo en SQL);
  `invalidate()` borra la clave real de Redis; el siguiente cache-miss
  repuebla correctamente desde el stub.
- **Límite honesto:** no se probó el flujo HTTP/WebSocket completo
  autenticado de punta a punta (crear un recordatorio vía `POST`, conectar
  el WebSocket con un JWT real, mandar `location:update` desde dentro del
  geofence, ver `remindersTriggered` en el ack) — mismo límite documentado
  desde ADR-0009: este entorno no maneja credenciales de usuario real para
  completar ese camino. Lo que se verificó por separado (Postgres/RLS real +
  Redis/lógica de negocio real) cubre cada pieza de forma aislada y honesta.

## Diferido a propósito

- Recordatorios recurrentes (dispararse cada vez que se entra a la zona, no
  solo la primera) — no se pidió, no hay evidencia de necesidad.
- Recordatorios por tiempo (hora fija, BullMQ) — tipo de recordatorio
  distinto, sigue en `MISSING_CAPABILITIES.md`.
- Notificación push (FCM/APNs) cuando la app está cerrada — Fase 5, todavía
  no construida; hoy el disparo solo llega si el socket de `/location` está
  conectado en el momento exacto del cruce.
- Integración con el tool de voz `create_location_reminder` — Fase 6.

## Referencias

- `docs/decisions/ADR-0009-location-engine.md` (Location Engine que este slice reutiliza)
- `docs/decisions/ADR-0010-navigation-google-maps.md` (`GET /navigation/geocode`, reutilizado por el llamador, no duplicado aquí)
- `docs/decisions/ADR-0013-alert-policy.md` (razón por la que se cachea en vez de consultar Postgres en cada `location:update`)
- `supabase/migrations/20260819053900_location_reminders.sql`
- `backend/src/modules/location-reminders/`
