# ADR-0001 — Esquema real de Supabase aplicado, con ajustes sobre el borrador

**Fecha:** 2026-08-18
**Estado:** Aplicado
**Proyecto Supabase:** `Copiloto` (`wrkuusacwkdazfwynhkz`, región `ca-central-1`)

## Contexto

`docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md` (12 de agosto) era un
borrador de diseño, escrito antes de tener el export real del front-end. El propio
documento pedía cruzar sus nombres contra el código real de Lovable antes de aplicar
nada ("reviso que los nombres coincidan con este esquema, ajusto lo que haga falta").

Con el proyecto Supabase "Copiloto" ya creado (confirmado 2026-08-18) y el front-end ya
inspeccionado en `docs/architecture/CURRENT_ARCHITECTURE.md`, se aplicó el esquema real
directamente, con los ajustes que salieron de ese cruce.

## Decisión

Se aplicaron 4 migraciones al proyecto `Copiloto`: `init_schema`, `rls_policies`,
`storage_buckets`, `restrict_helper_functions`. 13 tablas, todas con RLS habilitado.

## Ajustes respecto al borrador (y por qué)

1. **`contacts` rediseñada.** El borrador usaba PK compuesta (`user_id`,
   `contact_phone`) sin `id` propio. El front-end (`Contact` en `types.ts`) espera un
   `id: ContactId` estable, `displayName` propio (contactos manuales sin cuenta no
   tienen perfil vinculado), `source` (`device`/`manual`) e `isInvited`. Se agregó `id`
   uuid PK, `display_name`, `source`, `is_invited`, y se renombró `contact_id` →
   `contact_profile_id` para dejar claro que apunta a un perfil, no a otro contacto.

2. **Enums alineados al contrato del front-end, no al borrador:**
   - `task_status`: el borrador decía `pending`/`completed`; el front-end
     (`TaskStatus`) usa `pending`/`done`. Se usó `done`.
   - `status_kind` (tipo de Estado/Historia): el borrador distinguía
     `text`/`image`/`video`; el front-end (`StatusKind`) solo tiene `text`/`media`. Se
     usó `text`/`media`.
   - `status_audience_mode`: el borrador usaba `everyone`/`contacts_except`/
     `only_share_with`; el front-end (`StatusAudienceMode`) usa `all`/`except`/`only`.
     Se usó `all`/`except`/`only`.

3. **Campos que el borrador omitió y el front-end sí necesita:**
   - `profiles.phone_country_code` (frontend `UserProfile.phoneCountryCode`).
   - `profiles.notification_settings` (jsonb) para `NotificationSettings`
     (`messages`/`voiceNotes`/`noteReminders`/`calls`) — no existía ninguna tabla ni
     columna para esto en el borrador.
   - `profiles.last_seen_at` — el borrador no lo incluía.
   - `chat_participants.pinned_at` — necesario para ordenar chats fijados
     (`Chat.pinnedAt` en el front-end); el borrador solo tenía `is_pinned` booleano.
   - `chat_participants.last_read_at` — cursor de lectura para calcular
     `unreadCount` sin duplicar un contador (ver punto 5).
   - `messages.reply_to_status_id` — falta total en el borrador: el front-end permite
     responder a un Estado desde un chat 1 a 1 (`Message.statusReply`), y no había
     ninguna columna para esa relación.
   - `messages.waveform`, `media_file_name`, `media_file_size_bytes` — el front-end
     guarda estos datos en `MessageAttachment` y el borrador no los contemplaba.

4. **`is_online`, `isPhoneVerified`, `isEmailVerified` — deliberadamente NO
   persistidos en `profiles`.** `is_online` se deriva de Supabase Realtime Presence en
   el cliente (dato efímero, no de base de datos). Las dos verificaciones vienen de
   `auth.users`/`auth.identities`, que ya las administra Supabase Auth — duplicarlas en
   `profiles` sería una fuente de verdad redundante y propensa a desincronizarse.

5. **`unreadCount`/`lastMessagePreview`/`lastMessageAt` no se guardan como columnas.**
   El borrador no las mencionaba explícitamente, pero el front-end las necesita en
   `Chat`. Se resolvió con `chat_participants.last_read_at` como cursor: el conteo de
   no leídos y la vista previa se calculan con una consulta/vista sobre `messages`, no
   con contadores desnormalizados que puedan desincronizarse. **Pendiente:** crear esa
   vista (`docs/architecture/MISSING_CAPABILITIES.md`).

6. **Funciones helper `security definer` para RLS** (`is_chat_participant`,
   `is_chat_admin`, `is_contact_of`, `can_view_status`). El advisor de seguridad de
   Supabase marca (WARN) que `authenticated` puede ejecutarlas directamente vía RPC.
   Se revocó `EXECUTE` de `anon`/`public` explícitamente (migración
   `restrict_helper_functions`); el permiso a `authenticated` es necesario para que
   las políticas RLS de los propios usuarios autenticados se evalúen y se deja así a
   propósito — es el patrón estándar de Supabase para este tipo de función. Riesgo
   residual aceptado: un usuario autenticado podría invocar `is_chat_participant` con
   un `chat_id` ajeno para confirmar si pertenece a un chat que no conocía (los IDs son
   UUID v4, no enumerables). Ver `docs/architecture/TECHNICAL_DEBT.md`.

7. **Storage: convención de rutas por carpeta**, necesaria para que las políticas de
   `storage.objects` puedan validar pertenencia sin tablas adicionales:
   `avatars/{user_id}/…`, `chat-media/{chat_id}/…`,
   `voice-notes/chat/{chat_id}/…` y `voice-notes/note/{user_id}/…`,
   `status-media/{status_id}/…`. El borrador no especificaba convención de rutas.

## No implementado todavía (fuera de alcance de esta migración)

- Vista/función para `unreadCount` y `lastMessagePreview` (punto 5).
- Job/Edge Function de limpieza automática de `status-media` tras 24h.
- Trigger que actualice `profiles.updated_at`/`notes.updated_at` automáticamente.
- Conexión real del front-end a este esquema (sigue en mock-data).
