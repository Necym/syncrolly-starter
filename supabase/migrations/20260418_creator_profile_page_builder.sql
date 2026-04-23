alter table public.creator_profiles
add column if not exists page_blocks jsonb not null default '[]'::jsonb;

update public.creator_profiles
set page_blocks = '[]'::jsonb
where page_blocks is null;

drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(
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
  dm_access public.dm_access,
  dm_intake_policy public.dm_intake_policy,
  dm_fee_usd integer,
  page_blocks jsonb
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
    case when profile.role = 'creator' then creator.dm_access else null end as dm_access,
    case when profile.role = 'creator' then creator.dm_intake_policy else null end as dm_intake_policy,
    case when profile.role = 'creator' then creator.dm_fee_usd else null end as dm_fee_usd,
    case when profile.role = 'creator' then creator.page_blocks else '[]'::jsonb end as page_blocks
  from public.profiles profile
  left join public.creator_profiles creator
    on creator.user_id = profile.id
  where profile.id = profile_user_id
  limit 1;
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to authenticated;
