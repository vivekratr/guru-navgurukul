-- Artifact generation worker queue operations (see docs/02-JOB-QUEUE.md)

create or replace function public.get_content_generation_visibility_timeout_seconds()
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
  where role = 'content_generation';
$$;

revoke all on function public.get_content_generation_visibility_timeout_seconds() from public;
grant execute on function public.get_content_generation_visibility_timeout_seconds() to service_role;

create or replace function public.read_generate_artifacts_queue_messages(
  p_vt_seconds int,
  p_batch_size int
)
returns table(msg_id bigint, read_ct int, message jsonb)
language sql
security definer
set search_path = public, pgmq
as $$
  select r.msg_id, r.read_ct, r.message
  from pgmq.read('generate_artifacts', p_vt_seconds, p_batch_size) as r;
$$;

revoke all on function public.read_generate_artifacts_queue_messages(int, int) from public;
grant execute on function public.read_generate_artifacts_queue_messages(int, int) to service_role;

create or replace function public.claim_artifact_for_processing(
  p_course_id uuid,
  p_artifact_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.artifact_generation_status%rowtype;
begin
  update public.artifact_generation_status
  set status = 'processing',
      attempt_count = attempt_count + 1,
      last_error = null,
      updated_at = now()
  where course_id = p_course_id
    and artifact_type = p_artifact_type
    and status = 'pending'
  returning * into v_row;

  if found then
    return jsonb_build_object(
      'claimed', true,
      'artifact', to_jsonb(v_row)
    );
  end if;

  select *
  into v_row
  from public.artifact_generation_status
  where course_id = p_course_id
    and artifact_type = p_artifact_type;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'claimed', false,
    'reason', v_row.status,
    'artifact', to_jsonb(v_row)
  );
end;
$$;

revoke all on function public.claim_artifact_for_processing(uuid, text) from public;
grant execute on function public.claim_artifact_for_processing(uuid, text) to service_role;

create or replace function public.maybe_aggregate_course_artifact_status(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course public.courses%rowtype;
  v_flashcards text;
  v_summary text;
begin
  select *
  into v_course
  from public.courses
  where id = p_course_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'course_not_found');
  end if;

  select status
  into v_flashcards
  from public.artifact_generation_status
  where course_id = p_course_id
    and artifact_type = 'flashcards';

  select status
  into v_summary
  from public.artifact_generation_status
  where course_id = p_course_id
    and artifact_type = 'summary';

  if v_flashcards is null or v_summary is null then
    return jsonb_build_object('outcome', 'incomplete_status_rows');
  end if;

  if v_flashcards not in ('done', 'failed_permanent')
     or v_summary not in ('done', 'failed_permanent') then
    return jsonb_build_object('outcome', 'still_generating');
  end if;

  if v_flashcards = 'done' and v_summary = 'done' then
    update public.courses
    set status = 'ready',
        last_error = null,
        updated_at = now()
    where id = p_course_id;

    return jsonb_build_object('outcome', 'ready');
  end if;

  if (v_flashcards = 'done' and v_summary = 'failed_permanent')
     or (v_flashcards = 'failed_permanent' and v_summary = 'done') then
    update public.courses
    set status = 'partially_ready',
        updated_at = now()
    where id = p_course_id;

    return jsonb_build_object('outcome', 'partially_ready');
  end if;

  return jsonb_build_object('outcome', 'both_failed');
end;
$$;

revoke all on function public.maybe_aggregate_course_artifact_status(uuid) from public;
grant execute on function public.maybe_aggregate_course_artifact_status(uuid) to service_role;

