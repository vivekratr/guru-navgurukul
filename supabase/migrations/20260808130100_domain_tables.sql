-- Domain tables (dependency order: courses → sources → chunks → concepts → artifacts)

create table public.courses (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  status        text not null default 'draft'
                check (status in (
                  'draft', 'ingesting', 'extracting_knowledge',
                  'knowledge_extraction_failed', 'generating_artifacts',
                  'ready', 'partially_ready'
                )),
  last_error    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_courses_user_id on public.courses(user_id);
create index idx_courses_status on public.courses(status);

create table public.sources (
  id             uuid primary key default extensions.uuid_generate_v4(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  type           text not null check (type in ('text', 'doc', 'image', 'video')),
  title          text,
  storage_path   text,
  raw_text       text,
  status         text not null default 'pending'
                 check (status in (
                   'pending', 'processing', 'done',
                   'failed', 'failed_permanent', 'cancelled'
                 )),
  attempt_count  int not null default 0,
  last_error     text,
  duration_sec   numeric,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_sources_course_id on public.sources(course_id);
create index idx_sources_status on public.sources(status);

create table public.source_chunks (
  id          uuid primary key default extensions.uuid_generate_v4(),
  source_id   uuid not null references public.sources(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  heading     text,
  text        text not null,
  position    int not null,
  created_at  timestamptz not null default now()
);

create index idx_chunks_source_id on public.source_chunks(source_id);
create index idx_chunks_course_id on public.source_chunks(course_id);

create table public.concepts (
  id            uuid primary key default extensions.uuid_generate_v4(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  name          text not null,
  description   text,
  difficulty    text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  created_at    timestamptz not null default now()
);

create index idx_concepts_course_id on public.concepts(course_id);

create table public.concept_relationships (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  course_id           uuid not null references public.courses(id) on delete cascade,
  source_concept_id   uuid not null references public.concepts(id) on delete cascade,
  target_concept_id   uuid not null references public.concepts(id) on delete cascade,
  type                text not null check (type in ('contains', 'prerequisite', 'related')),
  created_at          timestamptz not null default now()
);

create index idx_relationships_course_id on public.concept_relationships(course_id);
create index idx_relationships_source on public.concept_relationships(source_concept_id);

create table public.flashcards (
  id           uuid primary key default extensions.uuid_generate_v4(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  concept_id   uuid references public.concepts(id) on delete set null,
  front        text not null,
  back         text not null,
  created_at   timestamptz not null default now()
);

create index idx_flashcards_course_id on public.flashcards(course_id);
create index idx_flashcards_concept_id on public.flashcards(concept_id);

create table public.summaries (
  id           uuid primary key default extensions.uuid_generate_v4(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  kind         text not null check (kind in ('short', 'detailed')),
  content      text not null,
  created_at   timestamptz not null default now()
);

create index idx_summaries_course_id on public.summaries(course_id);

create table public.artifact_generation_status (
  course_id      uuid not null references public.courses(id) on delete cascade,
  artifact_type  text not null check (artifact_type in ('flashcards', 'summary')),
  status         text not null default 'pending'
                 check (status in ('pending', 'processing', 'done', 'failed_permanent')),
  attempt_count  int not null default 0,
  last_error     text,
  updated_at     timestamptz not null default now(),
  primary key (course_id, artifact_type)
);

create table public.job_log (
  id             uuid primary key default extensions.uuid_generate_v4(),
  queue_name     text not null,
  msg_id         bigint,
  payload        jsonb not null,
  status         text not null check (status in
                 ('queued', 'claimed', 'succeeded', 'retrying', 'dead')),
  attempt        int not null default 1,
  error          text,
  model_used     text,
  created_at     timestamptz not null default now()
);

create index idx_job_log_queue_status on public.job_log(queue_name, status);

create table public.model_roles (
  role           text primary key,
  chain          jsonb not null,
  max_tokens     int not null default 4000,
  timeout_ms     int not null default 30000,
  updated_at     timestamptz not null default now()
);
