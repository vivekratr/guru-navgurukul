create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create trigger trg_sources_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();
