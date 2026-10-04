-- D-070 (2026-10-04): the pricing decision landed - monthly 7.99 USD and
-- yearly 79.99 USD, each Play base plan carrying a 7-day free trial. The
-- store's free trial is therefore *the* trial: Google enforces one per
-- account, converts it to a paid period, and sends the pre-charge reminder.
-- The no-card Bookmarkt trial from D-068 stays in the schema as a lever but
-- is switched off here; the entries-before-offer gate (`needs_entries`)
-- keeps working, because it now guards the plan buttons that carry the
-- store trial.
--
-- Version note: this file continues the D-068 sequence (20261005090000),
-- whose stamp ran a day ahead of the calendar; versions must stay
-- monotonic and follow the remote history (which also holds the waitlist
-- migration 20261005120000), so this one follows them rather than the real
-- date.

-- 1. Policy flag. Default false = the decided state (store trial). Flip to
-- true with one update to re-enable the no-card Bookmarkt trial; record the
-- change in the decision log.
alter table public.companion_trial_policy
  add column if not exists bookmarkt_trial_enabled boolean not null default false;

update public.companion_trial_policy
set bookmarkt_trial_enabled = false,
    updated_at = now()
where id = 1;

comment on column public.companion_trial_policy.bookmarkt_trial_enabled is
  'D-070: false (default) means the store free trial on the plans is the only trial; true re-enables the no-card Bookmarkt trial RPC.';

-- 2. Eligibility. Same return shape (old clients fold the new reason to
-- "no card to show" and fall through to the plans). Order is unchanged:
-- row states first, then the entries gate, and only an otherwise-eligible
-- reader is told the trial lives on the store plans (`store_trial`).
create or replace function public.companion_trial_eligibility()
returns table (
  eligible boolean,
  reason text,
  entries_logged integer,
  entries_required integer,
  trial_days integer
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_user uuid := auth.uid();
  v_row public.companion_entitlements%rowtype;
  v_policy public.companion_trial_policy%rowtype;
  v_entries integer := 0;
begin
  if v_user is null then
    raise exception 'Authenticated user is required';
  end if;

  select * into v_policy from public.companion_trial_policy where id = 1;
  if not found then
    v_policy.trial_days := 7;
    v_policy.qualifying_entries := 5;
    v_policy.bookmarkt_trial_enabled := false;
  end if;

  select count(*)::integer into v_entries
  from public.entries e
  where e.user_id = v_user;

  select * into v_row from public.companion_entitlements where user_id = v_user;

  if found then
    if v_row.trial_started_at is not null then
      return query select false, 'trial_used'::text, v_entries, v_policy.qualifying_entries, v_policy.trial_days;
      return;
    end if;
    if v_row.status in ('comped', 'active', 'trial') then
      return query select false, 'entitled_already'::text, v_entries, v_policy.qualifying_entries, v_policy.trial_days;
      return;
    end if;
    if v_row.status in ('expired', 'canceled') then
      return query select false, 'subscription_history'::text, v_entries, v_policy.qualifying_entries, v_policy.trial_days;
      return;
    end if;
  end if;

  if v_entries < v_policy.qualifying_entries then
    return query select false, 'needs_entries'::text, v_entries, v_policy.qualifying_entries, v_policy.trial_days;
    return;
  end if;

  if not v_policy.bookmarkt_trial_enabled then
    return query select false, 'store_trial'::text, v_entries, v_policy.qualifying_entries, v_policy.trial_days;
    return;
  end if;

  return query select true, 'eligible'::text, v_entries, v_policy.qualifying_entries, v_policy.trial_days;
end;
$$;

revoke all on function public.companion_trial_eligibility() from public, anon;
grant execute on function public.companion_trial_eligibility() to authenticated, service_role;

-- start_companion_trial() is unchanged: it re-reads this eligibility under
-- the advisory lock, so with the flag off it refuses with reason
-- `store_trial` and writes nothing.
