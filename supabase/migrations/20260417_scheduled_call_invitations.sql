do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'scheduled_call_status'
  ) then
    create type public.scheduled_call_status as enum ('pending', 'accepted', 'declined');
  end if;
end
$$;

alter table public.scheduled_calls
add column if not exists conversation_id uuid references public.conversations (id) on delete set null,
add column if not exists status public.scheduled_call_status not null default 'pending',
add column if not exists responded_at timestamptz;

create index if not exists scheduled_calls_conversation_idx
  on public.scheduled_calls (conversation_id);

create or replace function public.respond_to_scheduled_call_invitation(
  call_uuid uuid,
  next_status public.scheduled_call_status
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

  if next_status not in ('accepted', 'declined') then
    raise exception 'Invalid call response status';
  end if;

  update public.scheduled_calls call
  set status = next_status,
      responded_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where call.id = call_uuid
    and call.attendee_profile_id = viewer_id
    and call.status = 'pending';

  if not found then
    raise exception 'Invitation not found or already responded to';
  end if;

  return call_uuid;
end;
$$;

revoke all on function public.respond_to_scheduled_call_invitation(uuid, public.scheduled_call_status) from public;
grant execute on function public.respond_to_scheduled_call_invitation(uuid, public.scheduled_call_status) to authenticated;
