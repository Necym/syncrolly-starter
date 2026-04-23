create or replace function public.record_lesson_progress(
  target_lesson_id uuid,
  target_completed_at timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  saved_progress_id uuid;
begin
  if viewer_id is null then
    raise exception 'Authentication required to save lesson progress.';
  end if;

  if not exists (
    select 1
    from public.program_lessons lesson
    join public.program_enrollments enrollment
      on enrollment.program_id = lesson.program_id
    where lesson.id = target_lesson_id
      and enrollment.student_id = viewer_id
  ) then
    raise exception 'This account needs to be enrolled in the program before lesson progress can be saved.';
  end if;

  insert into public.lesson_progress (
    lesson_id,
    student_id,
    completed_at
  )
  values (
    target_lesson_id,
    viewer_id,
    coalesce(target_completed_at, timezone('utc', now()))
  )
  on conflict (lesson_id, student_id)
  do update
    set completed_at = excluded.completed_at,
        updated_at = timezone('utc', now())
  returning id into saved_progress_id;

  return saved_progress_id;
end;
$$;

revoke all on function public.record_lesson_progress(uuid, timestamptz) from public;
grant execute on function public.record_lesson_progress(uuid, timestamptz) to authenticated;
