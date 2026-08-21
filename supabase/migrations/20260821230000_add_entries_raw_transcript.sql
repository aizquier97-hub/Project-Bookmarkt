-- Voice capture (roadmap §11, D-016): dictated entries store the verbatim
-- on-device transcript alongside the cleaned text. Raw audio never leaves the
-- device and is deleted after confirmation; only the transcript persists.
alter table public.entries
  add column if not exists raw_transcript text;

comment on column public.entries.raw_transcript is
  'Verbatim on-device speech transcript for dictated entries (D-016). Null for typed entries.';
