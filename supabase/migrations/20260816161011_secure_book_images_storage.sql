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
