-- 0001_init_schema.sql
-- CoPiloto — esquema inicial (mensajería, notas, contactos, estados, dispositivo)
-- Basado en docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md,
-- ajustado para coincidir exactamente con proyecto-mensajeria/src/lib/domain/types.ts
-- (ver docs/decisions/ADR-0001-ajustes-esquema-backend.md para el detalle de cada ajuste).

create extension if not exists pgcrypto;

-- ── Enums ──────────────────────────────────────────────────────────────────

create type privacy_audience as enum ('everyone', 'contacts', 'nobody');
create type chat_type as enum ('individual', 'group');
create type chat_role as enum ('member', 'admin');
create type message_kind as enum ('text', 'voice', 'image', 'document', 'location', 'system');
create type message_delivery_state as enum ('delivered', 'read');
create type task_status_kind as enum ('pending', 'done');
create type status_kind as enum ('text', 'media');
create type status_audience_mode as enum ('all', 'except', 'only');
create type contact_source as enum ('device', 'manual');

-- ── profiles ───────────────────────────────────────────────────────────────
-- Extiende auth.users 1:1. is_online e is_phone_verified/is_email_verified NO
-- se guardan aquí: is_online se deriva de Realtime Presence en el cliente, y
-- las verificaciones vienen de auth.users/auth.identities.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique not null,
  phone_country_code text not null,
  email text unique,
  display_name text not null,
  avatar_url text,
  about text,
  last_seen_at timestamptz,
  last_seen_visibility privacy_audience not null default 'everyone',
  profile_photo_visibility privacy_audience not null default 'everyone',
  about_visibility privacy_audience not null default 'everyone',
  two_factor_enabled boolean not null default false,
  notification_settings jsonb not null default '{"messages":true,"voiceNotes":true,"noteReminders":true,"calls":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── contacts ───────────────────────────────────────────────────────────────
-- Rediseñada respecto al borrador: necesita id propio (ContactId del
-- front-end), display_name propio (contactos manuales sin cuenta no tienen
-- profile vinculado) y source/is_invited, que el front-end ya usa.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  contact_profile_id uuid references public.profiles (id) on delete set null,
  display_name text not null,
  phone text not null,
  avatar_url text,
  source contact_source not null default 'manual',
  is_invited boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, phone)
);

create index contacts_user_id_idx on public.contacts (user_id);
create index contacts_contact_profile_id_idx on public.contacts (contact_profile_id) where contact_profile_id is not null;

-- ── chats / chat_participants ───────────────────────────────────────────────

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  type chat_type not null,
  name text,
  photo_url text,
  disappearing_duration_seconds integer, -- 86400 | 604800 | 7776000; null = desactivado
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.chat_participants (
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role chat_role not null default 'member',
  is_pinned boolean not null default false,
  pinned_at timestamptz,
  is_muted boolean not null default false,
  muted_until timestamptz,
  is_archived boolean not null default false,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index chat_participants_user_id_idx on public.chat_participants (user_id);

-- ── messages ────────────────────────────────────────────────────────────────

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  type message_kind not null,
  content text,
  media_url text,
  media_file_name text,
  media_file_size_bytes bigint,
  media_duration_seconds integer,
  waveform jsonb, -- amplitudes normalizadas 0..1 (notas de voz)
  reply_to_id uuid references public.messages (id),
  forwarded_from_chat_id uuid references public.chats (id),
  reply_to_status_id uuid, -- FK a statuses agregada en 0001 tras crear la tabla (ver abajo)
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  expires_at timestamptz
);

create index messages_chat_id_created_at_idx on public.messages (chat_id, created_at desc);
create index messages_reply_to_id_idx on public.messages (reply_to_id) where reply_to_id is not null;

create table public.message_status (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status message_delivery_state not null,
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.location_shares (
  message_id uuid primary key references public.messages (id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  address_label text,
  is_live boolean not null default false,
  live_duration_minutes integer,
  live_expires_at timestamptz,
  stopped_at timestamptz
);

-- ── notes ───────────────────────────────────────────────────────────────────

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text,
  content text not null default '',
  voice_note_url text,
  voice_note_duration_seconds integer,
  waveform jsonb,
  is_task boolean not null default false,
  task_status task_status_kind,
  completed_at timestamptz,
  reminder_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user_id_idx on public.notes (user_id);

-- ── statuses (Estados/Historias) ────────────────────────────────────────────

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type status_kind not null,
  content text,
  media_url text,
  background_color text,
  audience status_audience_mode not null default 'all',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index statuses_user_id_idx on public.statuses (user_id);
create index statuses_expires_at_idx on public.statuses (expires_at);

create table public.status_audience_exceptions (
  status_id uuid not null references public.statuses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (status_id, user_id)
);

create table public.status_views (
  status_id uuid not null references public.statuses (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

-- FK diferida de messages.reply_to_status_id (statuses no existía aún al crear messages)
alter table public.messages
  add constraint messages_reply_to_status_id_fkey
  foreign key (reply_to_status_id) references public.statuses (id);

-- ── paired_devices (casco/placa — simulado hasta que exista hardware real) ──

create table public.paired_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_name text not null,
  device_identifier text, -- MAC/UUID BLE real; null mientras sea simulado
  battery_level integer,
  is_connected boolean not null default false,
  paired_at timestamptz not null default now(),
  last_connected_at timestamptz
);

create index paired_devices_user_id_idx on public.paired_devices (user_id);
