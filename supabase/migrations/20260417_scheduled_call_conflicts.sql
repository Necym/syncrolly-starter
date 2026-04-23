create or replace function public.create_scheduled_call(
  next_attendee_profile_id uuid,
  next_conversation_id uuid,
  next_title text,
  next_starts_at timestamptz,
  next_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as '
declare
  viewer_id uuid := auth.uid();
  trimmed_title text := btrim(coalesce(next_title, ''''));
  inserted_call_id uuid;
begin
  if viewer_id is null then
    raise exception ''Not authenticated'';
  end if;

  if trimmed_title = '''' then
    raise exception ''Call title cannot be empty'';
  end if;

  if next_ends_at <= next_starts_at then
    raise exception ''Call end time must be after the start time'';
  end if;

  if exists (
    select 1
    from public.scheduled_calls call
    where call.status <> ''declined''
      and tstzrange(call.starts_at, call.ends_at, ''[)'') && tstzrange(next_starts_at, next_ends_at, ''[)'')
      and (call.owner_id = viewer_id or call.attendee_profile_id = viewer_id)
  ) then
    raise exception ''Time conflict: you already have another call in that slot'';
  end if;

  if next_attendee_profile_id is not null and exists (
    select 1
    from public.scheduled_calls call
    where call.status <> ''declined''
      and tstzrange(call.starts_at, call.ends_at, ''[)'') && tstzrange(next_starts_at, next_ends_at, ''[)'')
      and (call.owner_id = next_attendee_profile_id or call.attendee_profile_id = next_attendee_profile_id)
  ) then
    raise exception ''Time conflict: the other attendee already has another call in that slot'';
  end if;

  insert into public.scheduled_calls (
    owner_id,
    attendee_profile_id,
    conversation_id,
    title,
    starts_at,
    ends_at,
    status
  )
  values (
    viewer_id,
    next_attendee_profile_id,
    next_conversation_id,
    trimmed_title,
    next_starts_at,
    next_ends_at,
    case when next_attendee_profile_id is null then ''accepted''::public.scheduled_call_status else ''pending''::public.scheduled_call_status end
  )
  returning id into inserted_call_id;

  return inserted_call_id;
end;
';

revoke all on function public.create_scheduled_call(uuid, uuid, text, timestamptz, timestamptz) from public;
grant execute on function public.create_scheduled_call(uuid, uuid, text, timestamptz, timestamptz) to authenticated;

create or replace function public.reschedule_scheduled_call(
  call_uuid uuid,
  next_title text,
  next_starts_at timestamptz,
  next_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as '
declare
  viewer_id uuid := auth.uid();
  trimmed_title text := btrim(coalesce(next_title, ''''));
  current_owner_id uuid;
  current_attendee_profile_id uuid;
  counterpart_id uuid;
begin
  if viewer_id is null then
    raise exception ''Not authenticated'';
  end if;

  if trimmed_title = '''' then
    raise exception ''Call title cannot be empty'';
  end if;

  if next_ends_at <= next_starts_at then
    raise exception ''Call end time must be after the start time'';
  end if;

  select call.owner_id, call.attendee_profile_id
  into current_owner_id, current_attendee_profile_id
  from public.scheduled_calls call
  where call.id = call_uuid
    and (call.owner_id = viewer_id or call.attendee_profile_id = viewer_id)
    and call.status <> ''declined''
  for update;

  if not found then
    raise exception ''Call not found or already removed'';
  end if;

  counterpart_id :=
    case
      when current_owner_id = viewer_id then current_attendee_profile_id
      else current_owner_id
    end;

  if exists (
    select 1
    from public.scheduled_calls call
    where call.id <> call_uuid
      and call.status <> ''declined''
      and tstzrange(call.starts_at, call.ends_at, ''[)'') && tstzrange(next_starts_at, next_ends_at, ''[)'')
      and (call.owner_id = viewer_id or call.attendee_profile_id = viewer_id)
  ) then
    raise exception ''Time conflict: you already have another call in that slot'';
  end if;

  if counterpart_id is not null and exists (
    select 1
    from public.scheduled_calls call
    where call.id <> call_uuid
      and call.status <> ''declined''
      and tstzrange(call.starts_at, call.ends_at, ''[)'') && tstzrange(next_starts_at, next_ends_at, ''[)'')
      and (call.owner_id = counterpart_id or call.attendee_profile_id = counterpart_id)
  ) then
    raise exception ''Time conflict: the other attendee already has another call in that slot'';
  end if;

  update public.scheduled_calls call
  set title = trimmed_title,
      starts_at = next_starts_at,
      ends_at = next_ends_at,
      updated_at = timezone(''utc'', now())
  where call.id = call_uuid;

  return call_uuid;
end;
';

revoke all on function public.reschedule_scheduled_call(uuid, text, timestamptz, timestamptz) from public;
grant execute on function public.reschedule_scheduled_call(uuid, text, timestamptz, timestamptz) to authenticated;
