-- D-063: Difficulty Index v2. The D-062 metadata prior compressed every
-- novel to "Moderate" (edition year, not first publication; Google's first
-- category is usually just "Fiction"). The book-difficulty Edge Function now
-- rates each book once against a rubric from what is known about the title
-- (docs/READING_METRICS.md section 2) and caches the result on the topic row.
-- Reader overrides (difficulty_override) keep winning; nothing here changes
-- RLS - rows are written under the owner's JWT, like difficulty_override.

alter table public.topics
  add column if not exists difficulty_estimate numeric(3,1)
    check (difficulty_estimate is null or (difficulty_estimate >= 1 and difficulty_estimate <= 10)),
  add column if not exists difficulty_estimate_confidence text
    check (difficulty_estimate_confidence is null or difficulty_estimate_confidence in ('high', 'medium', 'low')),
  add column if not exists difficulty_rationale text
    check (difficulty_rationale is null or char_length(difficulty_rationale) <= 240),
  add column if not exists difficulty_estimated_at timestamptz;

comment on column public.topics.difficulty_estimate is
  'D-063: knowledge-based Difficulty Index 1-10 from the book-difficulty function; null until estimated.';
comment on column public.topics.difficulty_estimate_confidence is
  'D-063: high/medium when the title is recognized, low when inferred from genre, year, and length.';
comment on column public.topics.difficulty_rationale is
  'D-063: one-sentence reason shown in Edit book.';
comment on column public.topics.difficulty_estimated_at is
  'D-063: when the estimate was written; also the per-user daily rate-limit counter.';
