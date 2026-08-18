-- 0003_storage_buckets.sql
-- Buckets según docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md §3.
-- Convención de rutas (para poder validar con RLS de storage sin tabla extra):
--   avatars/{user_id}/archivo
--   chat-media/{chat_id}/archivo
--   voice-notes/chat/{chat_id}/archivo      (notas de voz de Chats)
--   voice-notes/note/{user_id}/archivo      (notas de voz de Notas)
--   status-media/{status_id}/archivo

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('chat-media', 'chat-media', false),
  ('voice-notes', 'voice-notes', false),
  ('status-media', 'status-media', false)
on conflict (id) do nothing;

-- ── avatars (lectura pública, escritura solo del dueño) ─────────────────────

create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

create policy avatars_owner_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_owner_update on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_owner_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── chat-media (privado, solo participantes del chat) ───────────────────────

create policy chat_media_participant_select on storage.objects
  for select to authenticated using (
    bucket_id = 'chat-media'
    and public.is_chat_participant((storage.foldername(name))[1]::uuid)
  );

create policy chat_media_participant_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'chat-media'
    and public.is_chat_participant((storage.foldername(name))[1]::uuid)
  );

create policy chat_media_owner_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'chat-media' and owner = auth.uid()
  );

-- ── voice-notes (privado; chat/{chat_id}/… o note/{user_id}/…) ─────────────

create policy voice_notes_select on storage.objects
  for select to authenticated using (
    bucket_id = 'voice-notes'
    and (
      ((storage.foldername(name))[1] = 'chat'
        and public.is_chat_participant((storage.foldername(name))[2]::uuid))
      or
      ((storage.foldername(name))[1] = 'note'
        and (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

create policy voice_notes_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'voice-notes'
    and (
      ((storage.foldername(name))[1] = 'chat'
        and public.is_chat_participant((storage.foldername(name))[2]::uuid))
      or
      ((storage.foldername(name))[1] = 'note'
        and (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

create policy voice_notes_owner_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'voice-notes' and owner = auth.uid()
  );

-- ── status-media (privado; visibilidad según audiencia del estado) ─────────

create policy status_media_select on storage.objects
  for select to authenticated using (
    bucket_id = 'status-media'
    and public.can_view_status((storage.foldername(name))[1]::uuid)
  );

create policy status_media_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'status-media'
    and exists (
      select 1 from public.statuses s
      where s.id = (storage.foldername(name))[1]::uuid and s.user_id = auth.uid()
    )
  );

create policy status_media_owner_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'status-media' and owner = auth.uid()
  );

-- Nota: la limpieza automática de status-media tras 24h (mencionada en la spec)
-- no está implementada todavía — requiere un cron/Edge Function programado.
-- Ver docs/architecture/TECHNICAL_DEBT.md.
