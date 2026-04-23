create or replace function public.get_public_profile(
  profile_user_id uuid
)
returns table (
  id uuid,
  role public.user_role,
  display_name text,
  avatar_url text,
  cover_image_url text,
  bio text,
  accent_color text,
  presence public.user_presence,
  niche text,
  headline text,
  dm_access public.dm_access
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    profile.id,
    profile.role,
    profile.display_name,
    profile.avatar_url,
    profile.cover_image_url,
    profile.bio,
    profile.accent_color,
    profile.presence,
    case when profile.role = 'creator' then creator.niche else null end as niche,
    case when profile.role = 'creator' then creator.headline else null end as headline,
    case when profile.role = 'creator' then creator.dm_access else null end as dm_access
  from public.profiles profile
  left join public.creator_profiles creator
    on creator.user_id = profile.id
  where profile.id = profile_user_id
  limit 1;
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to authenticated;
