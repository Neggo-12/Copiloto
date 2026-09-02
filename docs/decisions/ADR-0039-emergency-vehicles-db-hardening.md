# ADR-0039: Fase 8 (Rendimiento/Seguridad) — hardening real de `emergency_vehicles` contra Postgres/Supabase reales

- Fecha: 2026-09-02
- Estado: **corregido el mismo día**, con evidencia real de antes/después (Supabase Advisors reales, sobre el proyecto real "Copiloto").

## Contexto

Cerrando el bloque Rendimiento de la Fase 8 (Redis tuning ya cubierto
indirectamente por ADR-0037/ADR-0038; faltaban DB indexes/PostGIS). Hasta
ahora este bloque no se había podido auditar con evidencia real — sin
credenciales de Supabase en el sandbox, la única alternativa honesta era
fakear `EmergencyVehiclesService` (ver Escenarios 10-12, ADR-0022) y dejar
el resto documentado como pendiente. El fundador conectó el proyecto real
de Supabase a este entorno, así que esta auditoría se hizo contra
infraestructura 100% real — el proyecto real "Copiloto"
(`wrkuusacwkdazfwynhkz`, Postgres 17, `ACTIVE_HEALTHY`).

## Alcance deliberado: solo `emergency_vehicles`

El proyecto Supabase real tiene MUCHAS más tablas que las del corredor de
emergencia — `chats`, `messages`, `statuses`, `contacts`, etc. pertenecen al
dominio de mensajería, que "sigue consumiendo Supabase directo desde el
front" (`proyecto-mensajeria/`), un proyecto separado que este backend no
toca. Los Advisors reales de Supabase (`get_advisors`, tipos `performance` y
`security`) sí devolvieron hallazgos reales en esas tablas también — se
documentan abajo por transparencia, pero **no se tocaron**, siguiendo la
regla del proyecto de "no tocar áreas no relacionadas". `emergency_vehicles`
es la única tabla real del dominio Emergency Corridor (la única que este
backend administra), así que es el único alcance real de este cambio.

## Hallazgos reales corregidos (en `emergency_vehicles`)

Confirmados con Supabase Advisors reales (`get_advisors`), no adivinados, y
verificados con SQL real (`pg_policies`, `pg_indexes`,
`information_schema.routine_privileges`) antes y después del fix:

1. **FK real sin índice** (`unindexed_foreign_keys`, INFO): la columna
   `verified_by` (quién verificó administrativamente la ambulancia,
   `emergency_vehicles_verified_by_fkey`) no tenía índice — cualquier
   consulta real que una `verified_by` contra `profiles` haría un escaneo
   completo. Corregido: `create index emergency_vehicles_verified_by_idx`.
2. **RLS re-evaluando `auth.uid()` por fila** (`auth_rls_initplan`, WARN):
   la única policy real de la tabla, `emergency_vehicles_select_own`
   (`driver_id = auth.uid()`), confirmado con SQL real que Postgres la
   re-evalúa una vez POR FILA en vez de una vez por consulta — a escala
   real (más ambulancias, más filas) esto degrada. Corregido: mismo
   resultado exacto, `driver_id = (select auth.uid())` (patrón oficial
   documentado por Supabase).
3. **Función `SECURITY DEFINER` real ejecutable sin autenticar**
   (`anon_security_definer_function_executable`/`authenticated_security_definer_function_executable`,
   WARN — categoría SEGURIDAD, no rendimiento, encontrada auditando el
   mismo dominio): `is_verified_ambulance_driver(p_user_id uuid)` — real,
   `SECURITY DEFINER`, consulta si un `p_user_id` arbitrario es ambulancia
   verificada Y activa — tenía `EXECUTE` otorgado a `PUBLIC` (por lo tanto
   a `anon`, sin autenticar). Verificado con SQL real ANTES de tocar nada:
   (a) el backend nunca la llama vía RPC (`grep` real sobre
   `backend/src/`, cero resultados); (b) ninguna policy RLS real la
   referencia (`pg_policies` real, cero resultados) — función real sin
   ningún consumidor real hoy, pero con una superficie real de
   información: cualquiera sin autenticar podía preguntar "¿este userId es
   ambulancia verificada activa ahora mismo?" sin ninguna autorización.
   Corregido: `revoke execute ... from public, anon, authenticated` — se
   restringe el acceso, no se borra la función (uso futuro real posible
   desde el backend, que ya tiene su propio grant vía `service_role`).

