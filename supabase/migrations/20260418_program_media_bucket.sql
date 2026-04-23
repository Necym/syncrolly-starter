insert into storage.buckets (id, name, public)
values ('program-media', 'program-media', true)
on conflict (id) do update
set public = excluded.public;

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
  or exists (
    select 1
    from public.program_enrollments enrollment
    where enrollment.program_id = id
      and enrollment.student_id = (select auth.uid())
  )
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
  exists (
    select 1
    from public.programs program
    where program.id = program_id
      and (
        program.creator_id = (select auth.uid())
        or exists (
          select 1
          from public.program_enrollments enrollment
          where enrollment.program_id = program.id
            and enrollment.student_id = (select auth.uid())
        )
      )
  )
);

create policy "program_lessons_insert_owner"
on public.program_lessons
for insert
to authenticated
with check (
  exists (
    select 1
    from public.programs program
    where program.id = program_id
      and program.creator_id = (select auth.uid())
  )
);

create policy "program_lessons_update_owner"
on public.program_lessons
for update
to authenticated
using (
  exists (
    select 1
    from public.programs program
    where program.id = program_id
      and program.creator_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.programs program
    where program.id = program_id
      and program.creator_id = (select auth.uid())
  )
);

create policy "program_lessons_delete_owner"
on public.program_lessons
for delete
to authenticated
using (
  exists (
    select 1
    from public.programs program
    where program.id = program_id
      and program.creator_id = (select auth.uid())
  )
);

drop policy if exists "program_enrollments_select_accessible" on public.program_enrollments;
drop policy if exists "program_enrollments_insert_owner" on public.program_enrollments;
drop policy if exists "program_enrollments_delete_owner" on public.program_enrollments;

create policy "program_enrollments_select_accessible"
on public.program_enrollments
for select
to authenticated
using (
  student_id = (select auth.uid())
  or exists (
    select 1
    from public.programs program
    where program.id = program_id
      and program.creator_id = (select auth.uid())
  )
);

create policy "program_enrollments_insert_owner"
on public.program_enrollments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.programs program
    where program.id = program_id
      and program.creator_id = (select auth.uid())
  )
);

create policy "program_enrollments_delete_owner"
on public.program_enrollments
for delete
to authenticated
using (
  exists (
    select 1
    from public.programs program
    where program.id = program_id
      and program.creator_id = (select auth.uid())
  )
);

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
  or exists (
    select 1
    from public.program_lessons lesson
    join public.programs program on program.id = lesson.program_id
    where lesson.id = lesson_id
      and program.creator_id = (select auth.uid())
  )
);

create policy "lesson_progress_insert_student"
on public.lesson_progress
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and exists (
    select 1
    from public.program_lessons lesson
    join public.program_enrollments enrollment on enrollment.program_id = lesson.program_id
    where lesson.id = lesson_id
      and enrollment.student_id = (select auth.uid())
  )
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

drop policy if exists "program_media_insert_own" on storage.objects;
drop policy if exists "program_media_select_public" on storage.objects;
drop policy if exists "program_media_update_own" on storage.objects;
drop policy if exists "program_media_delete_own" on storage.objects;

create policy "program_media_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'program-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "program_media_select_public"
on storage.objects
for select
to authenticated
using (bucket_id = 'program-media');

create policy "program_media_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'program-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'program-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "program_media_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'program-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
