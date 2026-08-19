# ADR-0023 — Unificación de Notas y Recordatorios en una sola sección

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con esquema real en Supabase (migración
aplicada al proyecto vivo, no a una copia), `typecheck`/`lint`/`build`
limpios en backend y frontend.

## Contexto

Pedido explícito del fundador: existían dos capacidades separadas y
redundantes — "Notas" (pestaña principal, 100% local en el frontend,
`useNotes.ts`, sin backend real) y "Recordatorios" (sub-pestaña de
Copiloto, backend real pero solo geolocalizado, `location_reminders`). El
fundador no veía diferencia clara entre las dos y pidió unificarlas en una
sola sección, "algo básico, tipo CRM", conservando el caso de uso original:
poder dictar un recordatorio por voz mientras se conduce (ej. "Recuérdame
comprar unos zapatos cuando pase por Aguacatala").

Hallazgo importante durante la auditoría (Discover): el tool de voz
`create_location_reminder` (`backend/src/modules/assistant/tools/`) **ya
existe** desde ADR-0016 — el ejemplo exacto del fundador ya funcionaba de
punta a punta por voz antes de esta sesión. `MISSING_CAPABILITIES.md` tenía
una nota vieja calificándolo de "futuro" que quedó desactualizada; se
corrige en este ADR. Lo que sí seguía sin existir era la nota simple/tarea
sin ubicación, y la sección unificada.

Explícitamente fuera de este slice, documentado como gap real: recordatorios
por HORA fija (reloj, no geofence) — necesitan un mecanismo nuevo (BullMQ),
no modelado todavía. El fundador no pidió esto en su ejemplo (que es
geolocalizado); si lo necesita, es el siguiente slice natural.

## Decisión

**REUSE, no REPLACE**: se extiende la tabla `location_reminders` (Postgres)
en vez de crear una tabla paralela para notas. Mismo RLS
(`user_id = auth.uid()`), mismo módulo backend
(`LocationRemindersService`), misma cola de trabajo — evita duplicar la
autorización y el patrón CRUD que ya existían y ya estaban probados.

Migración aplicada al proyecto Supabase vivo (`wrkuusacwkdazfwynhkz`):

- `kind` (`"location" | "note"`, default `"location"` para no romper filas
  existentes).
- `title`, `is_task`, `completed_at`, `archived_at` — nuevos, todos
  nullable/con default.
- `latitude`/`longitude` pasan de `NOT NULL` a nullable (una nota no tiene
  coordenadas).
- Constraint nuevo `location_requires_coords`: `kind <> 'location' OR
  (latitude IS NOT NULL AND longitude IS NOT NULL)` — la base de datos, no
  solo el código, impide que un recordatorio de ubicación quede sin
  coordenadas.
- `radius_meters` se mantiene `NOT NULL DEFAULT 300` (columna sin usar para
  `kind: "note"`, pero no vale la pena relajarla — cambiar su nulabilidad
  no aporta nada real).

Backend (`backend/src/modules/location-reminders/`):

- `LocationRemindersService.create()` ahora recibe un input discriminado
  por `kind` (`CreateLocationReminderInput | CreateNoteInput`).
- Nuevos métodos: `updateText`, `setIsTask`, `setTaskCompleted`,
  `setArchived`, `remove` (borrado permanente — solo `kind: "note"`; un
  recordatorio de ubicación se cancela, no se borra, para conservar su
  historial de geofence).
- `listPendingForCache()` (la que alimenta el hot path de
  `GeofenceTriggerService` en cada `location:update`) ahora filtra
  explícitamente `kind = "location"` — las notas nunca deben entrar al
  cálculo de geofence. Verificado explícitamente (ver abajo).
- `POST /location-reminders` acepta `kind` (default `"location"`, para no
  romper al tool de voz existente ni a llamadas ya integradas).
  `PATCH /:id`, `PATCH /:id/task`, `PATCH /:id/complete`,
  `PATCH /:id/archive` nuevos. `DELETE /:id` se mantiene igual (cancela un
  recordatorio de ubicación); `DELETE /:id/permanent` es nuevo (borra una
  nota).
- `CreateLocationReminderTool` (el tool de voz, ADR-0016) se actualizó a la
  nueva firma de `create()` — sin cambio de comportamiento.

Frontend (`proyecto-mensajeria/`):

- `useReminders.ts` reemplaza a `useNotes.ts` (mock local, eliminado) y
  `useLocationReminders.ts` (eliminado) — un solo hook contra el backend
  real.
- `RemindersTab`/`RemindersListScreen`/`RemindersEditorScreen`
  (`src/components/reminders/`) reemplazan a `NotesTab`/`NoteListScreen`/
  `NoteEditorScreen` (eliminados) y a `RecordatoriosScreen` (eliminado).
  Viven en la pestaña principal "Notas" — la sub-pestaña "Recordatorios" de
  Copiloto se quitó (`CopilotoTab.tsx`, ahora Modo/Emergencia/Alertas).
- La lista muestra notas, tareas y recordatorios de ubicación juntos,
  ordenados por fecha, con filtro Todas/Pendientes/Cumplidas (solo afecta a
  las marcadas como tarea) y archivado. Un recordatorio de ubicación nuevo
  se crea desde un panel inline (mensaje + dirección, mismo flujo que ya
  tenía `RecordatoriosScreen`) — no se removió esa capacidad, se movió.
  Una nota nueva se crea con el botón "+" y se edita con autoguardado
  (`onBlur`, sin botón "Guardar", mismo patrón que ya tenía la libreta
  local) — si se sale sin escribir nada, se borra (mismo criterio que el
  mock local tenía).
- Fuera de alcance a propósito: adjuntar audio real a una nota (el mock
  local tenía un concepto de "nota de voz" con `waveform`/duración, nunca
  conectado a grabación/almacenamiento real — persistir audio real es una
  pieza de infraestructura aparte, sin evidencia de necesidad todavía más
  allá del dictado-a-texto que el tool de voz ya cubre).

## Verificación (real, sin mocks)

No se pudo levantar el servidor NestJS completo en este sandbox (no tiene
`SUPABASE_SERVICE_ROLE_KEY` local — por política, ese secreto nunca se
pega en el sandbox). Verificación real ejecutada por otras vías, sin
inventar resultados:

- **Migración aplicada al proyecto Supabase vivo** (no una copia), columnas
  confirmadas por `information_schema.columns` después de aplicarla.
- **Constraints probados contra el esquema real** (INSERT/UPDATE/DELETE
  reales, limpiados al terminar — ningún dato de prueba quedó en la tabla):
  insertar una nota sin coordenadas (antes imposible, ahora funciona),
  insertar un recordatorio de ubicación con el ejemplo exacto del fundador
  (Aguacatala/zapatos), e insertar un recordatorio de ubicación SIN
  coordenadas — la base de datos lo rechazó
  (`location_reminders_location_requires_coords`), confirmando que el
  constraint nuevo protege de verdad, no solo el código de la app.
- **Consulta equivalente a `listPendingForCache()` probada contra datos
  reales**: con una nota y un recordatorio de ubicación insertados a la
  vez, el filtro `kind = "location"` devolvió únicamente el recordatorio
  de ubicación — confirma que las notas nunca entran al hot path de
  geofence.
- `typecheck`/`lint`/`build` limpios en backend completo (incluye el tool
  de voz actualizado) y en `proyecto-mensajeria` (build de producción
  completo, sin advertencias nuevas).
- Límite honesto: no se probó el flujo end-to-end HTTP con sesión real de
  usuario (mismo límite ya documentado desde ADR-0009 — requiere
  credenciales que este sandbox no maneja).

## Alcance fuera de este slice

- Recordatorios por hora fija (reloj) — sigue sin construirse, necesita
  BullMQ.
- Adjuntar audio real a una nota.
- Renombrar la tabla/endpoint (`location_reminders` / `/location-reminders`
  ya no describen bien lo que hacen desde este ADR — se documenta como
  deuda de nombres, no se resuelve ahora para no ampliar el diff de este
  slice sin necesidad).

## Referencias

- `docs/decisions/ADR-0015-location-reminders.md`, `ADR-0016-assistant-tool-registry.md`, `ADR-0019-copiloto-tab-frontend-integration.md`
- `backend/src/modules/location-reminders/`, `backend/src/modules/assistant/tools/create-location-reminder.tool.ts`
- `proyecto-mensajeria/src/hooks/useReminders.ts`, `proyecto-mensajeria/src/components/reminders/`
