-- Fase 1 del cronograma (docs/decisions/05_CRONOGRAMA_...): capa de
-- permisos/autorizacion para el dominio Emergency. Solo define QUIEN puede
-- activar una emergencia -- el motor de corredor/conflicto (Fase 3) todavia
-- no existe. Regla de CLAUDE.md §8: "Las emergencias solo pueden ser
-- activadas por identidades/vehiculos autorizados".
--
-- Verificacion deliberadamente NO autoservicio: no hay policy de INSERT para
-- anon/authenticated. Verificar una ambulancia es una operacion administrativa
-- (hoy via SQL directo/MCP; mas adelante via un panel de operador), nunca algo
-- que el propio conductor pueda auto-otorgarse.
--
-- Nota: sin trigger de updated_at a proposito -- el patron ya establecido en
-- este proyecto (confirmado: 0 triggers en el schema public) es setear
-- updated_at explicitamente desde el codigo de aplicacion, no via trigger de DB.

create table public.emergency_vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_type text not null default 'ambulance' check (vehicle_type in ('ambulance')),
  plate text not null,
  organization text,
  verified boolean not null default false,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.emergency_vehicles is
  'Ambulancias/conductores autorizados a activar el Emergency Corridor. La verificacion es administrativa, nunca autoservicio.';

create unique index emergency_vehicles_driver_id_key on public.emergency_vehicles(driver_id);

alter table public.emergency_vehicles enable row level security;

-- El conductor solo puede ver su propio registro (para saber su estado de
-- verificacion en la app); nadie mas puede leer esta tabla via API publica.
create policy emergency_vehicles_select_own
  on public.emergency_vehicles
  for select
  to authenticated
  using (driver_id = auth.uid());

-- Sin policies de insert/update/delete para authenticated/anon a proposito:
-- la verificacion de ambulancias se hace fuera de la API publica (service_role).

-- Helper SECURITY DEFINER, mismo patron que is_chat_participant/is_chat_admin/
-- is_chat_creator, para uso en RLS de las tablas del corredor (Fase 3).
create or replace function public.is_verified_ambulance_driver(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.emergency_vehicles ev
    where ev.driver_id = p_user_id
      and ev.verified = true
      and ev.active = true
  );
$$;

grant execute on function public.is_verified_ambulance_driver(uuid) to authenticated;
