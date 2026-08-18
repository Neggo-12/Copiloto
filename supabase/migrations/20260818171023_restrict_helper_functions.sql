-- 0004_restrict_helper_functions.sql
-- El advisor de seguridad marcó que anon/authenticated pueden ejecutar las
-- funciones helper de RLS directamente vía RPC (p.ej. /rest/v1/rpc/is_chat_participant).
-- Estas funciones solo deben usarse DENTRO de políticas RLS, nunca llamarse
-- directamente sin sesión. Se revoca de "public" (que cubre anon) y se deja
-- solo a "authenticated", que es quien las necesita para que sus propias
-- políticas RLS se evalúen.

revoke execute on function public.is_chat_participant(uuid) from public;
revoke execute on function public.is_chat_admin(uuid) from public;
revoke execute on function public.is_contact_of(uuid) from public;
revoke execute on function public.can_view_status(uuid) from public;

grant execute on function public.is_chat_participant(uuid) to authenticated;
grant execute on function public.is_chat_admin(uuid) to authenticated;
grant execute on function public.is_contact_of(uuid) to authenticated;
grant execute on function public.can_view_status(uuid) to authenticated;
