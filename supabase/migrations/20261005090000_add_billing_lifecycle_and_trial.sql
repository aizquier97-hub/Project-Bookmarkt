-- Stage 4 Phase 3/4 (STAGE_4_BUILD_PLAN.md, D-068): subscription lifecycle
-- state, a billing-event ledger for idempotency and reconciliation, and the
-- server-authorized companion trial (roadmap section 13: time-bound, once
-- per account, begins only after the qualifying number of entries exists).
-- Additive and defaulted - older clients keep selecting the old columns.

-- 1. Lifecycle columns on the entitlement row. The webhook writes them;
-- the client only renders them (D-047). `will_renew` false means the
-- reader turned auto-renew off: access runs to `current_period_end`.
alter table public.companion_entitlements
  add column if not exists will_renew boolean not null default true,
  add column if not exists billing_issue_detected_at timestamptz,
  add column if not exists grace_period_expires_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists expiration_reason text,
  add column if not exists period_type text,
  add column if not exists product_id text,
  add column if not exists store_environment text,
  add column if not exists last_event_at timestamptz;

comment on column public.companion_entitlements.will_renew is
  'False after a store CANCELLATION (auto-renew off); access still runs to current_period_end.';
comment on column public.companion_entitlements.grace_period_expires_at is
  'Store grace period end after a failed charge (BILLING_ISSUE); access continues until then.';
comment on column public.companion_entitlements.last_event_at is
  'RevenueCat event_timestamp_ms of the last applied event; older events are ignored (ordering guard).';

-- 2. Billing-event ledger: one row per RevenueCat delivery, keyed by the
-- RevenueCat event id so a retried delivery is a primary-key conflict
-- (idempotency) and support can reconstruct what the store told us
-- (reconciliation). Never stores prices, currency, or subscriber
-- attributes - subscription analytics without payment details.
create table if not exists public.companion_billing_events (
  event_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_at timestamptz not null,
  store text,
  environment text,
  product_id text,
  period_type text,
  cancel_reason text,
  expiration_reason text,
  expiration_at timestamptz,
  applied boolean not null default false,
  skip_reason text,
  received_at timestamptz not null default now()
);

create index if not exists idx_companion_billing_events_user_at
on public.companion_billing_events (user_id, event_at desc);

alter table public.companion_billing_events enable row level security;

revoke all on table public.companion_billing_events from anon, authenticated;
grant all on table public.companion_billing_events to service_role;

-- 3. Trial policy: a single service-role-owned row so the owner can tune
-- the trial length and the qualifying-entry count from the dashboard once
-- the financial model lands (the defaults below are placeholders).
create table if not exists public.companion_trial_policy (
  id smallint primary key default 1 check (id = 1),
  trial_days integer not null default 7 check (trial_days between 1 and 90),
  qualifying_entries integer not null default 5 check (qualifying_entries between 0 and 1000),
  updated_at timestamptz not null default now()
);

alter table public.companion_trial_policy enable row level security;

revoke all on table public.companion_trial_policy from anon, authenticated;
grant all on table public.companion_trial_policy to service_role;

insert into public.companion_trial_policy (id)
values (1)
on conflict (id) do nothing;

-- 4. Trial eligibility (read-only). The client renders the offer from this
-- answer; the decision itself is re-made by start_companion_trial.
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

  return query select true, 'eligible'::text, v_entries, v_policy.qualifying_entries, v_policy.trial_days;
end;
$$;

revoke all on function public.companion_trial_eligibility() from public, anon;
grant execute on function public.companion_trial_eligibility() to authenticated, service_role;

-- 5. Start the trial. Re-checks eligibility under a per-user advisory lock
-- (two taps cannot start two trials), then writes status trial / source
-- trial with trial_started_at set - the once-per-account marker the
-- webhook never clears.
create or replace function public.start_companion_trial()
returns table (
  started boolean,
  reason text,
  status text,
  trial_expires_at timestamptz,
  entries_logged integer,
  entries_required integer,
  trial_days integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_elig record;
  v_expires timestamptz;
  v_now timestamptz := now();
begin
  if v_user is null then
    raise exception 'Authenticated user is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('companion-trial:' || v_user::text, 0));

  select * into v_elig from public.companion_trial_eligibility();
  if not v_elig.eligible then
    return query
      select false, v_elig.reason, coalesce(ce.status, 'none'), ce.trial_expires_at,
             v_elig.entries_logged, v_elig.entries_required, v_elig.trial_days
      from (select 1) as one
      left join public.companion_entitlements ce on ce.user_id = v_user;
    return;
  end if;

  v_expires := v_now + make_interval(days => v_elig.trial_days);

  insert into public.companion_entitlements (
    user_id, status, source, trial_started_at, trial_expires_at, created_at, updated_at
  )
  values (v_user, 'trial', 'trial', v_now, v_expires, v_now, v_now)
  on conflict (user_id) do update
    set status = 'trial',
        source = 'trial',
        trial_started_at = excluded.trial_started_at,
        trial_expires_at = excluded.trial_expires_at,
        updated_at = excluded.updated_at;

  return query
    select true, 'started'::text, 'trial'::text, v_expires,
           v_elig.entries_logged, v_elig.entries_required, v_elig.trial_days;
end;
$$;

revoke all on function public.start_companion_trial() from public, anon;
grant execute on function public.start_companion_trial() to authenticated, service_role;
