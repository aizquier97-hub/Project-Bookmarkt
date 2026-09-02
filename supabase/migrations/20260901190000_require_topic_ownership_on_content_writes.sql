-- Stage 3 exit-gate hardening: cross-account isolation probe showed a user
-- could attach their OWN rows to another user's topic id (no read leak —
-- SELECT stays user-scoped — but orphan garbage could accumulate under
-- someone else's book). Content inserts/updates now also require ownership
-- of the referenced topic.

drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.topics t
      where t.id = topic_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.topics t
      where t.id = topic_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "characters_insert_own" on public.characters;
create policy "characters_insert_own" on public.characters
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.topics t
      where t.id = topic_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "characters_update_own" on public.characters;
create policy "characters_update_own" on public.characters
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.topics t
      where t.id = topic_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "book_images_insert_own" on public.book_images;
create policy "book_images_insert_own" on public.book_images
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.topics t
      where t.id = topic_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "book_images_update_own" on public.book_images;
create policy "book_images_update_own" on public.book_images
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.topics t
      where t.id = topic_id and t.user_id = auth.uid()
    )
  );
