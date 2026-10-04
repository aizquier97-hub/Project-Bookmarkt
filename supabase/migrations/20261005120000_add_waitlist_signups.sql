-- bookmarkt.io waitlist (D-069). The landing page's "Join the waitlist"
-- form posts straight to PostgREST with the publishable key, so this table
-- is the one place the public can write without an account. It is kept
-- write-only for them: anon may insert four columns and nothing else, and
-- only service_role (the dashboard, future export) can read.

create table if not exists public.waitlist_signups (
  id bigint generated always as identity primary key,
  email text not null,
  name text not null,
  platform text not null default 'unsure',
  currently_reading text,
  source text not null default 'bookmarkt.io',
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_shape check (
    length(email) between 6 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint waitlist_signups_name_length check (length(name) between 1 and 120),
  constraint waitlist_signups_platform check (platform in ('android', 'ios', 'both', 'unsure')),
  constraint waitlist_signups_reading_length check (
    currently_reading is null or length(currently_reading) between 1 and 200
  ),
  constraint waitlist_signups_source_length check (length(source) between 1 and 60)
);

comment on table public.waitlist_signups is
  'Marketing-site waitlist. Public insert via anon key; read by the owner in the dashboard only.';

-- One row per address however it was typed.
create unique index if not exists waitlist_signups_email_key
  on public.waitlist_signups (lower(email));

-- Normalise before the checks run (BEFORE triggers fire ahead of constraints),
-- and refuse a flood: a public insert endpoint with no account behind it
-- needs a ceiling. 300 an hour is far above any honest launch day; the
-- client shows "try again later" on this error.
create or replace function public.waitlist_signups_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  new.email := lower(btrim(new.email));
  new.name := btrim(new.name);
  new.currently_reading := nullif(btrim(coalesce(new.currently_reading, '')), '');
  new.source := coalesce(nullif(btrim(new.source), ''), 'bookmarkt.io');
  new.created_at := now();

  select count(*) into recent_count
  from public.waitlist_signups
  where created_at > now() - interval '1 hour';

  if recent_count >= 300 then
    raise exception 'waitlist is busy, try again later'
      using errcode = 'P0001', hint = 'waitlist_rate_limited';
  end if;

  return new;
end;
$$;

revoke all on function public.waitlist_signups_before_insert() from public, anon, authenticated;

drop trigger if exists waitlist_signups_before_insert on public.waitlist_signups;
create trigger waitlist_signups_before_insert
  before insert on public.waitlist_signups
  for each row execute function public.waitlist_signups_before_insert();

alter table public.waitlist_signups enable row level security;

drop policy if exists "Anyone may join the waitlist" on public.waitlist_signups;
create policy "Anyone may join the waitlist"
  on public.waitlist_signups
  for insert
  to anon
  with check (true);

-- No select, update, or delete for the public roles; `source` and
-- `created_at` are server-owned, so the insert grant names its columns.
revoke all on table public.waitlist_signups from anon, authenticated;
grant insert (email, name, platform, currently_reading) on public.waitlist_signups to anon;
grant all on table public.waitlist_signups to service_role;
