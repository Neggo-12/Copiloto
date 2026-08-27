# ADR-0030 — Recordatorios de nota a hora fija (BullMQ)

**Fecha:** 2026-08-27
**Estado:** Aceptado — migración real aplicada y verificada contra el
esquema vivo, `typecheck`/`lint`/`build` limpios en backend y frontend
(build de producción completo en ambos), mecánica de BullMQ (encolar/
cancelar/reprogramar) verificada contra Redis real local (no mock).
Integración de punta a punta con Redis/Supabase de producción reales
pendiente de prueba manual del fundador (mismo límite documentado desde
ADR-0009: este entorno no puede recibir `REDIS_URL`/claves reales por
chat).

## Contexto

Siguiendo la lista de pendientes de más fácil a más difícil (ADR-0029 fue
el anterior), el siguiente gap documentado en `MISSING_CAPABILITIES.md`
era: "recordatorios por tiempo (jobs con BullMQ) — tipo de recordatorio
distinto (hora fija, no geofence), sigue sin construir". A diferencia de
ADR-0025/0028/0029 (REUSE puro, cero migraciones), este sí requería una
migración real: `location_reminders` (tabla unificada de notas/tareas/
recordatorios desde ADR-0023) no tenía ninguna columna de hora — confirmado
contra el esquema vivo (`information_schema.columns`) antes de escribir
código.

La infraestructura de colas (`QueueModule`, Redis compartido con
`maxRetriesPerRequest: null`, el patrón de referencia `system/queue` con su
job `ping` de humo) ya existía desde antes, con la cola `LOCATION_REMINDERS`
reservada mas nunca conectada a un processor real.

## Decisión

**Migración real** (`add_remind_at_to_location_reminders`, aplicada a
`wrkuusacwkdazfwynhkz`):

```sql
alter table public.location_reminders add column remind_at timestamptz null;
alter table public.location_reminders
  add constraint location_reminders_remind_at_only_for_note
  check (remind_at is null or kind = 'note');
```

Solo notas (`kind: "note"`) pueden tener `remind_at` — los recordatorios de
ubicación siguen disparando exclusivamente por geofence.

**Backend:**

1. `LocationRemindersService.markNoteReminderTriggered(userId, id)` — mismo
   patrón idempotente que `markTriggered` (`WHERE status='pending'`), más
   `WHERE kind='note' AND completed_at IS NULL AND archived_at IS NULL`,
   `SELECT`+`.maybeSingle()` en una sola llamada: devuelve la fila si debe
   notificarse, `null` si la nota ya no calificaba (cancelada, completada o
   archivada entre que se encoló el job y que disparó).
2. `LocationRemindersService.scheduleReminder(userId, id, remindAt)` —
   programa/reprograma/quita la hora fija; devuelve la fila actualizada.
3. `NoteReminderSchedulerService` (nuevo, vive en `LocationRemindersModule`
   — registra ahí la cola `LOCATION_REMINDERS`): encola/cancela el job de
   BullMQ, usando el id del recordatorio como `jobId` (reprogramar es
   remove + add). Solo necesita la `Queue`, nunca
   `LocationBroadcastService` — por eso puede vivir junto al controller que
   lo usa sin recrear el ciclo `LocationModule` ↔ `LocationRemindersModule`
   que ADR-0015 ya evitó a propósito.
4. `NoteReminderProcessor` (nuevo, vive en `LocationModule`): consume la
   cola, llama `markNoteReminderTriggered` y, solo si devuelve fila, entrega
   el aviso vía `LocationBroadcastService.notify(userId, "reminder:due",
   reminder)` sobre el namespace `/location` ya existente — a diferencia del
   geofence (que entrega el resultado en el ack del mismo socket que reportó
   la ubicación), aquí no hay una petición del cliente en curso en el
   momento del disparo: es el caso exacto para el que se construyó
   `LocationBroadcastService`. El processor y el registro de la cola no
   necesitan vivir en el mismo módulo de Nest — BullMQ los conecta por
   nombre de cola vía su `DiscoveryService` interno (`moduleRef.get(...,
   { strict: false })`, confirmado leyendo el código fuente instalado de
   `@nestjs/bullmq`), no por import.
