alter table public.lesson_progress
  alter column completed_at drop not null,
  alter column completed_at drop default;

alter table public.lesson_progress
  add column if not exists progress_percent integer not null default 0,
  add column if not exists last_position_seconds double precision not null default 0;

alter table public.lesson_progress
  drop constraint if exists lesson_progress_progress_percent_check;

alter table public.lesson_progress
  add constraint lesson_progress_progress_percent_check
    check (progress_percent >= 0 and progress_percent <= 100);

create or replace function public.save_lesson_progress(
  target_lesson_id uuid,
  target_progress_percent integer default 0,
  target_last_position_seconds double precision default 0,
  mark_complete boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  clamped_progress integer := greatest(0, least(coalesce(target_progress_percent, 0), 100));
  clamped_position double precision := greatest(coalesce(target_last_position_seconds, 0), 0);
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
    progress_percent,
    last_position_seconds,
    completed_at
  )
  values (
    target_lesson_id,
    viewer_id,
    case when mark_complete then 100 else clamped_progress end,
    clamped_position,
    case when mark_complete then timezone('utc', now()) else null end
  )
  on conflict (lesson_id, student_id)
  do update
    set progress_percent = greatest(
          public.lesson_progress.progress_percent,
          case when mark_complete then 100 else clamped_progress end
        ),
        last_position_seconds = greatest(public.lesson_progress.last_position_seconds, clamped_position),
        completed_at = case
          when mark_complete then coalesce(public.lesson_progress.completed_at, timezone('utc', now()))
          else public.lesson_progress.completed_at
        end,
        updated_at = timezone('utc', now())
  returning id into saved_progress_id;

  return saved_progress_id;
end;
$$;

revoke all on function public.save_lesson_progress(uuid, integer, double precision, boolean) from public;
grant execute on function public.save_lesson_progress(uuid, integer, double precision, boolean) to authenticated;

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
  saved_progress_id uuid;
begin
  select public.save_lesson_progress(
    target_lesson_id,
    100,
    0,
    true
  ) into saved_progress_id;

  return saved_progress_id;
end;
$$;

revoke all on function public.record_lesson_progress(uuid, timestamptz) from public;
grant execute on function public.record_lesson_progress(uuid, timestamptz) to authenticated;
