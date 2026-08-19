-- Recordatorios por ubicación (Fase 7). Autoservicio, mismo patrón RLS que
-- user_vehicles/notes (ALL + auth.uid() en USING y WITH CHECK). Un
-- recordatorio se dispara una sola vez (pending -> triggered); no hay
-- recurrencia todavía, no se pidió y no hay evidencia de necesidad.
create table public.location_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 300 check (radius_meters > 0),
  label text,
  status text not null default 'pending' check (status in ('pending', 'triggered', 'cancelled')),
  created_at timestamptz not null default now(),
  triggered_at timestamptz,
  cancelled_at timestamptz
);

-- Índice para la lectura más frecuente: "recordatorios pendientes de este
-- usuario" (usada por ReminderCacheService en cada cache-miss).
create index location_reminders_user_status_idx on public.location_reminders (user_id, status);

alter table public.location_reminders enable row level security;

create policy location_reminders_all_own on public.location_reminders
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
