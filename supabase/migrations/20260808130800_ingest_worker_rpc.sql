-- Ingest worker queue operations (see docs/02-JOB-QUEUE.md)

create or replace function public.get_vision_ingest_visibility_timeout_seconds()
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
  where role = 'vision_ingest';
$$;

revoke all on function public.get_vision_ingest_visibility_timeout_seconds() from public;
grant execute on function public.get_vision_ingest_visibility_timeout_seconds() to service_role;

create or replace function public.read_ingest_queue_messages(
  p_vt_seconds int,
  p_batch_size int
)
returns table(msg_id bigint, read_ct int, message jsonb)
language sql
security definer
set search_path = public, pgmq
as $$
  select r.msg_id, r.read_ct, r.message
  from pgmq.read('ingest_source', p_vt_seconds, p_batch_size) as r;
$$;

revoke all on function public.read_ingest_queue_messages(int, int) from public;
grant execute on function public.read_ingest_queue_messages(int, int) to service_role;

create or replace function public.claim_source_for_processing(p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.sources%rowtype;
begin
  update public.sources
  set status = 'processing',
      attempt_count = attempt_count + 1,
      last_error = null,
      updated_at = now()
  where id = p_source_id
    and status in ('pending', 'failed')
  returning * into v_source;

  if found then
    return jsonb_build_object(
      'claimed', true,
      'source', to_jsonb(v_source)
    );
  end if;

  select *
  into v_source
  from public.sources
  where id = p_source_id;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'claimed', false,
    'reason', v_source.status,
    'source', to_jsonb(v_source)
  );
end;
$$;

revoke all on function public.claim_source_for_processing(uuid) from public;
grant execute on function public.claim_source_for_processing(uuid) to service_role;

create or replace function public.complete_source_ingestion(
  p_source_id uuid,
  p_course_id uuid,
  p_chunks jsonb,
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
  v_source public.sources%rowtype;
  v_chunk jsonb;
  v_enqueued boolean := false;
begin
  select *
  into v_source
  from public.sources
  where id = p_source_id
  for update;

  if not found then
    raise exception 'SOURCE_NOT_FOUND';
  end if;

  if v_source.status = 'done' then
    perform pgmq.archive('ingest_source', p_msg_id);

    insert into public.job_log (
      queue_name, msg_id, payload, status, attempt, model_used
    ) values (
      'ingest_source', p_msg_id, p_job_payload, 'succeeded',
      v_source.attempt_count, p_model_used
    );

    v_enqueued := public.maybe_enqueue_knowledge_extraction(p_course_id);

    return jsonb_build_object(
      'outcome', 'already_done',
      'knowledge_enqueued', v_enqueued
    );
  end if;

  if v_source.status not in ('processing', 'pending', 'failed') then
    raise exception 'INVALID_STATE';
  end if;

  if jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'INVALID_CHUNKS';
  end if;

  delete from public.source_chunks
  where source_id = p_source_id;

  for v_chunk in
    select value
    from jsonb_array_elements(p_chunks)
  loop
    if coalesce(v_chunk->>'text', '') = '' then
      raise exception 'INVALID_CHUNKS';
    end if;

    insert into public.source_chunks (
      source_id,
      course_id,
      heading,
      text,
      position
    ) values (
      p_source_id,
      p_course_id,
      nullif(v_chunk->>'heading', ''),
      v_chunk->>'text',
      coalesce((v_chunk->>'position')::int, 0)
    );
  end loop;

  update public.sources
  set status = 'done',
      last_error = null,
      updated_at = now()
  where id = p_source_id;

  perform pgmq.archive('ingest_source', p_msg_id);

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, model_used
  ) values (
    'ingest_source', p_msg_id, p_job_payload, 'succeeded',
    v_source.attempt_count, p_model_used
  );

  v_enqueued := public.maybe_enqueue_knowledge_extraction(p_course_id);

  return jsonb_build_object(
    'outcome', 'succeeded',
    'knowledge_enqueued', v_enqueued
  );
end;
$$;

revoke all on function public.complete_source_ingestion(uuid, uuid, jsonb, bigint, text, jsonb) from public;
grant execute on function public.complete_source_ingestion(uuid, uuid, jsonb, bigint, text, jsonb) to service_role;

create or replace function public.fail_source_ingestion(
  p_source_id uuid,
  p_course_id uuid,
  p_msg_id bigint,
  p_error text,
  p_model_used text,
  p_retryable boolean,
  p_job_payload jsonb,
  p_backoff_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_source public.sources%rowtype;
  v_permanent boolean;
  v_enqueued boolean := false;
begin
  select *
  into v_source
  from public.sources
  where id = p_source_id
  for update;

  if not found then
    raise exception 'SOURCE_NOT_FOUND';
  end if;

  v_permanent := (not p_retryable) or v_source.attempt_count >= 4;

  if v_permanent then
    update public.sources
    set status = 'failed_permanent',
        last_error = left(p_error, 1000),
        updated_at = now()
    where id = p_source_id;

    perform pgmq.archive('ingest_source', p_msg_id);

    insert into public.job_log (
      queue_name, msg_id, payload, status, attempt, error, model_used
    ) values (
      'ingest_source', p_msg_id, p_job_payload, 'dead',
      v_source.attempt_count, left(p_error, 1000), p_model_used
    );

    v_enqueued := public.maybe_enqueue_knowledge_extraction(p_course_id);

    return jsonb_build_object(
      'outcome', 'failed_permanent',
      'knowledge_enqueued', v_enqueued
    );
  end if;

  update public.sources
  set status = 'failed',
      last_error = left(p_error, 1000),
      updated_at = now()
  where id = p_source_id;

  perform pgmq.set_vt('ingest_source', p_msg_id, p_backoff_seconds);

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error, model_used
  ) values (
    'ingest_source', p_msg_id, p_job_payload, 'retrying',
    v_source.attempt_count, left(p_error, 1000), p_model_used
  );

  return jsonb_build_object(
    'outcome', 'retrying',
    'backoff_seconds', p_backoff_seconds
  );
