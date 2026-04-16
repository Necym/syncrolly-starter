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
  new_conversation_id uuid;
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
    return existing_conversation_id;
  end if;

  insert into public.conversations (created_by, subject, status)
  values (viewer_id, coalesce(conversation_subject, ''), 'active')
  returning id into new_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (new_conversation_id, viewer_id),
    (new_conversation_id, target_user_id);

  return new_conversation_id;
end;
$$;
