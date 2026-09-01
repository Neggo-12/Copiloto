# ADR-0006 — Emergency Corridor: capa de autorización (primera porción)

**Fecha:** 2026-08-18
**Estado:** Aceptado (porción 1 de N — autorización). El motor de corredor/conflicto
(Fase 3 completa) todavía no se ha construido.

## Contexto

`docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md` define el orden
de ejecución para la función de ambulancia: Fundación → Location & Navigation →
Emergency Corridor → Simulación. Este ADR cubre el primer bloque de la Fase 1:
"capa de permisos/autorización", específicamente la pregunta **quién puede activar
una emergencia**, según exige `CLAUDE.md` §8 ("Las emergencias solo pueden ser
activadas por identidades/vehículos autorizados").

Se auditó `docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md` (la spec
que originó las 13 tablas ya aplicadas) y no contiene nada sobre emergencias —
confirma lo que ya decía `MISSING_CAPABILITIES.md`: el dominio Emergency está en 0%,
sin diseño de esquema previo que reutilizar. Este ADR es, por lo tanto, diseño nuevo.

## Decisión

Se creó la tabla `public.emergency_vehicles`:

- `driver_id` (único, FK a `profiles`) — un conductor tiene a lo sumo un vehículo de
  emergencia asociado.
- `verified` / `verified_by` / `verified_at` — la verificación es un campo explícito,
  no implícita por la sola existencia de la fila.
- `active` — permite desactivar sin borrar historial/auditoría.

**RLS deliberadamente sin autoservicio:** existe una única policy, `SELECT` del
propio conductor sobre su propia fila (para que la app le muestre su estado de
verificación). No hay ninguna policy de `INSERT`/`UPDATE`/`DELETE` para
`anon`/`authenticated` — verificar una ambulancia es, a propósito, una operación que
solo puede hacer `service_role` (hoy vía SQL/MCP directo; más adelante vía un panel
de operador dedicado). Esto es intencional: un conductor nunca debe poder
auto-otorgarse la capacidad de activar el Emergency Corridor.

Se agregó `public.is_verified_ambulance_driver(p_user_id uuid)`, función
`SECURITY DEFINER` con `search_path` fijado, siguiendo el mismo patrón ya usado por
`is_chat_participant`/`is_chat_admin`/`is_chat_creator` en el dominio de mensajería.
Las tablas del corredor de emergencia (Fase 3: eventos de activación, tracking,
conflictos) usarán este helper en sus propias políticas RLS para verificar
autorización sin caer en la misma trampa circular que se encontró y corrigió en
mensajería (ver `TECHNICAL_DEBT.md`).

## Verificación

Simulación transaccional de RLS (mismo método usado para el fix de mensajería):

1. Un usuario autenticado intentando insertar su propia fila como ambulancia
   verificada → bloqueado por RLS (`insufficient_privilege`).
2. Un usuario autenticado sin relación con una fila ajena → no la ve
   (`select count(*) = 0`).
3. El dueño de una fila verificada (sembrada como `postgres`, bypass RLS,
   simulando la operación administrativa real) → sí ve su propia fila.
4. `is_verified_ambulance_driver()` devuelve `true` para el dueño verificado.

`mcp__Supabase__get_advisors(type: security)` después del cambio: el único hallazgo
nuevo es el mismo warning esperado de "SECURITY DEFINER ejecutable por anon/
authenticated" que ya tienen `is_chat_admin`/`is_chat_participant`/`is_chat_creator`/
`is_contact_of` — es el patrón de diseño intencional del proyecto, no una regresión.

## Consecuencias

- ~~Hoy, otorgar el estado de "ambulancia verificada" a un conductor es una operación
  manual (SQL/MCP)~~ — **cerrado 2026-09-01**, ver "Panel de administrador real"
  abajo. El mecanismo de verificación real (documentos, validación con la
  entidad de salud, etc.) sigue sin definir — el panel de hoy es solo
  "el administrador declara qué placa/teléfono es ambulancia", nada de
  validación documental automática (no pedida todavía).
- Esta tabla es la única pieza construida de Emergency hasta ahora. El resto (rutas,
  tracking GPS, corredor geoespacial, Conflict Engine, Alert Policy) depende de
  Location & Navigation (Fase 2 del cronograma) y se documentará en actualizaciones
  posteriores de este mismo ADR conforme avancen las fases.

## Panel de administrador real (2026-09-01)

A pedido explícito del fundador ("yo desde una cuenta admin maestro asigno
qué vehículo son ambulancia... cuando yo lo asigne ese conductor lo activa
manual"), se cerró el gap documentado arriba: `POST /emergency/admin/vehicles`
(verifica/asigna por teléfono del conductor — el administrador no maneja
UUIDs internos), `PATCH /emergency/admin/vehicles/:driverId` (activa/
desactiva sin borrar historial) y `GET /emergency/admin/vehicles` (lista con
nombre/teléfono reales, para la pantalla nueva `AdminAmbulanciasScreen.tsx`).

**Autorización — sigue siendo "sin autoservicio", ahora con forma real**:
nuevo `AdminGuard` (corre después de `SupabaseAuthGuard`), compara
`request.userId` (del JWT real ya verificado) contra `ADMIN_USER_ID` (una
sola variable de entorno — el `user_id` de Supabase Auth de la cuenta del
fundador, nunca hardcodeada, nunca decidida por el cliente). Deliberadamente
NO es un sistema de roles genérico (sin tabla `admins`, sin columna
`profiles.role`) — hoy es literalmente una persona, y no hay evidencia de
que haga falta más de una; construir RBAC genérico ahora sería complejidad
sin evidencia. Falla CERRADO si `ADMIN_USER_ID` no está configurado.

**Detalle real encontrado auditando antes de construir**: `assignVerified`
usa `upsert(..., { onConflict: "driver_id" })` — se verificó contra el
esquema real (`pg_indexes`) que `driver_id` sí tiene un índice único real
(`emergency_vehicles_driver_id_key`), aunque no aparece como constraint con
nombre en `pg_constraint` (es un índice único aplicado directo, no vía
`ADD CONSTRAINT`) — confirmado antes de escribir el upsert, no asumido de
la descripción de ADR-0006 original. `vehicle_type` se fija siempre a
`"ambulance"` del lado del servidor (la constraint `CHECK` real de la tabla
no acepta otro valor) — no se le pide al administrador un dato que la base
de todos modos va a rechazar si es distinto.

Verificado real contra el proyecto Supabase vivo (no un mock): se resolvió
un teléfono real a su `driver_id` real, se hizo el upsert real, se confirmó
la fila resultante, y se revirtió (0 filas de prueba dejadas) — mismo
método de "simulación transaccional, revertida" usado en el resto del
proyecto. `typecheck`/`lint`/`build` del backend y frontend quedan
pendientes de correr en la máquina del fundador (límite de siempre de este
entorno).

## Referencias

- `docs/decisions/05_CRONOGRAMA_EMERGENCY_Y_NUEVAS_FUNCIONALIDADES.md`
- `.claude/skills/puntos-movilidad-engineering/references/mobility-emergency.md`
- `supabase/migrations/20260818234452_enable_postgis.sql`
- `supabase/migrations/20260818234636_emergency_authorization_layer.sql`
