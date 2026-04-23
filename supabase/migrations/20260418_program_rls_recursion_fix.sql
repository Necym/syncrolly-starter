create or replace function public.viewer_owns_program(program_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.programs program
    where program.id = program_uuid
      and program.creator_id = auth.uid()
  );
$$;

create or replace function public.viewer_enrolled_in_program(program_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_enrollments enrollment
    where enrollment.program_id = program_uuid
      and enrollment.student_id = auth.uid()
  );
$$;

create or replace function public.viewer_owns_lesson_program(lesson_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_lessons lesson
    join public.programs program on program.id = lesson.program_id
    where lesson.id = lesson_uuid
      and program.creator_id = auth.uid()
  );
$$;

create or replace function public.viewer_enrolled_for_lesson(lesson_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.program_lessons lesson
    join public.program_enrollments enrollment on enrollment.program_id = lesson.program_id
    where lesson.id = lesson_uuid
      and enrollment.student_id = auth.uid()
  );
$$;

revoke all on function public.viewer_owns_program(uuid) from public;
revoke all on function public.viewer_enrolled_in_program(uuid) from public;
revoke all on function public.viewer_owns_lesson_program(uuid) from public;
revoke all on function public.viewer_enrolled_for_lesson(uuid) from public;

grant execute on function public.viewer_owns_program(uuid) to authenticated;
grant execute on function public.viewer_enrolled_in_program(uuid) to authenticated;
grant execute on function public.viewer_owns_lesson_program(uuid) to authenticated;
grant execute on function public.viewer_enrolled_for_lesson(uuid) to authenticated;

alter table public.programs enable row level security;
alter table public.program_lessons enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.lesson_progress enable row level security;

drop policy if exists "programs_select_accessible" on public.programs;
drop policy if exists "programs_insert_owner" on public.programs;
drop policy if exists "programs_update_owner" on public.programs;
drop policy if exists "programs_delete_owner" on public.programs;

create policy "programs_select_accessible"
on public.programs
for select
to authenticated
using (
  creator_id = (select auth.uid())
  or public.viewer_enrolled_in_program(id)
);

create policy "programs_insert_owner"
on public.programs
for insert
to authenticated
with check (creator_id = (select auth.uid()));

create policy "programs_update_owner"
on public.programs
for update
to authenticated
using (creator_id = (select auth.uid()))
with check (creator_id = (select auth.uid()));

create policy "programs_delete_owner"
on public.programs
for delete
to authenticated
using (creator_id = (select auth.uid()));

drop policy if exists "program_lessons_select_accessible" on public.program_lessons;
drop policy if exists "program_lessons_insert_owner" on public.program_lessons;
drop policy if exists "program_lessons_update_owner" on public.program_lessons;
drop policy if exists "program_lessons_delete_owner" on public.program_lessons;

create policy "program_lessons_select_accessible"
on public.program_lessons
for select
to authenticated
using (
  public.viewer_owns_program(program_id)
  or public.viewer_enrolled_in_program(program_id)
);

create policy "program_lessons_insert_owner"
on public.program_lessons
for insert
to authenticated
with check (public.viewer_owns_program(program_id));

create policy "program_lessons_update_owner"
on public.program_lessons
for update
to authenticated
using (public.viewer_owns_program(program_id))
with check (public.viewer_owns_program(program_id));

create policy "program_lessons_delete_owner"
on public.program_lessons
for delete
to authenticated
using (public.viewer_owns_program(program_id));

drop policy if exists "program_enrollments_select_accessible" on public.program_enrollments;
drop policy if exists "program_enrollments_insert_owner" on public.program_enrollments;
drop policy if exists "program_enrollments_delete_owner" on public.program_enrollments;

create policy "program_enrollments_select_accessible"
on public.program_enrollments
for select
to authenticated
using (
  student_id = (select auth.uid())
  or public.viewer_owns_program(program_id)
);

create policy "program_enrollments_insert_owner"
on public.program_enrollments
for insert
to authenticated
with check (public.viewer_owns_program(program_id));

create policy "program_enrollments_delete_owner"
on public.program_enrollments
for delete
to authenticated
using (public.viewer_owns_program(program_id));

drop policy if exists "lesson_progress_select_accessible" on public.lesson_progress;
drop policy if exists "lesson_progress_insert_student" on public.lesson_progress;
drop policy if exists "lesson_progress_update_student" on public.lesson_progress;
drop policy if exists "lesson_progress_delete_student" on public.lesson_progress;

create policy "lesson_progress_select_accessible"
on public.lesson_progress
for select
to authenticated
using (
  student_id = (select auth.uid())
  or public.viewer_owns_lesson_program(lesson_id)
);

create policy "lesson_progress_insert_student"
on public.lesson_progress
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and public.viewer_enrolled_for_lesson(lesson_id)
);

create policy "lesson_progress_update_student"
on public.lesson_progress
for update
to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

create policy "lesson_progress_delete_student"
on public.lesson_progress
for delete
to authenticated
using (student_id = (select auth.uid()));
