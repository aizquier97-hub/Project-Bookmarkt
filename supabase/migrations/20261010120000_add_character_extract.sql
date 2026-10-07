-- D-077: character extraction (premium). After a note is saved, the
-- companion reads that one note and proposes characters it mentions - name
-- plus whatever role, description, and relationships the note itself
-- supports - for the reader to accept onto their map. Transient: nothing is
-- persisted to the conversation; only the usage-event audit row is written.
--
-- This migration widens the feature allowlists (usage-event CHECK and the
-- quota RPC guard). companion_messages is untouched: the feature never
-- persists a message.

-- Usage-event audit rows: accept the new feature.
alter table public.companion_usage_events
  drop constraint if exists companion_usage_events_feature_check;
alter table public.companion_usage_events
  add constraint companion_usage_events_feature_check check (feature in (
    'dialogue', 'recap', 'quiz', 'cue_cards', 'club_prep', 'word_bank',
    'structuring', 'event_flags', 'search',
    'structure_aid', 'suggest_flags', 'semantic_search', 'entry_summaries',
    'observations', 'observation_open', 'insight', 'comprehension',
    'character_extract'
  ));

-- Quota RPC: widened allowlist; body otherwise unchanged from
-- 20261004090000.
create or replace function public.consume_companion_quota(
  p_user_id uuid,
  p_feature text,
  p_audit_id text,
  p_topic_id bigint,
  p_user_daily_limit integer,
  p_project_daily_limit integer
)
returns table (
  allowed boolean,
  quota_scope text,
  user_used integer,
  user_remaining integer,
  user_limit integer,
  project_used integer,
  project_remaining integer,
  project_limit integer,
  reset_at timestamptz,
  event_id bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_reset_at timestamptz;
  v_user_limit integer := greatest(1, least(coalesce(p_user_daily_limit, 50), 1000));
  v_project_limit integer := greatest(1, least(coalesce(p_project_daily_limit, 1000), 100000));
  v_user_used integer := 0;
  v_project_used integer := 0;
  v_event_id bigint;
begin
  if p_user_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if p_feature not in (
    'dialogue', 'recap', 'quiz', 'cue_cards', 'club_prep', 'word_bank',
    'structuring', 'event_flags', 'search',
    'structure_aid', 'suggest_flags', 'semantic_search', 'entry_summaries',
    'observations', 'observation_open', 'insight', 'comprehension',
    'character_extract'
  ) then
    raise exception 'Invalid companion feature';
  end if;

  v_reset_at := v_window_start + interval '1 day';

  perform pg_advisory_xact_lock(hashtextextended('companion-project:' || v_window_start::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('companion-user:' || p_user_id::text || ':' || v_window_start::text, 0));

  select count(*)::integer
  into v_project_used
  from public.companion_usage_events
  where started_at >= v_window_start
    and started_at < v_reset_at
    and status in ('started', 'succeeded', 'failed');

  select count(*)::integer
  into v_user_used
  from public.companion_usage_events
  where user_id = p_user_id
    and feature = p_feature
    and started_at >= v_window_start
    and started_at < v_reset_at
    and status in ('started', 'succeeded', 'failed');

  if v_project_used >= v_project_limit then
    insert into public.companion_usage_events (
      user_id, audit_id, feature, status, entitlement_decision, quota_scope,
      topic_id, completed_at, duration_ms, http_status, error_code, error_message
    ) values (
      p_user_id, p_audit_id, p_feature, 'rate_limited', 'denied_quota', 'project',
      p_topic_id, now(), 0, 429, 'COMPANION_PROJECT_DAILY_LIMIT_EXCEEDED',
      'Project daily companion limit reached.'
    ) returning id into v_event_id;

    return query select
      false, 'project'::text, v_user_used, greatest(0, v_user_limit - v_user_used), v_user_limit,
      v_project_used, 0, v_project_limit, v_reset_at, v_event_id;
    return;
  end if;

  if v_user_used >= v_user_limit then
    insert into public.companion_usage_events (
      user_id, audit_id, feature, status, entitlement_decision, quota_scope,
      topic_id, completed_at, duration_ms, http_status, error_code, error_message
    ) values (
      p_user_id, p_audit_id, p_feature, 'rate_limited', 'denied_quota', 'user',
      p_topic_id, now(), 0, 429, 'COMPANION_DAILY_LIMIT_EXCEEDED',
      'User daily companion feature limit reached.'
    ) returning id into v_event_id;

    return query select
      false, 'user'::text, v_user_used, 0, v_user_limit,
      v_project_used, greatest(0, v_project_limit - v_project_used), v_project_limit,
      v_reset_at, v_event_id;
    return;
  end if;

  insert into public.companion_usage_events (
    user_id, audit_id, feature, status, entitlement_decision, quota_scope, topic_id
  )
  values (p_user_id, p_audit_id, p_feature, 'started', 'allowed', 'user', p_topic_id)
  returning id into v_event_id;

  v_user_used := v_user_used + 1;
  v_project_used := v_project_used + 1;

  return query select
    true, 'user'::text, v_user_used, greatest(0, v_user_limit - v_user_used), v_user_limit,
    v_project_used, greatest(0, v_project_limit - v_project_used), v_project_limit,
    v_reset_at, v_event_id;
end;
$$;

revoke all on function public.consume_companion_quota(uuid, text, text, bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_companion_quota(uuid, text, text, bigint, integer, integer) to service_role;