5. Endpoints nuevos/extendidos en `LocationRemindersController`:
   `POST /location-reminders` acepta `remindAt` opcional para `kind: "note"`
   y programa el job si viene; `PATCH /location-reminders/:id/remind-at`
   programa/reprograma/quita (`remindAt: null`) la hora fija de una nota ya
   existente. `PATCH :id/complete` y `PATCH :id/archive` (cuando marcan
   completado/archivado) y `DELETE :id`/`DELETE :id/permanent` cancelan
   también el job de BullMQ si existía (limpieza — el guard real contra un
   aviso indebido es el filtro en `markNoteReminderTriggered`, esto solo
   evita dejar jobs vivos sin necesidad en Redis).

**Frontend (`proyecto-mensajeria`):**

- `Reminder.remindAt` (nuevo) y `RemindersController.scheduleReminder(id,
  remindAt)` en `useReminders.ts`.
- `RemindersEditorScreen.tsx`: sección nueva "Avisarme a una hora" con
  `<input type="datetime-local">`, autoguardado al perder foco (mismo
  patrón que título/mensaje).
- `RemindersListScreen.tsx`: badge con reloj + hora en la fila de una nota
  con `remindAt` activo.
- `useCopilotoRealtime.ts`: nuevo evento `reminder:due` sobre el socket
  `/location` ya conectado → `noteReminders: NoteReminderDueEvent[]`.
- `NotificacionesScreen.tsx`: el feed de notificaciones de la sesión ahora
  también incluye los avisos de nota entregados en vivo.

**Limitación honesta, documentada a propósito:** sin proveedor FCM/APNs
todavía (gap ya conocido, Fase 5), el aviso solo llega si el usuario tiene
la app abierta con el socket `/location` conectado en ese momento. La nota
igual queda marcada `triggered` en la base (visible al abrir la app
después), pero no hay push real fuera de la app.

## Verificación real

- Esquema vivo leído antes y después de la migración (`information_schema.
  columns`, `pg_constraint`) — confirmó la ausencia de `remind_at` antes de
  escribir código y la columna/constraint reales después de aplicarla.
- Mecánica de BullMQ (no la lógica de negocio, que depende de Supabase real
  no disponible por credenciales en este entorno) verificada contra un
  Redis real local (`redis-server`, no mock) usando el mismo `bullmq`/
  `ioredis` instalados en el backend, con el mismo patrón exacto
  (`jobId = reminderId`, `delay`, `job.remove()`): 3/3 casos — un job
  dispara después de su delay, cancelar (`remove()`) antes de disparar
  evita el disparo, reprogramar (remove + add con el mismo `jobId`) usa el
  nuevo delay y dispara una sola vez.
- `bun run typecheck` / `lint` / `build` (build de producción completo) —
  limpios en `backend/` y en `proyecto-mensajeria/`.
- Pendiente, honestamente: arrancar el backend real completo contra
  Supabase/Redis de producción no fue posible en este entorno (requiere
  `SUPABASE_SERVICE_ROLE_KEY`/`REDIS_URL` reales, que este asistente nunca
  debe recibir por chat) — la resolución cross-módulo de la cola
  (`NoteReminderProcessor` en `LocationModule` consumiendo una cola
  registrada en `LocationRemindersModule`) se verificó leyendo el código
  fuente real de `@nestjs/bullmq` instalado (`bull.explorer.js`), no
  ejecutándola de punta a punta; queda pendiente de una prueba manual del
  fundador con el backend corriendo.

## Fuera de alcance de este slice

- Notificación push real (FCM/APNs) cuando la app está cerrada — gap ya
  documentado de Fase 5, sin proveedor elegido todavía.
- Recordatorios recurrentes — no pedidos, ninguna evidencia de necesidad.
- Aviso de voz (`create_reminder` por voz) — depende del asistente de voz,
  explícitamente fuera de alcance por decisión del fundador (sin recursos
  todavía).
