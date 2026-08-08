-- Atomic generation trigger + source retry enqueue (see docs/02-JOB-QUEUE.md)

create or replace function public.enqueue_ingest_source_message(p_source_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  return pgmq.send(
    'ingest_source',
    jsonb_build_object('source_id', p_source_id)
  );
end;
$$;

revoke all on function public.enqueue_ingest_source_message(uuid) from public;
revoke all on function public.enqueue_ingest_source_message(uuid) from anon;
revoke all on function public.enqueue_ingest_source_message(uuid) from authenticated;

create or replace function public.start_course_ingestion(p_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_course public.courses%rowtype;
  v_pending_id uuid;
  v_enqueued int := 0;
  v_usable_count int;
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

  if v_course.status = 'ingesting' then
    return jsonb_build_object(
      'id', v_course.id,
      'status', v_course.status,
      'enqueued', 0
    );
  end if;

  if v_course.status <> 'draft' then
    raise exception 'INVALID_STATE';
  end if;

  select count(*)
  into v_usable_count
  from public.sources
  where course_id = p_course_id
    and status in ('pending', 'done');

  if v_usable_count = 0 then
    raise exception 'INVALID_STATE';
  end if;

  update public.courses
  set status = 'ingesting',
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

create or replace function public.retry_source_ingestion(
  p_course_id uuid,
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  v_source public.sources%rowtype;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select s.*
  into v_source
  from public.sources s
  inner join public.courses c on c.id = s.course_id
  where s.id = p_source_id
    and s.course_id = p_course_id
    and c.user_id = auth.uid()
  for update of s;

  if not found then
    raise exception 'SOURCE_NOT_FOUND';
  end if;

  if v_source.status <> 'failed_permanent' then
    raise exception 'INVALID_STATE';
  end if;

  update public.sources
  set status = 'pending',
      attempt_count = 0,
      last_error = null,
      updated_at = now()
  where id = p_source_id;

  perform public.enqueue_ingest_source_message(p_source_id);

  return jsonb_build_object(
    'id', p_source_id,
    'status', 'pending'
  );
end;
$$;

-- Test/ops helpers (service role only)
create or replace function public.count_ingest_queue_messages()
returns bigint
language sql
security definer
set search_path = public, pgmq
as $$
  select count(*)::bigint from pgmq.q_ingest_source;
$$;

create or replace function public.peek_ingest_queue_messages()
returns table(msg_id bigint, message jsonb)
language sql
security definer
set search_path = public, pgmq
as $$
  select msg_id, message from pgmq.q_ingest_source order by msg_id;
$$;

create or replace function public.purge_ingest_queue_messages()
returns void
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  perform pgmq.purge_queue('ingest_source');
end;
$$;

grant execute on function public.start_course_ingestion(uuid) to authenticated;
grant execute on function public.retry_source_ingestion(uuid, uuid) to authenticated;

revoke all on function public.count_ingest_queue_messages() from public;
revoke all on function public.peek_ingest_queue_messages() from public;
revoke all on function public.purge_ingest_queue_messages() from public;

grant execute on function public.count_ingest_queue_messages() to service_role;
grant execute on function public.peek_ingest_queue_messages() to service_role;
grant execute on function public.purge_ingest_queue_messages() to service_role;
