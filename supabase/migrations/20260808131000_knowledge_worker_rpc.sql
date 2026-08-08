-- Knowledge extraction worker queue operations (see docs/02-JOB-QUEUE.md)

create or replace function public.get_knowledge_extraction_visibility_timeout_seconds()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    ceil(timeout_ms / 1000.0)::int + 60,
    90
  )
  from public.model_roles
  where role = 'knowledge_extraction';
$$;

revoke all on function public.get_knowledge_extraction_visibility_timeout_seconds() from public;
grant execute on function public.get_knowledge_extraction_visibility_timeout_seconds() to service_role;

create or replace function public.read_extract_knowledge_queue_messages(
  p_vt_seconds int,
  p_batch_size int
)
returns table(msg_id bigint, read_ct int, message jsonb)
language sql
security definer
set search_path = public, pgmq
as $$
  select r.msg_id, r.read_ct, r.message
  from pgmq.read('extract_knowledge', p_vt_seconds, p_batch_size) as r;
$$;

revoke all on function public.read_extract_knowledge_queue_messages(int, int) from public;
grant execute on function public.read_extract_knowledge_queue_messages(int, int) to service_role;

create or replace function public.claim_course_for_knowledge_extraction(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses%rowtype;
begin
  update public.courses
  set status = 'extracting_knowledge',
      last_error = null,
      updated_at = now()
  where id = p_course_id
    and status = 'ingesting'
  returning * into v_course;

  if found then
    return jsonb_build_object(
      'claimed', true,
      'course', to_jsonb(v_course)
    );
  end if;

  select *
  into v_course
  from public.courses
  where id = p_course_id;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'claimed', false,
    'reason', v_course.status,
    'course', to_jsonb(v_course)
  );
end;
$$;

revoke all on function public.claim_course_for_knowledge_extraction(uuid) from public;
grant execute on function public.claim_course_for_knowledge_extraction(uuid) to service_role;

