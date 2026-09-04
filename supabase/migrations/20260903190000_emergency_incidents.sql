-- "Copiloto, llama a la policía" — SOS real (ver docs/decisions/README.md,
-- decisión (33): paquete de datos ya definido en la documentación propia de
-- "Copiloto versión 2" — ID, usuario autenticado, dispositivo, ubicación,
-- timestamp, tipo de emergencia, nivel de confianza, contactos autorizados —
-- NO en ninguna API pública de NUSE/Línea 123, que no existe documentada).
--
-- Cada fila guarda una FOTO real ("snapshot") del nombre/teléfono/correo de
-- la cuenta al momento de crear el incidente, no una referencia que cambie
-- si la persona edita su perfil después — mismo criterio de evidencia que el
-- resto del dominio Emergency (Postgres = persistencia/verdad, ver regla del
-- proyecto). Hoy `profiles` solo tiene `display_name` (texto libre, ver
-- decisión (33)) — se guarda tal cual, no se inventa un nombre/apellido que
-- no existe en el esquema real todavía.
create table if not exists public.emergency_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'policia' check (type in ('policia')),
  status text not null default 'creado'
    check (status in ('creado', 'recibido', 'en_atencion', 'cancelado', 'cerrado')),
  confidence_level text not null default 'alta' check (confidence_level in ('alta', 'media', 'baja')),
  latitude double precision not null,
  longitude double precision not null,
  location_accuracy_meters double precision,
  -- Sin protocolo de dispositivo real todavía (ESP32 de "Copiloto versión 2"
  -- sigue en fase de hardware, ver docs/decisions/README.md) — el único
  -- dispositivo real hoy es la app móvil.
  device text not null default 'app_movil',
  snapshot_display_name text not null,
  snapshot_phone text,
  snapshot_email text,
  -- "Contactos autorizados" del paquete definido en la decisión (33): sin
  -- una fuente real de contactos de emergencia todavía (no existe esa
  -- funcionalidad en el producto) — se deja nullable en vez de inventar un
  -- origen de datos falso.
  authorized_contacts jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists emergency_incidents_user_id_idx on public.emergency_incidents (user_id);
create index if not exists emergency_incidents_created_at_idx on public.emergency_incidents (created_at desc);

alter table public.emergency_incidents enable row level security;

-- Mismo patrón real que `emergency_vehicles` (ver
-- 20260902030914_emergency_vehicles_performance_and_security_hardening.sql):
-- el dueño puede ver SUS incidentes; a propósito NO hay policy de
-- insert/update/delete para `authenticated` — todo escribe pasa por el
-- cliente admin del backend (`EmergencyIncidentsService`, ya autorizado por
-- `SupabaseAuthGuard`/la propia tool antes de llegar aquí), nunca
-- autoservicio directo contra la tabla.
create policy emergency_incidents_select_own
  on public.emergency_incidents
  for select
  to authenticated
  using (user_id = (select auth.uid()));
