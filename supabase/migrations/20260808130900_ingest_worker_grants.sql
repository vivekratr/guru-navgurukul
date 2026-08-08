-- Grants missed on first apply of ingest worker RPC migration

grant execute on function public.enqueue_ingest_source_message(uuid) to service_role;