create or replace function public.complete_knowledge_extraction(
  p_course_id uuid,
  p_concepts jsonb,
  p_relationships jsonb,
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
  v_concept jsonb;
  v_rel jsonb;
  v_model_id text;
  v_uuid uuid;
  v_id_map jsonb := '{}'::jsonb;
  v_existing_concepts int;
  v_attempt int;
begin
  select *
  into v_course
  from public.courses
  where id = p_course_id
  for update;

  if not found then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  select count(*)
  into v_existing_concepts
  from public.concepts
  where course_id = p_course_id;

  if v_course.status in ('generating_artifacts', 'ready', 'partially_ready')
     or v_existing_concepts > 0 then
    perform pgmq.archive('extract_knowledge', p_msg_id);

    select coalesce(max(attempt), 0)
    into v_attempt
    from public.job_log
    where queue_name = 'extract_knowledge'
      and payload->>'course_id' = p_course_id::text;

    insert into public.job_log (
      queue_name, msg_id, payload, status, attempt, model_used
    ) values (
      'extract_knowledge', p_msg_id, p_job_payload, 'succeeded',
      v_attempt, p_model_used
    );

    return jsonb_build_object('outcome', 'already_complete');
  end if;

  if v_course.status <> 'extracting_knowledge' then
    raise exception 'INVALID_STATE';
  end if;

  if jsonb_typeof(p_concepts) <> 'array' or jsonb_array_length(p_concepts) = 0 then
    raise exception 'INVALID_CONCEPTS';
  end if;

  for v_concept in
    select value
    from jsonb_array_elements(p_concepts)
  loop
    v_model_id := v_concept->>'id';

    if v_model_id is null or v_model_id = '' then
      raise exception 'INVALID_CONCEPTS';
    end if;

    if coalesce(v_concept->>'name', '') = ''
       or coalesce(v_concept->>'description', '') = ''
       or v_concept->>'difficulty' is null then
      raise exception 'INVALID_CONCEPTS';
    end if;

    v_uuid := extensions.uuid_generate_v4();
    v_id_map := v_id_map || jsonb_build_object(v_model_id, v_uuid::text);

    insert into public.concepts (
      id,
      course_id,
      name,
      description,
      difficulty
    ) values (
      v_uuid,
      p_course_id,
      v_concept->>'name',
      v_concept->>'description',
      v_concept->>'difficulty'
    );
  end loop;

  if jsonb_typeof(p_relationships) = 'array' then
    for v_rel in
      select value
      from jsonb_array_elements(p_relationships)
    loop
      v_model_id := v_rel->>'from';

      if v_id_map->>v_model_id is null then
        raise exception 'INVALID_RELATIONSHIPS';
      end if;

      if v_id_map->>(v_rel->>'to') is null then
        raise exception 'INVALID_RELATIONSHIPS';
      end if;

      insert into public.concept_relationships (
        course_id,
        source_concept_id,
        target_concept_id,
        type
      ) values (
        p_course_id,
        (v_id_map->>v_model_id)::uuid,
        (v_id_map->>(v_rel->>'to'))::uuid,
        v_rel->>'type'
      );
    end loop;
  end if;

  update public.courses
  set status = 'generating_artifacts',
      last_error = null,
      updated_at = now()
  where id = p_course_id;

  insert into public.artifact_generation_status (
    course_id,
    artifact_type,
    status,
    attempt_count,
    last_error,
    updated_at
  ) values
    (p_course_id, 'flashcards', 'pending', 0, null, now()),
    (p_course_id, 'summary', 'pending', 0, null, now())
  on conflict (course_id, artifact_type) do update
    set status = 'pending',
        attempt_count = 0,
        last_error = null,
        updated_at = now();

  perform pgmq.send(
    'generate_artifacts',
    jsonb_build_object('course_id', p_course_id, 'artifact_type', 'flashcards')
  );

  perform pgmq.send(
    'generate_artifacts',
    jsonb_build_object('course_id', p_course_id, 'artifact_type', 'summary')
  );

  perform pgmq.archive('extract_knowledge', p_msg_id);

  select coalesce(max(attempt), 0)
  into v_attempt
  from public.job_log
  where queue_name = 'extract_knowledge'
    and payload->>'course_id' = p_course_id::text;

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, model_used
  ) values (
    'extract_knowledge', p_msg_id, p_job_payload, 'succeeded',
    v_attempt, p_model_used
  );

  return jsonb_build_object('outcome', 'succeeded');
end;
$$;

revoke all on function public.complete_knowledge_extraction(uuid, jsonb, jsonb, bigint, text, jsonb) from public;
grant execute on function public.complete_knowledge_extraction(uuid, jsonb, jsonb, bigint, text, jsonb) to service_role;

create or replace function public.fail_knowledge_extraction(
  p_course_id uuid,
  p_msg_id bigint,
  p_error text,
  p_model_used text,
  p_retryable boolean,
  p_job_payload jsonb,
  p_backoff_seconds int,
  p_read_ct int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_course public.courses%rowtype;
  v_permanent boolean;
begin
  select *
  into v_course
  from public.courses
  where id = p_course_id
  for update;

  if not found then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  v_permanent := (not p_retryable) or p_read_ct >= 4;

  if v_permanent then
    update public.courses
    set status = 'knowledge_extraction_failed',
        last_error = left(p_error, 1000),
        updated_at = now()
    where id = p_course_id;

    perform pgmq.archive('extract_knowledge', p_msg_id);

    insert into public.job_log (
      queue_name, msg_id, payload, status, attempt, error, model_used
    ) values (
      'extract_knowledge', p_msg_id, p_job_payload, 'dead',
      p_read_ct, left(p_error, 1000), p_model_used
    );

    return jsonb_build_object('outcome', 'failed_permanent');
  end if;

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error, model_used
  ) values (
    'extract_knowledge', p_msg_id, p_job_payload, 'retrying',
    p_read_ct, left(p_error, 1000), p_model_used
  );

  perform pgmq.set_vt('extract_knowledge', p_msg_id, p_backoff_seconds);

  return jsonb_build_object(
    'outcome', 'retrying',
    'backoff_seconds', p_backoff_seconds
  );
end;
$$;

