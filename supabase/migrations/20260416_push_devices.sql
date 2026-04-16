create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'web', 'unknown')),
  device_name text,
  device_model text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists push_devices_user_idx on public.push_devices (user_id);
create index if not exists push_devices_last_seen_idx on public.push_devices (last_seen_at desc);

drop trigger if exists set_push_devices_updated_at on public.push_devices;

create trigger set_push_devices_updated_at
before update on public.push_devices
for each row
execute function public.set_updated_at();

create or replace function public.register_push_device(
  expo_push_token text,
  device_platform text default 'unknown',
  device_name text default null,
  device_model text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  normalized_platform text := coalesce(nullif(trim(device_platform), ''), 'unknown');
  normalized_name text := nullif(trim(device_name), '');
  normalized_model text := nullif(trim(device_model), '');
  registered_id uuid;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(trim(expo_push_token), '') = '' then
    raise exception 'Push token is required';
  end if;

  insert into public.push_devices (
    user_id,
    expo_push_token,
    platform,
    device_name,
    device_model,
    last_seen_at
  )
  values (
    viewer_id,
    trim(expo_push_token),
    normalized_platform,
    normalized_name,
    normalized_model,
    timezone('utc', now())
  )
  on conflict (expo_push_token) do update
    set user_id = viewer_id,
        platform = excluded.platform,
        device_name = excluded.device_name,
        device_model = excluded.device_model,
        last_seen_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
  returning id into registered_id;

  return registered_id;
end;
$$;

create or replace function public.unregister_push_device(
  expo_push_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.push_devices device
  where device.user_id = viewer_id
    and device.expo_push_token = trim(unregister_push_device.expo_push_token);
end;
$$;

alter table public.push_devices enable row level security;

create policy "push_devices_select_self"
on public.push_devices
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on function public.register_push_device(text, text, text, text) from public;
revoke all on function public.unregister_push_device(text) from public;

grant execute on function public.register_push_device(text, text, text, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;
