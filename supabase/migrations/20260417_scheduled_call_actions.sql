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
as $$
declare
  viewer_id uuid := auth.uid();
  trimmed_title text := btrim(coalesce(next_title, ''));
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if trimmed_title = '' then
    raise exception 'Call title cannot be empty';
  end if;

  if next_ends_at <= next_starts_at then
    raise exception 'Call end time must be after the start time';
  end if;

  update public.scheduled_calls call
  set title = trimmed_title,
      starts_at = next_starts_at,
      ends_at = next_ends_at,
      updated_at = timezone('utc', now())
  where call.id = call_uuid
    and (call.owner_id = viewer_id or call.attendee_profile_id = viewer_id)
    and call.status <> 'declined';

  if not found then
    raise exception 'Call not found or already removed';
  end if;

  return call_uuid;
end;
$$;

revoke all on function public.reschedule_scheduled_call(uuid, text, timestamptz, timestamptz) from public;
grant execute on function public.reschedule_scheduled_call(uuid, text, timestamptz, timestamptz) to authenticated;

create or replace function public.cancel_scheduled_call(
  call_uuid uuid
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

  update public.scheduled_calls call
  set status = 'declined',
      responded_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where call.id = call_uuid
    and (call.owner_id = viewer_id or call.attendee_profile_id = viewer_id)
    and call.status <> 'declined';

  if not found then
    raise exception 'Call not found or already removed';
  end if;

  return call_uuid;
end;
$$;

revoke all on function public.cancel_scheduled_call(uuid) from public;
grant execute on function public.cancel_scheduled_call(uuid) to authenticated;
