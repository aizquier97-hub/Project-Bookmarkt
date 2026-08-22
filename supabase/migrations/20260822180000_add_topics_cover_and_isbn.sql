-- D-028: real cover art and ISBN capture for books.
-- Additive and backward-compatible: older clients simply ignore the columns.
-- cover_url stores the reader-selected cover image URL (Open Library today,
-- reader-photo upload later). isbn stores the normalized ISBN-10/13 captured
-- from a barcode scan or typed lookup, kept for provenance and future
-- edition-aware features.
alter table public.topics
  add column if not exists cover_url text,
  add column if not exists isbn text;
