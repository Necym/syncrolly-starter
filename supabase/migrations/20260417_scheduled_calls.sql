create table if not exists public.scheduled_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  attendee_profile_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(trim(title)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint scheduled_calls_time_order_check
    check (ends_at > starts_at)
);

create index if not exists scheduled_calls_owner_starts_at_idx
  on public.scheduled_calls (owner_id, starts_at asc);

create index if not exists scheduled_calls_attendee_idx
  on public.scheduled_calls (attendee_profile_id, starts_at asc);

drop trigger if exists set_scheduled_calls_updated_at on public.scheduled_calls;

create trigger set_scheduled_calls_updated_at
before update on public.scheduled_calls
for each row
execute function public.set_updated_at();

alter table public.scheduled_calls enable row level security;

drop policy if exists "scheduled_calls_select_owner_or_attendee" on public.scheduled_calls;
drop policy if exists "scheduled_calls_insert_owner" on public.scheduled_calls;
drop policy if exists "scheduled_calls_update_owner" on public.scheduled_calls;
drop policy if exists "scheduled_calls_delete_owner" on public.scheduled_calls;

create policy "scheduled_calls_select_owner_or_attendee"
on public.scheduled_calls
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (select auth.uid()) = attendee_profile_id
);

create policy "scheduled_calls_insert_owner"
on public.scheduled_calls
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "scheduled_calls_update_owner"
on public.scheduled_calls
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "scheduled_calls_delete_owner"
on public.scheduled_calls
for delete
to authenticated
using ((select auth.uid()) = owner_id);
