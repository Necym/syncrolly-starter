create table if not exists public.program_modules (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  summary text not null default '',
  position integer not null check (position > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint program_modules_program_position_key unique (program_id, position),
  constraint program_modules_id_program_key unique (id, program_id)
);

insert into public.program_modules (program_id, title, summary, position)
select program.id, 'Module 1', '', 1
from public.programs program
where not exists (
  select 1
  from public.program_modules module
  where module.program_id = program.id
);

alter table public.program_lessons
add column if not exists module_id uuid;

update public.program_lessons lesson
set module_id = module.id
from public.program_modules module
where lesson.module_id is null
  and module.program_id = lesson.program_id
  and module.position = 1;

alter table public.program_lessons
alter column module_id set not null;

alter table public.program_lessons
drop constraint if exists program_lessons_program_position_key;

alter table public.program_lessons
drop constraint if exists program_lessons_module_program_fk;

alter table public.program_lessons
add constraint program_lessons_module_program_fk
foreign key (module_id, program_id)
references public.program_modules (id, program_id)
on delete cascade;

alter table public.program_lessons
drop constraint if exists program_lessons_module_position_key;

alter table public.program_lessons
add constraint program_lessons_module_position_key
unique (module_id, position);

create index if not exists program_modules_program_idx
  on public.program_modules (program_id, position asc);

create index if not exists program_lessons_module_idx
  on public.program_lessons (module_id, position asc);

drop trigger if exists set_program_modules_updated_at on public.program_modules;
create trigger set_program_modules_updated_at
before update on public.program_modules
for each row
execute function public.set_updated_at();

alter table public.program_modules enable row level security;

drop policy if exists "program_modules_select_accessible" on public.program_modules;
drop policy if exists "program_modules_insert_owner" on public.program_modules;
drop policy if exists "program_modules_update_owner" on public.program_modules;
drop policy if exists "program_modules_delete_owner" on public.program_modules;

create policy "program_modules_select_accessible"
on public.program_modules
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

create policy "program_modules_insert_owner"
on public.program_modules
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

create policy "program_modules_update_owner"
on public.program_modules
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

create policy "program_modules_delete_owner"
on public.program_modules
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
