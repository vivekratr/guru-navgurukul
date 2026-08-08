-- User-owned domain tables: RLS scoped via courses.user_id = auth.uid()

alter table public.courses enable row level security;
alter table public.sources enable row level security;
alter table public.source_chunks enable row level security;
alter table public.concepts enable row level security;
alter table public.concept_relationships enable row level security;
alter table public.flashcards enable row level security;
alter table public.summaries enable row level security;
alter table public.artifact_generation_status enable row level security;

create policy "own courses only"
  on public.courses for all
  using (auth.uid() = user_id);

create policy "sources via course ownership"
  on public.sources for all
  using (course_id in (select id from public.courses where user_id = auth.uid()));

create policy "chunks via course ownership"
  on public.source_chunks for all
  using (course_id in (select id from public.courses where user_id = auth.uid()));

create policy "concepts via course ownership"
  on public.concepts for all
  using (course_id in (select id from public.courses where user_id = auth.uid()));

create policy "relationships via course ownership"
  on public.concept_relationships for all
  using (course_id in (select id from public.courses where user_id = auth.uid()));

create policy "flashcards via course ownership"
  on public.flashcards for all
  using (course_id in (select id from public.courses where user_id = auth.uid()));

create policy "summaries via course ownership"
  on public.summaries for all
  using (course_id in (select id from public.courses where user_id = auth.uid()));

create policy "artifact status via course ownership"
  on public.artifact_generation_status for all
  using (course_id in (select id from public.courses where user_id = auth.uid()));

-- Service-role-only tables: RLS enabled with no user policies
alter table public.job_log enable row level security;
alter table public.model_roles enable row level security;

revoke all on public.job_log from anon, authenticated;
revoke all on public.model_roles from anon, authenticated;
