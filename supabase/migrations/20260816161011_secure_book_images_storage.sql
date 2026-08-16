-- Book images are account data. Keep the bucket private and authorize objects by the
-- first folder segment, which the app always sets to the authenticated user id.
update storage.buckets
set public = false
where id = 'book-images';

-- Remove the known legacy policies deterministically, including the broad public
-- SELECT policy named by Supabase Security Advisor.
drop policy if exists "book_images_objects_select" on storage.objects;
drop policy if exists "book_images_objects_insert" on storage.objects;
drop policy if exists "book_images_objects_update" on storage.objects;
drop policy if exists "book_images_objects_delete" on storage.objects;

-- Also clean up older policies tied to this bucket under alternate names.
do $
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike 'book\_images%' escape '\'
        or coalesce(qual, '') like '%book-images%'
        or coalesce(with_check, '') like '%book-images%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
  end loop;
end;
$$;

create policy "book_images_objects_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'book-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "book_images_objects_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'book-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "book_images_objects_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'book-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'book-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "book_images_objects_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'book-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