revoke all on function public.fail_knowledge_extraction(uuid, bigint, text, text, boolean, jsonb, int, int) from public;
grant execute on function public.fail_knowledge_extraction(uuid, bigint, text, text, boolean, jsonb, int, int) to service_role;

create or replace function public.skip_knowledge_message(
  p_course_id uuid,
  p_msg_id bigint,
  p_reason text,
  p_job_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  perform pgmq.archive('extract_knowledge', p_msg_id);

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error
  ) values (
    'extract_knowledge', p_msg_id, p_job_payload, 'succeeded',
    0, left(p_reason, 1000)
  );

  return jsonb_build_object(
    'outcome', 'skipped',
    'reason', p_reason
  );
end;
$$;

revoke all on function public.skip_knowledge_message(uuid, bigint, text, jsonb) from public;
grant execute on function public.skip_knowledge_message(uuid, bigint, text, jsonb) to service_role;

create or replace function public.archive_malformed_knowledge_message(
  p_msg_id bigint,
  p_payload jsonb,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  perform pgmq.archive('extract_knowledge', p_msg_id);

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error
  ) values (
    'extract_knowledge', p_msg_id, p_payload, 'dead', 0, left(p_error, 1000)
  );
end;
$$;

revoke all on function public.archive_malformed_knowledge_message(bigint, jsonb, text) from public;
grant execute on function public.archive_malformed_knowledge_message(bigint, jsonb, text) to service_role;

create or replace function public.set_extract_knowledge_message_vt(
  p_msg_id bigint,
  p_vt_seconds int
)
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  perform pgmq.set_vt('extract_knowledge', p_msg_id, p_vt_seconds);
end;
$$;

revoke all on function public.set_extract_knowledge_message_vt(bigint, int) from public;
grant execute on function public.set_extract_knowledge_message_vt(bigint, int) to service_role;

create or replace function public.retry_knowledge_extraction(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_course public.courses%rowtype;
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

  if v_course.status <> 'knowledge_extraction_failed' then
    raise exception 'INVALID_STATE';
  end if;

  if exists (
    select 1
    from pgmq.q_extract_knowledge q
    where q.message->>'course_id' = p_course_id::text
  ) then
    return jsonb_build_object(
      'id', p_course_id,
      'status', v_course.status,
      'enqueued', false
    );
  end if;

  update public.courses
  set status = 'ingesting',
      last_error = null,
      updated_at = now()
  where id = p_course_id;

  perform pgmq.send(
    'extract_knowledge',
    jsonb_build_object('course_id', p_course_id)
  );

  return jsonb_build_object(
    'id', p_course_id,
    'status', 'ingesting',
    'enqueued', true
  );
end;
$$;

grant execute on function public.retry_knowledge_extraction(uuid) to authenticated;

create or replace function public.count_generate_artifacts_messages()
returns bigint
language sql
security definer
set search_path = public, pgmq
as $$
  select count(*)::bigint from pgmq.q_generate_artifacts;
$$;

create or replace function public.peek_generate_artifacts_messages()
returns table(msg_id bigint, message jsonb)
language sql
security definer
set search_path = public, pgmq
as $$
  select msg_id, message from pgmq.q_generate_artifacts order by msg_id;
$$;

create or replace function public.purge_generate_artifacts_messages()
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  perform pgmq.purge_queue('generate_artifacts');
end;
$$;

revoke all on function public.count_generate_artifacts_messages() from public;
revoke all on function public.peek_generate_artifacts_messages() from public;
revoke all on function public.purge_generate_artifacts_messages() from public;

grant execute on function public.count_generate_artifacts_messages() to service_role;
grant execute on function public.peek_generate_artifacts_messages() to service_role;
grant execute on function public.purge_generate_artifacts_messages() to service_role;

create or replace function public.enqueue_extract_knowledge_message(p_course_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  return pgmq.send(
    'extract_knowledge',
    jsonb_build_object('course_id', p_course_id)
  );
end;
$$;

revoke all on function public.enqueue_extract_knowledge_message(uuid) from public;
grant execute on function public.enqueue_extract_knowledge_message(uuid) to service_role;
