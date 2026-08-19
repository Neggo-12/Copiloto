# ADR-0014 — Registro de vehículos (placas) y Modo de manejo

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con Postgres/Supabase real (RLS simulado con
JWT real, transaccional) y con `typecheck`/`lint`/`build` limpios. Sin prueba
HTTP end-to-end (mismo límite ya documentado desde ADR-0009: este entorno no
maneja credenciales reales de usuario para un login completo).

## Contexto

El fundador definió tres requisitos de producto nuevos en la misma
conversación:

1. La plataforma debe funcionar completa como app de mensajería incluso para
   quien no tiene carro ni moto (recordatorios dictados/escritos, ej.
   "avísame cuando pase por Belén de comprar los panes").
2. Un usuario puede tener carro Y moto, y usar uno u otro en diferentes
   días/horas — la app necesita un concepto de **Modo de manejo**, elegido
   manualmente o preguntado por el asistente ("¿vas en el carro o en la
   moto?").
3. El cliente debe registrar las placas de carro y moto — pensando en un uso
   futuro de seguridad, todavía sin definir.

El punto 1 no requiere ningún cambio de backend: ya es cierto hoy. Nada en
Location Engine, mensajería, ni el futuro motor de recordatorios (Fase 7)
depende de tener un vehículo registrado — se registró explícitamente como
verificación, no como trabajo nuevo (ver sección "Verificación" abajo).

Los puntos 2 y 3 sí requerían una pieza nueva: hoy el sistema no captura en
ningún lugar "qué vehículo tiene este usuario" ni "cuál está usando ahora".
Esto además era un bloqueo ya documentado desde ADR-0013 (Alert Policy no
puede diferenciar mensaje carro/moto sin este dato).

## Decisión

**Dos conceptos separados, cada uno en la capa que le corresponde según la
arquitectura ya establecida del proyecto (Postgres = persistente, Redis =
caliente/efímero):**

**`user_vehicles` (Postgres, nueva tabla) — identidad persistente.**
A lo sumo un carro y una moto por usuario (`unique(user_id, vehicle_type)`).
Autoservicio, a diferencia de `emergency_vehicles`: el usuario registra sus
propios datos sin verificación externa, así que la política RLS es
`user_id = auth.uid()` en `USING` y `WITH CHECK` para todas las operaciones
(mismo patrón que `notes_all_own`, no un patrón nuevo). El backend NestJS usa
el cliente admin (bypassa RLS) y filtra explícitamente por `user_id` en cada
query — la autorización real ya pasa por `SupabaseAuthGuard`, igual que en
`EmergencyVehiclesService`; el RLS de la tabla queda como defensa en
profundidad para cualquier acceso directo futuro (p.ej. si `proyecto-
mensajeria` llega a hablar con esta tabla directo desde el cliente).

No se agrega unicidad global sobre `plate` todavía. El propósito de
seguridad que mencionó el fundador ("luego nos puede servir") no está
definido como caso de uso real — quién lo consulta, cuándo, con qué
autorización. Agregar la restricción ahora sería complejidad sin evidencia
(regla del proyecto). Queda registrado como decisión de producto abierta.

**Modo de manejo (Redis, `DrivingModeService`) — estado caliente, no
identidad.** Clave `driving:mode:<userId>`, TTL 24h (mismo criterio que
`RouteSessionService`: valor inicial razonable, ajustable con evidencia real
de uso — no es una sesión de viaje de 4h, es más parecido a "hoy ando en la
moto"). Pasado el TTL sin que el usuario lo reafirme, el modo simplemente se
olvida y la app/asistente vuelve a preguntar — ese es el comportamiento
correcto que pidió el fundador, no una falla.

`POST /vehicles/driving-mode` valida que el usuario tenga registrado ese
tipo de vehículo antes de aceptar el modo (`403` si no) — evita que el
estado caliente diverja del dato real; sin esto, el sistema podría terminar
"pensando" que alguien va en moto sin que exista tal moto.

**Endpoints (`VehiclesModule`, `SupabaseAuthGuard`):**

- `GET /vehicles` — lista los vehículos del usuario autenticado.
- `POST /vehicles/:vehicleType` (`car` | `motorcycle`) — registra o
  actualiza (upsert) el vehículo de ese tipo.
- `DELETE /vehicles/:vehicleType` — elimina el vehículo de ese tipo.
- `GET /vehicles/driving-mode` / `POST /vehicles/driving-mode` /
  `DELETE /vehicles/driving-mode` — consultar, fijar o limpiar el modo
  actual.

**Diferido a propósito:** este ADR NO conecta el dato de vehículo con
`AlertPolicyService` (diferenciación carro/moto del mensaje de Emergency
Corridor, pendiente desde ADR-0013). El dato ya existe y desbloquea ese
trabajo, pero conectarlo es un incremento separado y pequeño — no se hizo
aquí para mantener el diff de este slice mínimo y enfocado en lo que se
pidió (registro + modo de manejo).

## Verificación (real, sin mocks)

- `typecheck`/`lint`/`build`: limpios.
- **Esquema aplicado sobre el proyecto Supabase real** (`wrkuusacwkdazfwynhkz`,
  vía `mcp__Supabase__apply_migration`, no un archivo sin aplicar) y
  confirmado con `information_schema.columns` después de aplicar.
- **RLS verificado con simulación transaccional real** (`SET LOCAL ROLE
  authenticated` + `request.jwt.claims` con el `id` real de un perfil
  existente, `BEGIN`/`ROLLBACK` para no dejar datos de prueba — mismo
  técnica ya usada para `emergency_vehicles` en ADR-0006):
  - un usuario puede registrar su carro y su moto (2/2 inserts propios OK).
  - un intento de insertar un vehículo a nombre de OTRO `user_id` es
    bloqueado por RLS (`insufficient_privilege`), confirmado explícitamente.
  - el usuario solo ve sus propios vehículos (`count = 2`, no ve los de
    nadie más).
  - `unique(user_id, vehicle_type)` bloquea un segundo carro para el mismo
    usuario (`unique_violation`, confirmado).
  - `check(vehicle_type in ('car','motorcycle'))` bloquea un tipo inválido
    (`check_violation`, confirmado).
- `mcp__Supabase__get_advisors(type="security")` después de aplicar: sin
  advertencias nuevas — las únicas que aparecen son las mismas WARN
  preexistentes ya documentadas (funciones `SECURITY DEFINER` públicas,
  leaked-password-protection desactivado), ninguna relacionada con
  `user_vehicles`.
- **Límite honesto:** no se probó el flujo HTTP completo autenticado
  (`SupabaseAuthGuard` con un JWT real → controlador → servicio) — mismo
  límite documentado desde ADR-0009, este entorno no maneja credenciales de
  usuario real para completar un login. Lo probado es el mecanismo de datos
  real (RLS, constraints) de forma aislada, honesto sobre qué se cubrió.

## Sobre "WhatsApp para quien no tiene vehículo" (verificación, no cambio)

Se revisó explícitamente que ningún flujo de mensajería, recordatorios
(Fase 7, todavía sin construir) o Location Engine dependa de tener un
`user_vehicles` registrado. No lo depende: `LocationStateService`,
`RouteSessionService` y el futuro motor de geofencing de Fase 7 operan sobre
`userId`, no sobre tipo de vehículo. Un peatón puede usar la app completa
sin registrar nada aquí. Este ADR no cambió nada para cumplir este
requisito porque ya era cierto.

## Sobre la velocidad por sectores (decisión de producto, explícitamente pendiente)

El fundador propuso comparar la velocidad actual contra un límite local por
sector y mostrar un mensaje informativo — y explícitamente pidió dejarlo
en pendiente, con una restricción de tono ya fijada para cuando se
construya: **informativo, nunca punitivo o alarmante** ("no se estas siendo
irresponsable"). No hay código de esto todavía; queda registrado en
`docs/architecture/MISSING_CAPABILITIES.md`.

## Referencias

- `docs/decisions/ADR-0006-emergency-corridor.md` (técnica de simulación RLS transaccional)
- `docs/decisions/ADR-0013-alert-policy.md` (bloqueo de diferenciación carro/moto que este ADR desbloquea)
- `supabase/migrations/20260819052500_user_vehicles.sql`
- `backend/src/modules/vehicles/`
