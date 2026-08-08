-- Extensions required by the architecture (pgmq queues, pg_cron ticks, pg_net HTTP, UUIDs)
create schema if not exists pgmq;
create extension if not exists pgmq with schema pgmq;
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