end;
$$;

revoke all on function public.fail_source_ingestion(uuid, uuid, bigint, text, text, boolean, jsonb, int) from public;
grant execute on function public.fail_source_ingestion(uuid, uuid, bigint, text, text, boolean, jsonb, int) to service_role;

create or replace function public.skip_ingest_message(
  p_source_id uuid,
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
declare
  v_source public.sources%rowtype;
  v_enqueued boolean := false;
begin
  select *
  into v_source
  from public.sources
  where id = p_source_id;

  perform pgmq.archive('ingest_source', p_msg_id);

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error
  ) values (
    'ingest_source', p_msg_id, p_job_payload, 'succeeded',
    coalesce(v_source.attempt_count, 0), left(p_reason, 1000)
  );

  if p_course_id is not null then
    v_enqueued := public.maybe_enqueue_knowledge_extraction(p_course_id);
  end if;

  return jsonb_build_object(
    'outcome', 'skipped',
    'reason', p_reason,
    'knowledge_enqueued', v_enqueued
  );
end;
$$;

revoke all on function public.skip_ingest_message(uuid, uuid, bigint, text, jsonb) from public;
grant execute on function public.skip_ingest_message(uuid, uuid, bigint, text, jsonb) to service_role;

create or replace function public.maybe_enqueue_knowledge_extraction(p_course_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_course public.courses%rowtype;
  v_non_terminal int;
  v_done_count int;
begin
  select *
  into v_course
  from public.courses
  where id = p_course_id
  for update;

  if not found then
    return false;
  end if;

  if v_course.status <> 'ingesting' then
    return false;
  end if;

  if exists (
    select 1
    from pgmq.q_extract_knowledge q
    where q.message->>'course_id' = p_course_id::text
  ) then
    return false;
  end if;

  select count(*)
  into v_non_terminal
  from public.sources
  where course_id = p_course_id
    and status not in ('done', 'failed_permanent', 'cancelled');

  if v_non_terminal > 0 then
    return false;
  end if;

  select count(*)
  into v_done_count
  from public.sources
  where course_id = p_course_id
    and status = 'done';

  if v_done_count = 0 then
    return false;
  end if;

  perform pgmq.send(
    'extract_knowledge',
    jsonb_build_object('course_id', p_course_id)
  );

  return true;
end;
$$;

revoke all on function public.maybe_enqueue_knowledge_extraction(uuid) from public;
grant execute on function public.maybe_enqueue_knowledge_extraction(uuid) to service_role;

create or replace function public.count_extract_knowledge_messages()
returns bigint
language sql
security definer
set search_path = public, pgmq
as $$
  select count(*)::bigint from pgmq.q_extract_knowledge;
$$;

create or replace function public.peek_extract_knowledge_messages()
returns table(msg_id bigint, message jsonb)
language sql
security definer
set search_path = public, pgmq
as $$
  select msg_id, message from pgmq.q_extract_knowledge order by msg_id;
$$;

create or replace function public.purge_extract_knowledge_messages()
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  perform pgmq.purge_queue('extract_knowledge');
end;
$$;

revoke all on function public.count_extract_knowledge_messages() from public;
revoke all on function public.peek_extract_knowledge_messages() from public;
revoke all on function public.purge_extract_knowledge_messages() from public;

grant execute on function public.count_extract_knowledge_messages() to service_role;
grant execute on function public.peek_extract_knowledge_messages() to service_role;
grant execute on function public.purge_extract_knowledge_messages() to service_role;

create or replace function public.set_ingest_message_vt(
  p_msg_id bigint,
  p_vt_seconds int
)
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  perform pgmq.set_vt('ingest_source', p_msg_id, p_vt_seconds);
end;
$$;

revoke all on function public.set_ingest_message_vt(bigint, int) from public;
grant execute on function public.set_ingest_message_vt(bigint, int) to service_role;

create or replace function public.archive_malformed_ingest_message(
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
  perform pgmq.archive('ingest_source', p_msg_id);

  insert into public.job_log (
    queue_name, msg_id, payload, status, attempt, error
  ) values (
    'ingest_source', p_msg_id, p_payload, 'dead', 0, left(p_error, 1000)
  );
end;
$$;

revoke all on function public.archive_malformed_ingest_message(bigint, jsonb, text) from public;
grant execute on function public.archive_malformed_ingest_message(bigint, jsonb, text) to service_role;

grant execute on function public.enqueue_ingest_source_message(uuid) to service_role;
