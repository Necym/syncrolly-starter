do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'form_question_type'
  ) then
    create type public.form_question_type as enum ('multiple_choice', 'short_text', 'long_text');
  end if;
end
$$;

create table if not exists public.inquiry_forms (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null unique references public.profiles (id) on delete cascade,
  title text not null default 'Curated Inquiry',
  intro text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inquiry_form_questions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.inquiry_forms (id) on delete cascade,
  position integer not null check (position >= 0),
  type public.form_question_type not null,
  prompt text not null,
  placeholder text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (form_id, position)
);

create table if not exists public.inquiry_form_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.inquiry_form_questions (id) on delete cascade,
  position integer not null check (position >= 0),
  label text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (question_id, position)
);

create table if not exists public.inquiry_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.inquiry_forms (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  supporter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inquiry_form_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.inquiry_form_submissions (id) on delete cascade,
  question_id uuid not null references public.inquiry_form_questions (id) on delete cascade,
  selected_option_id uuid references public.inquiry_form_question_options (id) on delete set null,
  answer_text text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  unique (submission_id, question_id)
);

create index if not exists inquiry_forms_creator_idx on public.inquiry_forms (creator_id);
create index if not exists inquiry_form_questions_form_idx on public.inquiry_form_questions (form_id, position);
create index if not exists inquiry_form_question_options_question_idx on public.inquiry_form_question_options (question_id, position);
create index if not exists inquiry_form_submissions_creator_idx on public.inquiry_form_submissions (creator_id, created_at desc);
create index if not exists inquiry_form_submissions_supporter_idx on public.inquiry_form_submissions (supporter_id, created_at desc);
create index if not exists inquiry_form_answers_submission_idx on public.inquiry_form_answers (submission_id);

create or replace function public.owns_inquiry_form(
  form_uuid uuid,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.inquiry_forms form
    where form.id = form_uuid
      and form.creator_id = user_uuid
  );
$$;

create or replace function public.owns_inquiry_question(
  question_uuid uuid,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.inquiry_form_questions question
    join public.inquiry_forms form
      on form.id = question.form_id
    where question.id = question_uuid
      and form.creator_id = user_uuid
  );
$$;

create or replace function public.save_inquiry_form(
  form_title text default 'Curated Inquiry',
  form_intro text default '',
  form_questions jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  target_form_id uuid;
  question_record jsonb;
  option_record jsonb;
  next_question_id uuid;
  next_question_type public.form_question_type;
  next_question_prompt text;
  next_question_placeholder text;
  question_position integer := 0;
  option_position integer;
  inserted_option_count integer;
  option_label text;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = viewer_id
      and profile.role = 'creator'
  ) then
    raise exception 'Only creators can manage inquiry forms';
  end if;

  if form_questions is null or jsonb_typeof(form_questions) <> 'array' then
    raise exception 'Form questions must be a JSON array';
  end if;

  insert into public.inquiry_forms (creator_id, title, intro)
  values (
    viewer_id,
    coalesce(nullif(trim(form_title), ''), 'Curated Inquiry'),
    coalesce(form_intro, '')
  )
  on conflict (creator_id) do update
  set title = excluded.title,
      intro = excluded.intro,
      updated_at = timezone('utc', now())
  returning id into target_form_id;

  delete from public.inquiry_form_questions
  where form_id = target_form_id;

  for question_record in
    select value
    from jsonb_array_elements(form_questions)
  loop
    next_question_type := case coalesce(question_record ->> 'type', '')
      when 'short_text' then 'short_text'::public.form_question_type
      when 'long_text' then 'long_text'::public.form_question_type
      else 'multiple_choice'::public.form_question_type
    end;

    next_question_prompt := coalesce(
      nullif(trim(question_record ->> 'prompt'), ''),
      format('Question %s', question_position + 1)
    );

    next_question_placeholder := coalesce(question_record ->> 'placeholder', '');

    insert into public.inquiry_form_questions (
      form_id,
      position,
      type,
      prompt,
      placeholder
    )
    values (
      target_form_id,
      question_position,
      next_question_type,
      next_question_prompt,
      next_question_placeholder
    )
    returning id into next_question_id;

    if next_question_type = 'multiple_choice' then
      option_position := 0;
      inserted_option_count := 0;

      if jsonb_typeof(question_record -> 'options') = 'array' then
        for option_record in
          select value
          from jsonb_array_elements(question_record -> 'options')
        loop
          option_label := trim(both '"' from option_record::text);

          if option_label <> '' and option_position < 4 then
            insert into public.inquiry_form_question_options (
              question_id,
              position,
              label
            )
            values (
              next_question_id,
              option_position,
              option_label
            );

            option_position := option_position + 1;
            inserted_option_count := inserted_option_count + 1;
          end if;
        end loop;
      end if;

      if inserted_option_count = 0 then
        insert into public.inquiry_form_question_options (question_id, position, label)
        values
          (next_question_id, 0, 'Option 1'),
          (next_question_id, 1, 'Option 2');
      elsif inserted_option_count = 1 then
        insert into public.inquiry_form_question_options (question_id, position, label)
        values (next_question_id, 1, 'Option 2');
      end if;
    end if;

    question_position := question_position + 1;
  end loop;

  if question_position = 0 then
    raise exception 'At least one question is required';
  end if;

  return target_form_id;
end;
$$;

