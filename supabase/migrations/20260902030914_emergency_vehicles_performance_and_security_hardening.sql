-- Fase 8 (Rendimiento/Seguridad) del backend — hallazgos reales de
-- Supabase Advisors (get_advisors) sobre emergency_vehicles, la única
-- tabla real del dominio Emergency Corridor. No toca nada del dominio de
-- mensajeria (chats/messages/statuses/contacts/etc.) — queda fuera de
-- este alcance a proposito, documentado aparte en ADR-0039.

-- 1) Indice real faltante en una FK real (Advisor: unindexed_foreign_keys).
create index if not exists emergency_vehicles_verified_by_idx
  on public.emergency_vehicles (verified_by);

-- 2) RLS: auth.uid() se reevaluaba por cada fila (Advisor: auth_rls_initplan).
-- Mismo resultado exacto, solo se evalua una vez por consulta en vez de
-- una vez por fila.
drop policy if exists emergency_vehicles_select_own on public.emergency_vehicles;
create policy emergency_vehicles_select_own
  on public.emergency_vehicles
  for select
  to authenticated
  using (driver_id = (select auth.uid()));

-- 3) is_verified_ambulance_driver: SECURITY DEFINER, sin uso real hoy
-- (confirmado: ni el backend la llama via RPC, ni ninguna policy RLS la
-- referencia) pero ejecutable por CUALQUIERA sin autenticar (anon) via
-- RPC publica — permite consultar si un userId arbitrario es ambulancia
-- verificada activa ahora mismo, sin ninguna autorizacion real. Se
-- restringe el acceso (no se borra la funcion, puede tener uso futuro
-- real desde el backend con el service role, que conserva su grant
-- explicito).
revoke execute on function public.is_verified_ambulance_driver(uuid)
  from public, anon, authenticated;
