alter table if exists public.topics
add column if not exists publisher text;

alter table if exists public.topics
add column if not exists publication_year integer;

alter table if exists public.topics
add column if not exists total_pages integer;
