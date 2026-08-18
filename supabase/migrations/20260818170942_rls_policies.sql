-- 0002_rls_policies.sql
-- Todo el aislamiento de datos vive en RLS, no en el cliente (mandato explícito
-- del fundador tras la mala experiencia previa con Lovable — ver
-- docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md §4 y CLAUDE.md §8).

-- ── Funciones helper (security definer, evitan recursión de RLS) ───────────

create or replace function public.is_chat_participant(p_chat_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.chat_participants cp
    where cp.chat_id = p_chat_id and cp.user_id = auth.uid()
  );
$$;

create or replace function public.is_chat_admin(p_chat_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.chat_participants cp
    where cp.chat_id = p_chat_id and cp.user_id = auth.uid() and cp.role = 'admin'
  );
$$;

create or replace function public.is_contact_of(p_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.contacts c
    where c.user_id = p_owner_id and c.contact_profile_id = auth.uid()
  );
$$;

create or replace function public.can_view_status(p_status_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when s.user_id = auth.uid() then true
    when s.audience = 'all' then
      public.is_contact_of(s.user_id)
      and not exists (
        select 1 from public.status_audience_exceptions e
        where e.status_id = s.id and e.user_id = auth.uid()
      )
    when s.audience = 'except' then
      public.is_contact_of(s.user_id)
      and not exists (
        select 1 from public.status_audience_exceptions e
        where e.status_id = s.id and e.user_id = auth.uid()
      )
    when s.audience = 'only' then
      exists (
        select 1 from public.status_audience_exceptions e
        where e.status_id = s.id and e.user_id = auth.uid()
      )
    else false
  end
  from public.statuses s
  where s.id = p_status_id;
$$;

-- ── Habilitar RLS en todas las tablas ────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_status enable row level security;
alter table public.message_reactions enable row level security;
alter table public.location_shares enable row level security;
alter table public.notes enable row level security;
alter table public.statuses enable row level security;
alter table public.status_audience_exceptions enable row level security;
alter table public.status_views enable row level security;
alter table public.paired_devices enable row level security;

-- ── profiles ─────────────────────────────────────────────────────────────

create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);

create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── contacts ─────────────────────────────────────────────────────────────

create policy contacts_all_own on public.contacts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── chats ────────────────────────────────────────────────────────────────

create policy chats_select_participant on public.chats
  for select to authenticated using (public.is_chat_participant(id));

create policy chats_insert_authenticated on public.chats
  for insert to authenticated with check (created_by = auth.uid());

create policy chats_update_participant on public.chats
  for update to authenticated using (public.is_chat_participant(id));

-- ── chat_participants ───────────────────────────────────────────────────

create policy chat_participants_select on public.chat_participants
  for select to authenticated using (public.is_chat_participant(chat_id));

create policy chat_participants_insert on public.chat_participants
  for insert to authenticated with check (
    user_id = auth.uid()
    or exists (select 1 from public.chats c where c.id = chat_id and c.created_by = auth.uid())
    or public.is_chat_admin(chat_id)
  );

create policy chat_participants_update_self on public.chat_participants
  for update to authenticated
  using (user_id = auth.uid() or public.is_chat_admin(chat_id))
  with check (user_id = auth.uid() or public.is_chat_admin(chat_id));

create policy chat_participants_delete on public.chat_participants
  for delete to authenticated using (user_id = auth.uid() or public.is_chat_admin(chat_id));

-- ── messages ─────────────────────────────────────────────────────────────

create policy messages_select_participant on public.messages
  for select to authenticated using (public.is_chat_participant(chat_id));

create policy messages_insert_participant on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and public.is_chat_participant(chat_id)
  );

create policy messages_update_own_window on public.messages
  for update to authenticated
  using (sender_id = auth.uid() and now() - created_at < interval '15 minutes')
  with check (sender_id = auth.uid());

-- ── message_status ───────────────────────────────────────────────────────

create policy message_status_select on public.message_status
  for select to authenticated using (
    exists (
      select 1 from public.messages m
      where m.id = message_status.message_id and public.is_chat_participant(m.chat_id)
    )
  );

create policy message_status_upsert_own on public.message_status
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_status.message_id and public.is_chat_participant(m.chat_id)
    )
  );

-- ── message_reactions ────────────────────────────────────────────────────

create policy message_reactions_select on public.message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id and public.is_chat_participant(m.chat_id)
    )
  );

create policy message_reactions_own on public.message_reactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id and public.is_chat_participant(m.chat_id)
    )
  );

-- ── location_shares ──────────────────────────────────────────────────────

create policy location_shares_select on public.location_shares
  for select to authenticated using (
    exists (
      select 1 from public.messages m
      where m.id = location_shares.message_id and public.is_chat_participant(m.chat_id)
    )
  );

create policy location_shares_insert on public.location_shares
  for insert to authenticated with check (
    exists (
      select 1 from public.messages m
      where m.id = location_shares.message_id and m.sender_id = auth.uid()
    )
  );

create policy location_shares_update_sender on public.location_shares
  for update to authenticated using (
    exists (
      select 1 from public.messages m
      where m.id = location_shares.message_id and m.sender_id = auth.uid()
    )
  );

-- ── notes ────────────────────────────────────────────────────────────────

create policy notes_all_own on public.notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── statuses ─────────────────────────────────────────────────────────────

create policy statuses_select_visible on public.statuses
  for select to authenticated using (public.can_view_status(id));

create policy statuses_insert_own on public.statuses
  for insert to authenticated with check (user_id = auth.uid());

create policy statuses_update_delete_own on public.statuses
  for update to authenticated using (user_id = auth.uid());

create policy statuses_delete_own on public.statuses
  for delete to authenticated using (user_id = auth.uid());

-- ── status_audience_exceptions ──────────────────────────────────────────

create policy status_audience_exceptions_owner on public.status_audience_exceptions
  for all to authenticated
  using (exists (select 1 from public.statuses s where s.id = status_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.statuses s where s.id = status_id and s.user_id = auth.uid()));

-- ── status_views ─────────────────────────────────────────────────────────

create policy status_views_select on public.status_views
  for select to authenticated using (
    viewer_id = auth.uid()
    or exists (select 1 from public.statuses s where s.id = status_id and s.user_id = auth.uid())
  );

create policy status_views_insert_own on public.status_views
  for insert to authenticated with check (
    viewer_id = auth.uid() and public.can_view_status(status_id)
  );

-- ── paired_devices ───────────────────────────────────────────────────────

create policy paired_devices_all_own on public.paired_devices
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