create or replace function public.complete_artifact_flashcards(
  p_course_id uuid,
  p_flashcards jsonb,
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
  v_card jsonb;
  v_existing int;
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

  select *
  into v_artifact
  from public.artifact_generation_status
  where course_id = p_course_id
    and artifact_type = 'flashcards'
  for update;

  if not found then
    raise exception 'INVALID_STATE';
  end if;

  select count(*)
  into v_existing
  from public.flashcards
  where course_id = p_course_id;

  if v_artifact.status = 'done' or v_existing > 0 then
    perform pgmq.archive('generate_artifacts', p_msg_id);

    select coalesce(max(attempt), 0)
    into v_attempt
    from public.job_log
    where queue_name = 'generate_artifacts'
      and payload->>'course_id' = p_course_id::text
      and payload->>'artifact_type' = 'flashcards';

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

  if jsonb_typeof(p_flashcards) <> 'array' or jsonb_array_length(p_flashcards) = 0 then
    raise exception 'INVALID_FLASHCARDS';
  end if;

  for v_card in
    select value
    from jsonb_array_elements(p_flashcards)
  loop
    if coalesce(v_card->>'front', '') = ''
       or coalesce(v_card->>'back', '') = ''
       or v_card->>'concept_id' is null then
      raise exception 'INVALID_FLASHCARDS';
    end if;

    if not exists (
      select 1
      from public.concepts c
      where c.id = (v_card->>'concept_id')::uuid
        and c.course_id = p_course_id
    ) then
      raise exception 'INVALID_FLASHCARDS';
    end if;

    insert into public.flashcards (
      course_id,
      concept_id,
      front,
      back
    ) values (
      p_course_id,
      (v_card->>'concept_id')::uuid,
      v_card->>'front',
      v_card->>'back'
    );
  end loop;

  update public.artifact_generation_status
  set status = 'done',
      last_error = null,
      updated_at = now()
  where course_id = p_course_id
    and artifact_type = 'flashcards';

  perform pgmq.archive('generate_artifacts', p_msg_id);

  select coalesce(max(attempt), 0)
  into v_attempt
  from public.job_log
  where queue_name = 'generate_artifacts'
    and payload->>'course_id' = p_course_id::text
    and payload->>'artifact_type' = 'flashcards';

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

revoke all on function public.complete_artifact_flashcards(uuid, jsonb, bigint, text, jsonb) from public;
grant execute on function public.complete_artifact_flashcards(uuid, jsonb, bigint, text, jsonb) to service_role;

create or replace function public.complete_artifact_summary(
  p_course_id uuid,
  p_short text,
  p_detailed text,
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
  v_existing int;
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
  from public.summaries
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

  if coalesce(p_short, '') = '' or coalesce(p_detailed, '') = '' then
    raise exception 'INVALID_SUMMARY';
  end if;

  insert into public.summaries (course_id, kind, content) values
    (p_course_id, 'short', p_short),
    (p_course_id, 'detailed', p_detailed);

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

revoke all on function public.complete_artifact_summary(uuid, text, text, bigint, text, jsonb) from public;
grant execute on function public.complete_artifact_summary(uuid, text, text, bigint, text, jsonb) to service_role;

create or replace function public.fail_artifact_generation(
  p_course_id uuid,
  p_artifact_type text,
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
  v_artifact public.artifact_generation_status%rowtype;
  v_permanent boolean;
begin
  select *
  into v_artifact
  from public.artifact_generation_status
  where course_id = p_course_id
    and artifact_type = p_artifact_type
  for update;

  if not found then
    raise exception 'COURSE_NOT_FOUND';
  end if;

  v_permanent := (not p_retryable) or p_read_ct >= 4;

  if v_permanent then
    update public.artifact_generation_status
    set status = 'failed_permanent',
        last_error = left(p_error, 1000),
        updated_at = now()
    where course_id = p_course_id
      and artifact_type = p_artifact_type;

    perform pgmq.archive('generate_artifacts', p_msg_id);

    insert into public.job_log (
      queue_name, msg_id, payload, status, attempt, error, model_used
    ) values (
      'generate_artifacts', p_msg_id, p_job_payload, 'dead',
      p_read_ct, left(p_error, 1000), p_model_used
    );

    perform public.maybe_aggregate_course_artifact_status(p_course_id);

    return jsonb_build_object('outcome', 'failed_permanent');
  end if;

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error, model_used
  ) values (
    'generate_artifacts', p_msg_id, p_job_payload, 'retrying',
    p_read_ct, left(p_error, 1000), p_model_used
  );

  perform pgmq.set_vt('generate_artifacts', p_msg_id, p_backoff_seconds);

  return jsonb_build_object(
    'outcome', 'retrying',
    'backoff_seconds', p_backoff_seconds
  );
end;
$$;

revoke all on function public.fail_artifact_generation(uuid, text, bigint, text, text, boolean, jsonb, int, int) from public;
grant execute on function public.fail_artifact_generation(uuid, text, bigint, text, text, boolean, jsonb, int, int) to service_role;

create or replace function public.skip_artifact_message(
  p_course_id uuid,
  p_artifact_type text,
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
  perform pgmq.archive('generate_artifacts', p_msg_id);

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error
  ) values (
    'generate_artifacts', p_msg_id, p_job_payload, 'succeeded',
    0, left(p_reason, 1000)
  );

  return jsonb_build_object(
    'outcome', 'skipped',
    'reason', p_reason
  );
end;
$$;

revoke all on function public.skip_artifact_message(uuid, text, bigint, text, jsonb) from public;
grant execute on function public.skip_artifact_message(uuid, text, bigint, text, jsonb) to service_role;

create or replace function public.archive_malformed_artifact_message(
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
  perform pgmq.archive('generate_artifacts', p_msg_id);

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error
  ) values (
    'generate_artifacts', p_msg_id, p_payload, 'dead', 0, left(p_error, 1000)
  );
end;
$$;

revoke all on function public.archive_malformed_artifact_message(bigint, jsonb, text) from public;
grant execute on function public.archive_malformed_artifact_message(bigint, jsonb, text) to service_role;

create or replace function public.set_generate_artifacts_message_vt(
  p_msg_id bigint,
  p_vt_seconds int
)
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  perform pgmq.set_vt('generate_artifacts', p_msg_id, p_vt_seconds);
end;
$$;

revoke all on function public.set_generate_artifacts_message_vt(bigint, int) from public;
grant execute on function public.set_generate_artifacts_message_vt(bigint, int) to service_role;

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

create or replace function public.enqueue_generate_artifacts_message(
  p_course_id uuid,
  p_artifact_type text
)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  return pgmq.send(
    'generate_artifacts',
    jsonb_build_object(
      'course_id', p_course_id,
      'artifact_type', p_artifact_type
    )
  );
end;
$$;

revoke all on function public.enqueue_generate_artifacts_message(uuid, text) from public;
grant execute on function public.enqueue_generate_artifacts_message(uuid, text) to service_role;
