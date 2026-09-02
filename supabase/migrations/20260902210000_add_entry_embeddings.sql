-- Semantic search over the reader's own notes (D-039, Stage 4 Phase 2).
-- Embeddings are private numerical signatures of entry text, stored per
-- entry and scoped by RLS exactly like the entries themselves. Only the
-- service role (the companion Edge Function) writes them; the owner can
-- read and match against their own rows.

create extension if not exists vector with schema extensions;

create table if not exists public.entry_embeddings (
  entry_id bigint primary key references public.entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id bigint not null references public.topics(id) on delete cascade,
  content_hash text not null,
  embedding extensions.vector(768) not null,
  updated_at timestamptz not null default now()
);

alter table public.entry_embeddings enable row level security;

-- Owners may read their own embeddings (needed for the match RPC below).
-- No insert/update/delete policies: writes are service-role only.
drop policy if exists "entry_embeddings_select_own" on public.entry_embeddings;
create policy "entry_embeddings_select_own" on public.entry_embeddings
  for select using (auth.uid() = user_id);

create index if not exists entry_embeddings_user_topic_idx
  on public.entry_embeddings (user_id, topic_id);

-- Exact cosine match within one book. Security invoker: RLS confines the
-- scan to the caller's own rows. Per-user-per-book scale needs no ANN index.
create or replace function public.match_entry_embeddings(
  p_topic_id bigint,
  p_query_embedding text,
  p_match_count int default 8
)
returns table (entry_id bigint, similarity double precision)
language sql
security invoker
set search_path = public, extensions
as $$
  select
    e.entry_id,
    1 - (e.embedding operator(extensions.<=>) p_query_embedding::extensions.vector(768))
      as similarity
  from public.entry_embeddings e
  where e.topic_id = p_topic_id
    and e.user_id = auth.uid()
  order by e.embedding operator(extensions.<=>) p_query_embedding::extensions.vector(768)
  limit least(greatest(coalesce(p_match_count, 8), 1), 20);
$$;

grant execute on function public.match_entry_embeddings(bigint, text, int) to authenticated;
revoke execute on function public.match_entry_embeddings(bigint, text, int) from anon;
