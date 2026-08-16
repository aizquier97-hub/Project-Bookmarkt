alter table if exists public.spoiler_reports
add column if not exists audit_id text;
