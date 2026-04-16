alter table public.profiles
add column if not exists is_discoverable boolean not null default true;

create or replace function public.search_profiles(search_term text default '')
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  accent_color text,
  presence public.user_presence,
  role public.user_role
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    profile.id,
    profile.display_name,
    profile.avatar_url,
    profile.accent_color,
    profile.presence,
    profile.role
  from public.profiles profile
  where (select auth.uid()) is not null
    and profile.is_discoverable = true
    and profile.id <> (select auth.uid())
    and (
      coalesce(trim(search_term), '') = ''
      or profile.display_name ilike '%' || trim(search_term) || '%'
    )
  order by profile.display_name asc
  limit 24;
$$;
