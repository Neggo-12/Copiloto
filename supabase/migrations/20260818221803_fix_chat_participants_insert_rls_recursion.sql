-- La politica de INSERT de chat_participants comprobaba si yo era el
-- creador del chat con un EXISTS directo contra la tabla `chats`. Ese
-- EXISTS se ejecuta con los permisos del usuario que llama (no bypassa
-- RLS), y la politica de SELECT de `chats` exige ya ser participante
-- del chat (`is_chat_participant`) -- que es justo lo que se esta
-- intentando crear con este INSERT. Resultado: nunca se podia crear un
-- chat 1-a-1 nuevo con un segundo participante (403 permanente al
-- tocar "Enviar mensaje" con un contacto nuevo).
--
-- Igual que is_chat_participant/is_chat_admin, esta funcion es
-- SECURITY DEFINER (corre como el dueno, que tiene BYPASSRLS), asi que
-- SI puede ver la fila de `chats` recien creada sin depender de que ya
-- exista una fila de chat_participants.
create or replace function public.is_chat_creator(p_chat_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat_id and c.created_by = auth.uid()
  );
$$;

alter function public.is_chat_creator(uuid) set search_path = public;

grant execute on function public.is_chat_creator(uuid) to anon, authenticated, service_role;

alter policy chat_participants_insert on public.chat_participants
  with check (
    (user_id = auth.uid())
    or is_chat_creator(chat_id)
    or is_chat_admin(chat_id)
  );
