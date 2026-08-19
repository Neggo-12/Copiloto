-- Registro de vehículos del usuario (carro/moto) — autoservicio, no admin-only
-- (a diferencia de emergency_vehicles, que requiere verificación externa).
-- Un usuario puede tener a lo sumo un carro y una moto registrados
-- (unique(user_id, vehicle_type)) — modela "el cliente puede tener carro y
-- moto y andar en los dos en diferentes días/horas" (decisión del fundador,
-- ver ADR-0014-vehicle-registration-and-driving-mode.md).
--
-- No se agrega unicidad global de `plate` todavía: el propósito de seguridad
-- mencionado por el fundador ("luego nos puede servir") no está definido
-- como caso de uso real todavía — agregarla ahora sería complejidad sin
-- evidencia (regla del proyecto). Queda documentado como decisión abierta.
create table public.user_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_type text not null check (vehicle_type in ('car', 'motorcycle')),
  plate text not null,
  nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vehicle_type)
);

create index user_vehicles_user_id_idx on public.user_vehicles (user_id);

alter table public.user_vehicles enable row level security;

-- Autoservicio total: el usuario solo ve/crea/edita/borra sus propios
-- vehículos. Mismo patrón que `notes_all_own` (ALL + auth.uid() en
-- USING y WITH CHECK).
create policy user_vehicles_all_own on public.user_vehicles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
