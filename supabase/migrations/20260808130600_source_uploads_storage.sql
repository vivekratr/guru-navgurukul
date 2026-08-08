-- Private bucket for direct-to-Storage source uploads (see docs/06-FRONTEND-RESILIENCE.md)

insert into storage.buckets (id, name, public)
values ('source-uploads', 'source-uploads', false)
on conflict (id) do update
set public = excluded.public;

-- Path convention: <user_id>/<course_id>/<upload_id>/<filename>

create policy "source uploads insert own prefix"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'source-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source uploads select own prefix"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'source-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source uploads delete own prefix"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'source-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "source uploads update own prefix"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'source-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'source-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
