do '
begin
  if not exists (
    select 1
    from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = ''public''
      and type.typname = ''instagram_connection_status''
  ) then
    create type public.instagram_connection_status as enum (''active'', ''expired'', ''revoked'', ''needs_reauth'');
  end if;

  if not exists (
    select 1
    from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = ''public''
      and type.typname = ''instagram_lead_status''
  ) then
    create type public.instagram_lead_status as enum (''new'', ''replied'', ''qualified'', ''archived'');
  end if;

  if not exists (
    select 1
    from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = ''public''
      and type.typname = ''instagram_message_direction''
  ) then
    create type public.instagram_message_direction as enum (''inbound'', ''outbound'');
  end if;
end
';

create table if not exists public.instagram_account_connections (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  facebook_user_id text,
  page_id text not null unique,
  page_name text,
  instagram_user_id text not null unique,
  instagram_username text,
  instagram_profile_picture_url text,
  status public.instagram_connection_status not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint instagram_account_connections_creator_key unique (creator_id)
);

create table if not exists public.instagram_leads (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid not null references public.instagram_account_connections (id) on delete cascade,
  instagram_thread_key text not null,
  instagram_scoped_user_id text not null,
  instagram_username text,
  display_name text not null default 'Instagram lead',
  profile_picture_url text,
  lead_status public.instagram_lead_status not null default 'new',
  last_message_text text not null default '',
  last_message_at timestamptz not null default timezone('utc', now()),
  unread_count integer not null default 0 check (unread_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint instagram_leads_connection_thread_key unique (connection_id, instagram_thread_key)
);

create table if not exists public.instagram_lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.instagram_leads (id) on delete cascade,
  connection_id uuid not null references public.instagram_account_connections (id) on delete cascade,
  meta_message_id text unique,
  direction public.instagram_message_direction not null,
  message_type text not null default 'text',
  text_body text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.instagram_webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.instagram_account_connections (id) on delete set null,
  object_type text not null,
  event_type text not null,
  meta_event_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.instagram_connection_secrets (
  connection_id uuid primary key references public.instagram_account_connections (id) on delete cascade,
  page_access_token text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.instagram_oauth_states (
  state text primary key,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  redirect_uri text not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists instagram_account_connections_creator_idx
  on public.instagram_account_connections (creator_id);

create index if not exists instagram_leads_creator_last_message_idx
  on public.instagram_leads (creator_id, last_message_at desc);

create index if not exists instagram_leads_connection_thread_idx
  on public.instagram_leads (connection_id, instagram_thread_key);

create index if not exists instagram_lead_messages_lead_sent_idx
  on public.instagram_lead_messages (lead_id, sent_at asc);

create index if not exists instagram_webhook_events_connection_created_idx
  on public.instagram_webhook_events (connection_id, created_at desc);

create index if not exists instagram_oauth_states_creator_idx
  on public.instagram_oauth_states (creator_id, created_at desc);

drop trigger if exists set_instagram_account_connections_updated_at on public.instagram_account_connections;
create trigger set_instagram_account_connections_updated_at
before update on public.instagram_account_connections
for each row
execute function public.set_updated_at();

drop trigger if exists set_instagram_leads_updated_at on public.instagram_leads;
create trigger set_instagram_leads_updated_at
before update on public.instagram_leads
for each row
execute function public.set_updated_at();

drop trigger if exists set_instagram_connection_secrets_updated_at on public.instagram_connection_secrets;
create trigger set_instagram_connection_secrets_updated_at
before update on public.instagram_connection_secrets
for each row
execute function public.set_updated_at();

alter table public.instagram_account_connections enable row level security;
alter table public.instagram_leads enable row level security;
alter table public.instagram_lead_messages enable row level security;
alter table public.instagram_webhook_events enable row level security;
alter table public.instagram_connection_secrets enable row level security;
alter table public.instagram_oauth_states enable row level security;

drop policy if exists "instagram_account_connections_select_owner" on public.instagram_account_connections;
drop policy if exists "instagram_account_connections_update_owner" on public.instagram_account_connections;
drop policy if exists "instagram_account_connections_delete_owner" on public.instagram_account_connections;

create policy "instagram_account_connections_select_owner"
on public.instagram_account_connections
for select
to authenticated
using (creator_id = (select auth.uid()));

create policy "instagram_account_connections_update_owner"
on public.instagram_account_connections
for update
to authenticated
using (creator_id = (select auth.uid()))
with check (creator_id = (select auth.uid()));

create policy "instagram_account_connections_delete_owner"
on public.instagram_account_connections
for delete
to authenticated
using (creator_id = (select auth.uid()));

drop policy if exists "instagram_leads_select_owner" on public.instagram_leads;
drop policy if exists "instagram_leads_update_owner" on public.instagram_leads;
drop policy if exists "instagram_leads_delete_owner" on public.instagram_leads;

create policy "instagram_leads_select_owner"
on public.instagram_leads
for select
to authenticated
using (creator_id = (select auth.uid()));

create policy "instagram_leads_update_owner"
on public.instagram_leads
for update
to authenticated
using (creator_id = (select auth.uid()))
with check (creator_id = (select auth.uid()));

create policy "instagram_leads_delete_owner"
on public.instagram_leads
for delete
to authenticated
using (creator_id = (select auth.uid()));

drop policy if exists "instagram_lead_messages_select_owner" on public.instagram_lead_messages;

create policy "instagram_lead_messages_select_owner"
on public.instagram_lead_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.instagram_leads lead
    where lead.id = lead_id
      and lead.creator_id = (select auth.uid())
  )
);

drop policy if exists "instagram_webhook_events_select_owner" on public.instagram_webhook_events;

create policy "instagram_webhook_events_select_owner"
on public.instagram_webhook_events
for select
to authenticated
using (
  exists (
    select 1
    from public.instagram_account_connections connection
    where connection.id = connection_id
      and connection.creator_id = (select auth.uid())
  )
);

do '
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = ''supabase_realtime''
      and schemaname = ''public''
      and tablename = ''instagram_account_connections''
  ) then
    alter publication supabase_realtime add table public.instagram_account_connections;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = ''supabase_realtime''
      and schemaname = ''public''
      and tablename = ''instagram_leads''
  ) then
    alter publication supabase_realtime add table public.instagram_leads;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = ''supabase_realtime''
      and schemaname = ''public''
      and tablename = ''instagram_lead_messages''
  ) then
    alter publication supabase_realtime add table public.instagram_lead_messages;
  end if;
end
';
