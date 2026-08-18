-- Faltaba el estado intermedio "delivered" (2 chulos grises): nada escribia
-- nunca esa fila en message_status, asi que un mensaje pasaba directo de
-- "sent" (1 chulo) a "read" (2 chulos azules) sin pasar por "entregado".
--
-- Esta funcion la llama el destinatario (nunca el remitente) apenas su app
-- recibe el mensaje por Realtime -- no hace falta tener el chat abierto,
-- igual que en WhatsApp: "entregado" significa que llego al dispositivo, no
-- que la persona ya lo vio.
--
-- El "where message_status.status <> 'read'" evita una condicion de carrera:
-- si el destinatario YA estaba con el chat abierto cuando llega el mensaje,
-- el marcado de "leido" (markChatReadRemote) y este marcado de "entregado"
-- pueden llegar casi al mismo tiempo; sin el guard, si "entregado" llega
-- despues de "leido" bajaria el estado por error.
create or replace function public.mark_messages_delivered(p_message_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.message_status (message_id, user_id, status)
  select m_id, auth.uid(), 'delivered'::message_delivery_state
  from unnest(p_message_ids) as m_id
  on conflict (message_id, user_id) do update
    set status = 'delivered', updated_at = now()
    where message_status.status <> 'read';
$$;

grant execute on function public.mark_messages_delivered(uuid[]) to authenticated;
