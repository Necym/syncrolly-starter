alter type public.inquiry_form_submission_status add value if not exists 'qualified';
alter type public.inquiry_form_submission_status add value if not exists 'booked';
alter type public.inquiry_form_submission_status add value if not exists 'enrolled';

create or replace function public.update_inquiry_submission_status(
  submission_uuid uuid,
  next_status public.inquiry_form_submission_status
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  updated_submission_id uuid;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.inquiry_form_submissions submission
  set status = next_status,
      updated_at = timezone('utc', now())
  where submission.id = submission_uuid
    and submission.creator_id = viewer_id
  returning submission.id into updated_submission_id;

  if updated_submission_id is null then
    raise exception 'Inquiry submission not found';
  end if;

  return updated_submission_id;
end;
$$;

create or replace function public.delete_inquiry_submission(
  submission_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  deleted_submission_id uuid;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.inquiry_form_submissions submission
  where submission.id = submission_uuid
    and submission.creator_id = viewer_id
  returning submission.id into deleted_submission_id;

  if deleted_submission_id is null then
    raise exception 'Inquiry submission not found';
  end if;

  return deleted_submission_id;
end;
$$;

revoke all on function public.update_inquiry_submission_status(uuid, public.inquiry_form_submission_status) from public;
revoke all on function public.delete_inquiry_submission(uuid) from public;

grant execute on function public.update_inquiry_submission_status(uuid, public.inquiry_form_submission_status) to authenticated;
grant execute on function public.delete_inquiry_submission(uuid) to authenticated;
