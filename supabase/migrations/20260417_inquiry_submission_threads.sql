do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'inquiry_form_submission_status'
  ) then
    create type public.inquiry_form_submission_status as enum ('pending', 'opened');
  end if;
end
$$;

alter table public.inquiry_form_submissions
add column if not exists supporter_display_name text,
add column if not exists supporter_avatar_url text,
add column if not exists status public.inquiry_form_submission_status not null default 'pending',
add column if not exists conversation_id uuid references public.conversations (id) on delete set null;

update public.inquiry_form_submissions submission
set supporter_display_name = profile.display_name,
    supporter_avatar_url = profile.avatar_url
from public.profiles profile
where profile.id = submission.supporter_id
  and (
    submission.supporter_display_name is null
    or submission.supporter_avatar_url is null
  );

create index if not exists inquiry_form_submissions_status_idx
on public.inquiry_form_submissions (creator_id, status, created_at desc);

create index if not exists inquiry_form_submissions_conversation_idx
on public.inquiry_form_submissions (conversation_id);

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
  supporter_display_name text;
  supporter_avatar_url text;
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

  select profile.display_name,
         profile.avatar_url
  into supporter_display_name,
       supporter_avatar_url
  from public.profiles profile
  where profile.id = viewer_id;

  insert into public.inquiry_form_submissions (
    form_id,
    creator_id,
    supporter_id,
    supporter_display_name,
    supporter_avatar_url,
    status
  )
  values (
    target_form_id,
    target_creator_id,
    viewer_id,
    coalesce(nullif(trim(supporter_display_name), ''), 'Syncrolly user'),
    supporter_avatar_url,
    'pending'
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

create or replace function public.open_inquiry_submission_conversation(
  submission_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  target_submission public.inquiry_form_submissions%rowtype;
  target_conversation_id uuid;
  target_form_title text;
  submission_payload jsonb;
begin
  if viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  select submission.*
  into target_submission
  from public.inquiry_form_submissions submission
  where submission.id = submission_uuid
    and submission.creator_id = viewer_id;

  if target_submission.id is null then
    raise exception 'Inquiry submission not found';
  end if;

  if target_submission.conversation_id is not null then
    return target_submission.conversation_id;
  end if;

  target_conversation_id := public.get_or_create_direct_conversation(
    target_submission.supporter_id,
    'Form response'
  );

  select form.title
  into target_form_title
  from public.inquiry_forms form
  where form.id = target_submission.form_id;

  select jsonb_build_object(
    'submissionId', target_submission.id,
    'formTitle', coalesce(nullif(trim(target_form_title), ''), 'Curated Inquiry'),
    'supporterName', coalesce(nullif(trim(target_submission.supporter_display_name), ''), 'Syncrolly user'),
    'submittedAt', target_submission.created_at,
    'answers', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'questionPrompt', question.prompt,
          'answerText', answer.answer_text
        )
        order by question.position
      ),
      '[]'::jsonb
    )
  )
  into submission_payload
  from public.inquiry_form_answers answer
  join public.inquiry_form_questions question
    on question.id = answer.question_id
  where answer.submission_id = target_submission.id;

  insert into public.messages (
    conversation_id,
    sender_id,
    body
  )
  values (
    target_conversation_id,
    target_submission.supporter_id,
    '__SYNCROLLY_INQUIRY_SUBMISSION__' || submission_payload::text
  );

  update public.inquiry_form_submissions submission
  set status = 'opened',
      conversation_id = target_conversation_id,
      updated_at = timezone('utc', now())
  where submission.id = target_submission.id;

  return target_conversation_id;
end;
$$;

revoke all on function public.submit_inquiry_form(uuid, jsonb) from public;
revoke all on function public.open_inquiry_submission_conversation(uuid) from public;

grant execute on function public.submit_inquiry_form(uuid, jsonb) to authenticated;
grant execute on function public.open_inquiry_submission_conversation(uuid) to authenticated;