Migración real aplicada (`apply_migration`, Postgres real del proyecto):
`emergency_vehicles_performance_and_security_hardening`
(`supabase/migrations/20260902030914_...sql`, comiteado en el repo — antes
de esta migración, el repo solo tenía comiteada la más reciente de las 17
migraciones ya aplicadas remotamente, un gap de sincronización real
preexistente y ajeno a este cambio, no corregido acá).

## Verificado antes/después (Supabase Advisors reales)

- ANTES: 1 finding `unindexed_foreign_keys` + 1 finding `auth_rls_initplan`
  (ambos sobre `emergency_vehicles`) en Performance; 2 findings
  (`anon_.../authenticated_security_definer_function_executable`) sobre
  `is_verified_ambulance_driver` en Security.
- DESPUÉS: los 4 findings sobre `emergency_vehicles`/`is_verified_ambulance_driver`
  desaparecieron real de los Advisors — confirmado con una segunda corrida
  real de `get_advisors` después de aplicar la migración, más SQL directo
  (`pg_indexes` confirma el índice nuevo; `information_schema.routine_privileges`
  confirma que solo `service_role`/`postgres` retienen `EXECUTE`).
- El índice nuevo aparece ahora como `unused_index` (INFO) — esperado,
  recién creado, cero tráfico real todavía; no es una regresión.

## Hallazgos reales, encontrados pero fuera de alcance (dominio de mensajería, NO corregidos)

Documentados por transparencia — pertenecen a `proyecto-mensajeria/`, no a
este backend, y no se tocaron:

- `unindexed_foreign_keys`: `chats.created_by`, `message_reactions.user_id`,
  `message_status.user_id`, `messages.forwarded_from_chat_id`,
  `messages.reply_to_status_id`, `messages.sender_id`,
  `status_audience_exceptions.user_id`, `status_views.viewer_id`.
- `auth_rls_initplan`: policies de `profiles`, `contacts`, `chats`,
  `chat_participants`, `messages`, `message_status`, `message_reactions`,
  `location_shares`, `notes`, `statuses`, `status_audience_exceptions`,
  `status_views`, `paired_devices`, `user_vehicles`, `push_subscriptions`.
- `multiple_permissive_policies`: `message_reactions` y `message_status`
  tienen dos policies permisivas superpuestas para `SELECT`.
- `unused_index`: varios índices de mensajería sin uso — bajo el volumen
  real de datos actual (`messages`: 15 filas, `contacts`: 1 fila) esta
  señal todavía no es confiable, se necesita más uso real antes de
  considerar borrarlos.
- `anon_security_definer_function_executable` /
  `authenticated_security_definer_function_executable`: `can_view_status`,
  `is_chat_admin`, `is_chat_creator`, `is_chat_participant`,
  `is_contact_of`, `notify_new_message` — a diferencia de
  `is_verified_ambulance_driver`, estas SÍ podrían estar en uso real desde
  `proyecto-mensajeria/` (no se auditó ese repo) — revocar sin confirmar
  primero podría romper mensajería real en producción, así que
  deliberadamente no se tocaron.
- `auth_leaked_password_protection`: configuración de Supabase Auth (no un
  cambio de esquema) — se activa desde el dashboard de Supabase
  (Authentication → Policies), fuera del alcance de una migración SQL.

## Referencias

- `docs/decisions/ADR-0037-corridor-findcandidates-n-plus-one.md`, `docs/decisions/ADR-0038-websocket-scaling-redis-adapter.md` (mismo bloque Rendimiento, mismo día)
- `docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md` (Fase 8)
- `supabase/migrations/20260902030914_emergency_vehicles_performance_and_security_hardening.sql`
- `backend/src/modules/emergency/emergency-vehicles.service.ts` (el consumidor real de esta tabla)
- Supabase Advisors: https://supabase.com/docs/guides/database/database-linter
