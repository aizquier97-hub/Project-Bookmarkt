-- D-015 bookmark registry: unique physical bookmark IDs, claim, link,
-- unlink, relink, and audit history. Scanning is an accelerator and never
-- a capture gate.

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  topic_id bigint references public.topics (id) on delete set null,
  claimed_at timestamptz,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bookmarks is
  'Registry of physical bookmark IDs (D-015). user_id null = unclaimed; topic_id null = unlinked.';

create index if not exists bookmarks_user_id_idx on public.bookmarks (user_id);
create index if not exists bookmarks_topic_id_idx on public.bookmarks (topic_id);

create table if not exists public.bookmark_events (
  id bigint generated always as identity primary key,
  bookmark_id uuid not null references public.bookmarks (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  event text not null check (event in ('registered', 'claimed', 'linked', 'unlinked', 'relinked', 'scanned')),
  topic_id bigint,
  created_at timestamptz not null default now()
);

comment on table public.bookmark_events is
  'Audit history for bookmark lifecycle (D-015).';

create index if not exists bookmark_events_bookmark_id_idx on public.bookmark_events (bookmark_id);

alter table public.bookmarks enable row level security;
alter table public.bookmark_events enable row level security;

-- Owners see their bookmarks; any authenticated user can see unclaimed rows
-- so a scanned factory bookmark can be resolved and claimed.
create policy "bookmarks_select_own_or_unclaimed"
  on public.bookmarks for select
  to authenticated
  using (user_id = (select auth.uid()) or user_id is null);

-- Stage 2 test path (and future bring-your-own bookmark): a user registers a
-- bookmark they immediately own. Production factory batches insert with the
-- service role, which bypasses RLS.
create policy "bookmarks_insert_self_owned"
  on public.bookmarks for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Claim (user_id null -> self) and manage (link/unlink/relink) rows you own.
-- The WITH CHECK clause keeps ownership with the caller after every update.
create policy "bookmarks_update_claim_or_own"
  on public.bookmarks for update
  to authenticated
  using (user_id = (select auth.uid()) or user_id is null)
  with check (user_id = (select auth.uid()));

create policy "bookmarks_delete_own"
  on public.bookmarks for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy "bookmark_events_select_own"
  on public.bookmark_events for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "bookmark_events_insert_own"
  on public.bookmark_events for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Keep updated_at honest on every mutation.
create or replace function public.set_bookmarks_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bookmarks_set_updated_at on public.bookmarks;
create trigger bookmarks_set_updated_at
  before update on public.bookmarks
  for each row execute function public.set_bookmarks_updated_at();
