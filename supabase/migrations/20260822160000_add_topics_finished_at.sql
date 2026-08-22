-- Finished-book flag (D-023): a reader can mark a book finished and the
-- shelf celebrates it. Additive and backward-compatible: older clients
-- ignore the column; null means "still reading".
alter table public.topics add column if not exists finished_at timestamptz;
