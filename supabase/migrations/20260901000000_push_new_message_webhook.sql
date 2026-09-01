-- Fase 5 (push de mensajería): push real para mensajes de chat nuevos.
--
-- Gap documentado como "fuera de alcance" en ADR-0033: proyecto-mensajeria
-- inserta mensajes DIRECTO en Supabase (ADR-0018) — nunca pasan por el
-- backend NestJS, así que `WebPushService` (adapter real de Web Push que ya
-- existe) no tiene dónde engancharse para un mensaje nuevo. Esta migración
-- resuelve eso con un trigger real de Postgres (no un mecanismo nuevo tipo
-- Kafka/microservicio) que llama a una Edge Function nueva
-- (`notify-new-message`) en cada INSERT real sobre `messages`.
--
-- Nunca bloquea ni retrasa el guardado del mensaje: `net.http_post` (pg_net)
-- encola la petición HTTP de forma asíncrona — si la Edge Function está
-- caída, lenta o mal configurada, el INSERT del mensaje real no se entera ni
-- se demora.

-- 1) pg_net — extensión oficial de Supabase para hacer HTTP real desde
--    Postgres (usada por el propio feature "Database Webhooks" del
--    Dashboard). No estaba habilitada todavía en este proyecto.
create extension if not exists pg_net with schema extensions;

-- 2) Secreto compartido entre este trigger y la Edge Function, generado por
--    la base de datos MISMA (nadie lo escribe ni lo ve en texto plano — ni
--    en este chat, ni en un .env, ni en un comando de terminal). Sirve para
--    que la Edge Function sepa que la llamada viene de verdad de este
--    trigger, no de cualquiera que adivine la URL pública de la función.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'edge_function_shared_secret') then
    perform vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'edge_function_shared_secret',
      'Secreto compartido entre el trigger notify_new_message (tabla messages) y la Edge Function notify-new-message. Generado por Postgres, nunca pasó por chat/.env.'
    );
  end if;
end $$;

-- 3) Función de solo lectura del secreto, expuesta por RPC — la Edge
--    Function la llama con su propio service role (nunca se otorga a
--    `anon`/`authenticated`, mismo criterio de "nunca exponer secretos al
--    cliente" que ya aplica a las API keys de proveedores).
create or replace function public.get_edge_webhook_secret()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'edge_function_shared_secret'
  limit 1;
$$;

revoke all on function public.get_edge_webhook_secret() from public, anon, authenticated;
grant execute on function public.get_edge_webhook_secret() to service_role;

-- 4) Trigger real: en cada mensaje nuevo (no de tipo "system", no borrado)
--    manda SOLO el id del mensaje a la Edge Function — a propósito, nunca el
--    contenido/remitente/chat. La Edge Function los vuelve a leer ahí mismo
--    de la base real; nunca confía en lo que venga en este payload para
--    decidir a quién avisar ni qué mostrar (mismo criterio de
--    "no confiar en datos sin verificar" que ya usa
--    `MessagingService.assertParticipant` en el backend).
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  shared_secret text;
begin
  if new.type = 'system' or new.deleted_at is not null then
    return new;
  end if;

  select decrypted_secret into shared_secret
  from vault.decrypted_secrets
  where name = 'edge_function_shared_secret'
  limit 1;

  if shared_secret is null then
    -- Secreto todavía no se pudo crear (no debería pasar tras el paso 2,
    -- pero por si acaso) — no truena el INSERT real, solo se salta el aviso.
    return new;
  end if;

  perform net.http_post(
    url := 'https://wrkuusacwkdazfwynhkz.supabase.co/functions/v1/notify-new-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', shared_secret
    ),
    body := jsonb_build_object('message_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
after insert on public.messages
for each row
execute function public.notify_new_message();
