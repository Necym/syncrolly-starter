do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'dm_intake_policy'
  ) then
    create type public.dm_intake_policy as enum ('direct_message', 'form', 'paid_fee');
  end if;
end
$$;

alter table public.creator_profiles
add column if not exists dm_intake_policy public.dm_intake_policy not null default 'direct_message',
add column if not exists dm_fee_usd integer not null default 25;

alter table public.creator_profiles
drop constraint if exists creator_profiles_dm_fee_usd_check;

alter table public.creator_profiles
add constraint creator_profiles_dm_fee_usd_check
check (dm_fee_usd >= 1);

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
  dm_fee_usd integer
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
    case when profile.role = 'creator' then creator.dm_fee_usd else null end as dm_fee_usd
  from public.profiles profile
  left join public.creator_profiles creator
    on creator.user_id = profile.id
  where profile.id = profile_user_id
  limit 1;
$$;

create or replace function public.get_or_create_direct_conversation(
  target_user_id uuid,
  conversation_subject text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  existing_conversation_id uuid;
  existing_status public.thread_status;
  new_conversation_id uuid;
  resolved_status public.thread_status := 'active';
  viewer_role public.user_role;
  target_role public.user_role;
  target_dm_intake_policy public.dm_intake_policy := 'direct_message';
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_user_id is null or target_user_id = viewer_id then
    raise exception 'Invalid target user';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = target_user_id
  ) then
    raise exception 'Target user not found';
  end if;

  resolved_status := public.resolve_direct_thread_status(viewer_id, target_user_id);

  select participant.conversation_id
  into existing_conversation_id
  from public.conversation_participants participant
  join public.conversation_participants counterpart
    on counterpart.conversation_id = participant.conversation_id
  where participant.user_id = viewer_id
    and counterpart.user_id = target_user_id
    and (
      select count(*)
      from public.conversation_participants member_count
      where member_count.conversation_id = participant.conversation_id
    ) = 2
  order by participant.conversation_id
  limit 1;

  if existing_conversation_id is not null then
    select conversation.status
    into existing_status
    from public.conversations conversation
    where conversation.id = existing_conversation_id;

    if existing_status = 'request' and resolved_status = 'active' then
      update public.conversations conversation
      set status = 'active',
          updated_at = timezone('utc', now())
      where conversation.id = existing_conversation_id;
    end if;

    return existing_conversation_id;
  end if;

  select profile.role
  into viewer_role
  from public.profiles profile
  where profile.id = viewer_id;

  select profile.role
  into target_role
  from public.profiles profile
  where profile.id = target_user_id;

  if viewer_role = 'supporter' and target_role = 'creator' then
    select coalesce(creator.dm_intake_policy, 'direct_message')
    into target_dm_intake_policy
    from public.creator_profiles creator
    where creator.user_id = target_user_id;

    if target_dm_intake_policy = 'form' then
      raise exception 'This creator requires an inquiry form before a new DM can start';
    end if;

    if target_dm_intake_policy = 'paid_fee' then
      raise exception 'This creator requires a paid unlock before a new DM can start';
    end if;
  end if;

  insert into public.conversations (created_by, subject, status)
  values (viewer_id, coalesce(conversation_subject, ''), resolved_status)
  returning id into new_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (new_conversation_id, viewer_id),
    (new_conversation_id, target_user_id);

  return new_conversation_id;
end;
$$;

create or replace function public.delete_direct_conversation(
  conversation_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  participant_count integer;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if conversation_uuid is null then
    raise exception 'Conversation id is required';
  end if;

  if not exists (
    select 1
    from public.conversation_participants participant
    where participant.conversation_id = conversation_uuid
      and participant.user_id = viewer_id
  ) then
    raise exception 'You do not have access to this conversation';
  end if;

  if not public.is_creator_participant(conversation_uuid, viewer_id) then
    raise exception 'Only creator recipients can delete direct conversations';
  end if;

  select count(*)
  into participant_count
  from public.conversation_participants participant
  where participant.conversation_id = conversation_uuid;

  if participant_count <> 2 then
    raise exception 'Only direct conversations can be deleted';
  end if;

  delete from public.conversations conversation
  where conversation.id = conversation_uuid;

  return conversation_uuid;
end;
$$;

revoke all on function public.get_public_profile(uuid) from public;
revoke all on function public.get_or_create_direct_conversation(uuid, text) from public;
revoke all on function public.delete_direct_conversation(uuid) from public;

grant execute on function public.get_public_profile(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid, text) to authenticated;
grant execute on function public.delete_direct_conversation(uuid) to authenticated;
