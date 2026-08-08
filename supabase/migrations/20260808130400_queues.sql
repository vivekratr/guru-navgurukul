-- Three isolated pipeline queues (one per stage — see docs/02-JOB-QUEUE.md)
select pgmq.create('ingest_source');
select pgmq.create('extract_knowledge');
select pgmq.create('generate_artifacts');
