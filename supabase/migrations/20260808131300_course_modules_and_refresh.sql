-- Learning modules (replaces short/detailed summaries) + course refresh on new sources

create table public.course_modules (
  id          uuid primary key default extensions.uuid_generate_v4(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  position    int not null check (position between 1 and 5),
  title       text not null,
  paragraphs  jsonb not null,
  created_at  timestamptz not null default now(),
  unique (course_id, position)
);

create index idx_course_modules_course_id on public.course_modules(course_id);

alter table public.course_modules enable row level security;

create policy "course modules via course ownership"
  on public.course_modules for all
  using (course_id in (select id from public.courses where user_id = auth.uid()));

create or replace function public.refresh_course_content(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_course public.courses%rowtype;
  v_pending_id uuid;
  v_pending_count int;
  v_enqueued int := 0;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select *
  into v_course
  from public.courses
  where id = p_course_id
  for update;

  if not found or v_course.user_id <> auth.uid() then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  if v_course.status not in ('ready', 'partially_ready') then
    raise exception 'INVALID_STATE';
  end if;

  select count(*)
  into v_pending_count
  from public.sources
  where course_id = p_course_id
    and status = 'pending';

  if v_pending_count = 0 then
    raise exception 'INVALID_STATE';
  end if;

  delete from public.flashcards where course_id = p_course_id;
  delete from public.course_modules where course_id = p_course_id;
  delete from public.summaries where course_id = p_course_id;
  delete from public.concepts where course_id = p_course_id;

  update public.artifact_generation_status
  set status = 'pending',
      attempt_count = 0,
      last_error = null,
      updated_at = now()
  where course_id = p_course_id;

  update public.courses
  set status = 'ingesting',
      last_error = null,
      updated_at = now()
  where id = p_course_id;

  for v_pending_id in
    select id
    from public.sources
    where course_id = p_course_id
      and status = 'pending'
    order by created_at
  loop
    perform public.enqueue_ingest_source_message(v_pending_id);
    v_enqueued := v_enqueued + 1;
  end loop;

  return jsonb_build_object(
    'id', p_course_id,
    'status', 'ingesting',
    'enqueued', v_enqueued
  );
end;
$$;

grant execute on function public.refresh_course_content(uuid) to authenticated;

drop function if exists public.complete_artifact_summary(uuid, text, text, bigint, text, jsonb);

create or replace function public.complete_artifact_summary(
  p_course_id uuid,
  p_modules jsonb,
  p_msg_id bigint,
  p_model_used text,
  p_job_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_course public.courses%rowtype;
  v_artifact public.artifact_generation_status%rowtype;
  v_module jsonb;
  v_paragraph jsonb;
  v_existing int;
  v_attempt int;
  let v_position int;
begin
  select *
  into v_course
  from public.courses
  where id = p_course_id
  for update;

  if not found then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  select *
  into v_artifact
  from public.artifact_generation_status
  where course_id = p_course_id
    and artifact_type = 'summary'
  for update;

  if not found then
    raise exception 'INVALID_STATE';
  end if;

  select count(*)
  into v_existing
  from public.course_modules
  where course_id = p_course_id;

  if v_artifact.status = 'done' or v_existing > 0 then
    perform pgmq.archive('generate_artifacts', p_msg_id);

    select coalesce(max(attempt), 0)
    into v_attempt
    from public.job_log
    where queue_name = 'generate_artifacts'
      and payload->>'course_id' = p_course_id::text
      and payload->>'artifact_type' = 'summary';

    insert into public.job_log (
      queue_name, msg_id, payload, status, attempt, model_used
    ) values (
      'generate_artifacts', p_msg_id, p_job_payload, 'succeeded',
      v_attempt, p_model_used
    );

    perform public.maybe_aggregate_course_artifact_status(p_course_id);

    return jsonb_build_object('outcome', 'already_complete');
  end if;

  if v_artifact.status <> 'processing' then
    raise exception 'INVALID_STATE';
  end if;

  if jsonb_typeof(p_modules) <> 'array'
     or jsonb_array_length(p_modules) = 0
     or jsonb_array_length(p_modules) > 5 then
    raise exception 'INVALID_MODULES';
  end if;

  v_position := 0;

  for v_module in
    select value
    from jsonb_array_elements(p_modules)
  loop
    v_position := v_position + 1;

    if coalesce(v_module->>'title', '') = ''
       or jsonb_typeof(v_module->'paragraphs') <> 'array'
       or jsonb_array_length(v_module->'paragraphs') = 0
       or jsonb_array_length(v_module->'paragraphs') > 3 then
      raise exception 'INVALID_MODULES';
    end if;

    for v_paragraph in
      select value
      from jsonb_array_elements(v_module->'paragraphs')
    loop
      if coalesce(v_paragraph #>> '{}', '') = '' then
        raise exception 'INVALID_MODULES';
      end if;
    end loop;

    insert into public.course_modules (
      course_id,
      position,
      title,
      paragraphs
    ) values (
      p_course_id,
      v_position,
      v_module->>'title',
      v_module->'paragraphs'
    );
  end loop;

  update public.artifact_generation_status
  set status = 'done',
      last_error = null,
      updated_at = now()
  where course_id = p_course_id
    and artifact_type = 'summary';

  perform pgmq.archive('generate_artifacts', p_msg_id);

  select coalesce(max(attempt), 0)
  into v_attempt
  from public.job_log
  where queue_name = 'generate_artifacts'
    and payload->>'course_id' = p_course_id::text
    and payload->>'artifact_type' = 'summary';

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, model_used
  ) values (
    'generate_artifacts', p_msg_id, p_job_payload, 'succeeded',
    v_attempt, p_model_used
  );

  perform public.maybe_aggregate_course_artifact_status(p_course_id);

  return jsonb_build_object('outcome', 'succeeded');
end;
$$;

revoke all on function public.complete_artifact_summary(uuid, jsonb, bigint, text, jsonb) from public;
grant execute on function public.complete_artifact_summary(uuid, jsonb, bigint, text, jsonb) to service_role;

create or replace function public.retry_artifact_generation(
  p_course_id uuid,
  p_artifact_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_course public.courses%rowtype;
  v_artifact public.artifact_generation_status%rowtype;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select c.*
  into v_course
  from public.courses c
  where c.id = p_course_id
  for update;

  if not found or v_course.user_id <> auth.uid() then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  select *
  into v_artifact
  from public.artifact_generation_status
  where course_id = p_course_id
    and artifact_type = p_artifact_type
  for update;

  if not found then
    raise exception 'INVALID_STATE';
  end if;

  if v_artifact.status <> 'failed_permanent' then
    raise exception 'INVALID_STATE';
  end if;

  if exists (
    select 1
    from pgmq.q_generate_artifacts q
    where q.message->>'course_id' = p_course_id::text
      and q.message->>'artifact_type' = p_artifact_type
  ) then
    return jsonb_build_object(
      'id', p_course_id,
      'artifact_type', p_artifact_type,
      'status', v_artifact.status,
      'enqueued', false
    );
  end if;

  if p_artifact_type = 'flashcards' then
    delete from public.flashcards where course_id = p_course_id;
  elsif p_artifact_type = 'summary' then
    delete from public.course_modules where course_id = p_course_id;
    delete from public.summaries where course_id = p_course_id;
  end if;

  update public.artifact_generation_status
  set status = 'pending',
      attempt_count = 0,
      last_error = null,
      updated_at = now()
  where course_id = p_course_id
    and artifact_type = p_artifact_type;

  if v_course.status in ('ready', 'partially_ready') then
    update public.courses
    set status = 'generating_artifacts',
        updated_at = now()
    where id = p_course_id;
  end if;

  perform pgmq.send(
    'generate_artifacts',
    jsonb_build_object(
      'course_id', p_course_id,
      'artifact_type', p_artifact_type
    )
  );

  return jsonb_build_object(
    'id', p_course_id,
    'artifact_type', p_artifact_type,
    'status', 'pending',
    'enqueued', true
  );
end;
$$;

grant execute on function public.retry_artifact_generation(uuid, text) to authenticated;
