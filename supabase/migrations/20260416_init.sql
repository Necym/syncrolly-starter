create extension if not exists pgcrypto;

create type public.user_role as enum ('creator', 'supporter');
create type public.user_presence as enum ('online', 'away', 'offline');
create type public.access_level as enum ('free', 'subscriber', 'paid', 'vip');
create type public.dm_access as enum ('free', 'subscriber_only', 'paid_only');
create type public.thread_status as enum ('active', 'request', 'flagged');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  display_name text not null,
  avatar_url text,
  accent_color text not null default '#003f87',
  presence public.user_presence not null default 'offline',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.creator_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  niche text not null default '',
  headline text not null default '',
  dm_access public.dm_access not null default 'subscriber_only',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.supporter_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  access_level public.access_level not null default 'free',
  total_spend integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  subject text not null default '',
  status public.thread_status not null default 'active',
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index conversations_last_message_idx on public.conversations (last_message_at desc nulls last);
create index conversation_participants_user_idx on public.conversation_participants (user_id);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.sync_conversation_last_message_at()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = timezone('utc', now())
  where id = new.conversation_id;

  return new;
end;
$$;

create schema if not exists private;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name, avatar_url)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'supporter'),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'New user'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.is_conversation_participant(conversation_uuid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.conversation_participants participant
    where participant.conversation_id = conversation_uuid
      and participant.user_id = (select auth.uid())
  );
$$;

create or replace function public.shares_conversation_with(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.conversation_participants me
    join public.conversation_participants other
      on other.conversation_id = me.conversation_id
    where me.user_id = (select auth.uid())
      and other.user_id = target_user_id
  );
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger set_creator_profiles_updated_at
before update on public.creator_profiles
for each row
execute function public.set_updated_at();

create trigger set_supporter_profiles_updated_at
before update on public.supporter_profiles
for each row
execute function public.set_updated_at();

create trigger set_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

create trigger sync_conversation_last_message_at
after insert on public.messages
for each row
execute function public.sync_conversation_last_message_at();

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.supporter_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create policy "profiles_select_self_or_shared"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) = id
  or (select public.shares_conversation_with(id))
);

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "creator_profiles_select_self_or_shared"
on public.creator_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.shares_conversation_with(user_id))
);

create policy "creator_profiles_upsert_self"
on public.creator_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "supporter_profiles_select_self_or_shared"
on public.supporter_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.shares_conversation_with(user_id))
);

create policy "supporter_profiles_upsert_self"
on public.supporter_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "conversations_select_participants"
on public.conversations
for select
to authenticated
using ((select public.is_conversation_participant(id)));

create policy "conversations_insert_creator_only"
on public.conversations
for insert
to authenticated
with check ((select auth.uid()) = created_by);

create policy "conversations_update_participants"
on public.conversations
for update
to authenticated
using ((select public.is_conversation_participant(id)))
with check ((select public.is_conversation_participant(id)));

create policy "conversation_participants_select_participants"
on public.conversation_participants
for select
to authenticated
using ((select public.is_conversation_participant(conversation_id)));

create policy "conversation_participants_insert_creator_or_self"
on public.conversation_participants
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.conversations conversation
    where conversation.id = conversation_id
      and conversation.created_by = (select auth.uid())
  )
);

create policy "conversation_participants_update_self"
on public.conversation_participants
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "messages_select_participants"
on public.messages
for select
to authenticated
using ((select public.is_conversation_participant(conversation_id)));

create policy "messages_insert_sender_participant"
on public.messages
for insert
to authenticated
with check (
  (select auth.uid()) = sender_id
  and (select public.is_conversation_participant(conversation_id))
);