create or replace function public.submit_inquiry_form(
  target_form_id uuid,
  submission_answers jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  target_creator_id uuid;
  target_submission_id uuid;
  answer_record jsonb;
  target_question_id uuid;
  target_question_type public.form_question_type;
  selected_option_id uuid;
  resolved_answer_text text;
  expected_question_count integer;
  inserted_answer_count integer;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  if submission_answers is null or jsonb_typeof(submission_answers) <> 'array' then
    raise exception 'Submission answers must be a JSON array';
  end if;

  select form.creator_id
  into target_creator_id
  from public.inquiry_forms form
  where form.id = target_form_id;

  if target_creator_id is null then
    raise exception 'Inquiry form not found';
  end if;

  if target_creator_id = viewer_id then
    raise exception 'Creators cannot submit their own inquiry form preview';
  end if;

  insert into public.inquiry_form_submissions (
    form_id,
    creator_id,
    supporter_id
  )
  values (
    target_form_id,
    target_creator_id,
    viewer_id
  )
  returning id into target_submission_id;

  for answer_record in
    select value
    from jsonb_array_elements(submission_answers)
  loop
    target_question_id := nullif(answer_record ->> 'questionId', '')::uuid;

    if target_question_id is null then
      raise exception 'Each answer must include a questionId';
    end if;

    select question.type
    into target_question_type
    from public.inquiry_form_questions question
    where question.id = target_question_id
      and question.form_id = target_form_id;

    if target_question_type is null then
      raise exception 'Invalid form question';
    end if;

    resolved_answer_text := trim(coalesce(answer_record ->> 'answerText', ''));
    selected_option_id := nullif(answer_record ->> 'selectedOptionId', '')::uuid;

    if target_question_type = 'multiple_choice' then
      if selected_option_id is null then
        raise exception 'A multiple-choice answer is missing its selected option';
      end if;

      select option.label
      into resolved_answer_text
      from public.inquiry_form_question_options option
      where option.id = selected_option_id
        and option.question_id = target_question_id;

      if resolved_answer_text is null then
        raise exception 'Invalid selected option for this question';
      end if;
    elsif resolved_answer_text = '' then
      raise exception 'All form questions require an answer';
    end if;

    insert into public.inquiry_form_answers (
      submission_id,
      question_id,
      selected_option_id,
      answer_text
    )
    values (
      target_submission_id,
      target_question_id,
      selected_option_id,
      resolved_answer_text
    );
  end loop;

  select count(*)
  into expected_question_count
  from public.inquiry_form_questions question
  where question.form_id = target_form_id;

  select count(*)
  into inserted_answer_count
  from public.inquiry_form_answers answer
  where answer.submission_id = target_submission_id;

  if inserted_answer_count <> expected_question_count then
    raise exception 'Please answer every question before submitting';
  end if;

  return target_submission_id;
end;
$$;

drop trigger if exists set_inquiry_forms_updated_at on public.inquiry_forms;
drop trigger if exists set_inquiry_form_questions_updated_at on public.inquiry_form_questions;
drop trigger if exists set_inquiry_form_submissions_updated_at on public.inquiry_form_submissions;

create trigger set_inquiry_forms_updated_at
before update on public.inquiry_forms
for each row
execute function public.set_updated_at();

create trigger set_inquiry_form_questions_updated_at
before update on public.inquiry_form_questions
for each row
execute function public.set_updated_at();

create trigger set_inquiry_form_submissions_updated_at
before update on public.inquiry_form_submissions
for each row
execute function public.set_updated_at();

alter table public.inquiry_forms enable row level security;
alter table public.inquiry_form_questions enable row level security;
alter table public.inquiry_form_question_options enable row level security;
alter table public.inquiry_form_submissions enable row level security;
alter table public.inquiry_form_answers enable row level security;

drop policy if exists "inquiry_forms_select_authenticated" on public.inquiry_forms;
drop policy if exists "inquiry_form_questions_select_authenticated" on public.inquiry_form_questions;
drop policy if exists "inquiry_form_question_options_select_authenticated" on public.inquiry_form_question_options;
drop policy if exists "inquiry_form_submissions_select_owner_or_supporter" on public.inquiry_form_submissions;
drop policy if exists "inquiry_form_answers_select_owner_or_supporter" on public.inquiry_form_answers;

create policy "inquiry_forms_select_authenticated"
on public.inquiry_forms
for select
to authenticated
using (true);

create policy "inquiry_form_questions_select_authenticated"
on public.inquiry_form_questions
for select
to authenticated
using (true);

create policy "inquiry_form_question_options_select_authenticated"
on public.inquiry_form_question_options
for select
to authenticated
using (true);

create policy "inquiry_form_submissions_select_owner_or_supporter"
on public.inquiry_form_submissions
for select
to authenticated
using (
  creator_id = (select auth.uid())
  or supporter_id = (select auth.uid())
);

create policy "inquiry_form_answers_select_owner_or_supporter"
on public.inquiry_form_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.inquiry_form_submissions submission
    where submission.id = inquiry_form_answers.submission_id
      and (
        submission.creator_id = (select auth.uid())
        or submission.supporter_id = (select auth.uid())
      )
  )
);

revoke all on function public.owns_inquiry_form(uuid, uuid) from public;
revoke all on function public.owns_inquiry_question(uuid, uuid) from public;
revoke all on function public.save_inquiry_form(text, text, jsonb) from public;
revoke all on function public.submit_inquiry_form(uuid, jsonb) from public;

grant execute on function public.owns_inquiry_form(uuid, uuid) to authenticated;
grant execute on function public.owns_inquiry_question(uuid, uuid) to authenticated;
grant execute on function public.save_inquiry_form(text, text, jsonb) to authenticated;
grant execute on function public.submit_inquiry_form(uuid, jsonb) to authenticated;
