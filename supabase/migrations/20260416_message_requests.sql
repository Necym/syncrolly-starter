create or replace function public.sync_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = timezone('utc', now())
  where id = new.conversation_id;

  return new;
end;
$$;

create or replace function public.resolve_direct_thread_status(
  viewer_uuid uuid,
  target_uuid uuid
)
returns public.thread_status
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  viewer_role public.user_role;
  target_role public.user_role;
  target_dm_access public.dm_access := 'subscriber_only';
  viewer_access_level public.access_level := 'free';
begin
  select profile.role
  into viewer_role
  from public.profiles profile
  where profile.id = viewer_uuid;

  select profile.role
  into target_role
  from public.profiles profile
  where profile.id = target_uuid;

  if viewer_role is null or target_role is null then
    return 'active';
  end if;

  if viewer_role = 'supporter' and target_role = 'creator' then
    select coalesce(
      (
        select creator.dm_access
        from public.creator_profiles creator
        where creator.user_id = target_uuid
      ),
      'subscriber_only'
    )
    into target_dm_access;

    select coalesce(
      (
        select supporter.access_level
        from public.supporter_profiles supporter
        where supporter.user_id = viewer_uuid
      ),
      'free'
    )
    into viewer_access_level;

    if target_dm_access = 'free' then
      return 'active';
    end if;

    if target_dm_access = 'subscriber_only' and viewer_access_level <> 'free' then
      return 'active';
    end if;

    if target_dm_access = 'paid_only' and viewer_access_level in ('paid', 'vip') then
      return 'active';
    end if;

    return 'request';
  end if;

  return 'active';
end;
$$;

create or replace function public.is_creator_participant(
  conversation_uuid uuid,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.conversation_participants participant
    join public.profiles profile
      on profile.id = participant.user_id
    where participant.conversation_id = conversation_uuid
      and participant.user_id = user_uuid
      and profile.role = 'creator'
  );
$$;

create or replace function public.can_send_conversation_message(
  conversation_uuid uuid,
  sender_uuid uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  conversation_status public.thread_status;
  sender_role public.user_role;
  has_existing_message boolean := false;
begin
  select conversation.status
  into conversation_status
  from public.conversations conversation
  where conversation.id = conversation_uuid;

  if conversation_status is null then
    return false;
  end if;

  if conversation_status = 'active' then
    return true;
  end if;

  if conversation_status = 'flagged' then
    return false;
  end if;

  select profile.role
  into sender_role
  from public.profiles profile
  where profile.id = sender_uuid;

  if sender_role = 'creator' then
    return true;
  end if;

  select exists (
    select 1
    from public.messages message
    where message.conversation_id = conversation_uuid
      and message.sender_id = sender_uuid
  )
  into has_existing_message;

  return not has_existing_message;
end;
$$;

create or replace function public.approve_conversation_request(
  conversation_uuid uuid
)
returns uuid
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

  if not public.is_creator_participant(conversation_uuid, viewer_id) then
    raise exception 'Only creator participants can approve requests';
  end if;

  update public.conversations conversation
  set status = 'active',
      updated_at = timezone('utc', now())
  where conversation.id = conversation_uuid
    and conversation.status = 'request';

  return conversation_uuid;
end;
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

drop policy if exists "conversations_update_participants" on public.conversations;

drop policy if exists "messages_insert_sender_participant" on public.messages;

create policy "messages_insert_sender_participant"
on public.messages
for insert
to authenticated
with check (
  (select auth.uid()) = sender_id
  and (select public.is_conversation_participant(conversation_id))
  and (select public.can_send_conversation_message(conversation_id, sender_id))
);

revoke all on function public.resolve_direct_thread_status(uuid, uuid) from public;
revoke all on function public.is_creator_participant(uuid, uuid) from public;
revoke all on function public.can_send_conversation_message(uuid, uuid) from public;
revoke all on function public.approve_conversation_request(uuid) from public;
revoke all on function public.get_or_create_direct_conversation(uuid, text) from public;

grant execute on function public.resolve_direct_thread_status(uuid, uuid) to authenticated;
grant execute on function public.is_creator_participant(uuid, uuid) to authenticated;
grant execute on function public.can_send_conversation_message(uuid, uuid) to authenticated;
grant execute on function public.approve_conversation_request(uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end
$$;
