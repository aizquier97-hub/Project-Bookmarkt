-- D-094: automatic "story thus far" recap (premium). The book hub shows a
-- brief AI recap of the reader's last three notes without asking for a
-- range or a detail level: one short sentence per note, at most ~60 words,
-- plain enough to skim before a sitting. The companion Edge Function's new
-- 'story_recap' feature writes the recap to the topic row, keyed by a hash
-- of the three notes it read, so an unchanged book costs no quota and no
-- provider call on later visits. Rows are written under the owner's JWT
-- (RLS unchanged); free readers keep the Book Club lock card.
--
-- Also widens the feature allowlists (usage-event CHECK and the quota RPC
-- guard). companion_messages is untouched: the recap is not a message.

alter table public.topics
  add column if not exists story_recap text
    check (story_recap is null or char_length(story_recap) <= 600),
  add column if not exists story_recap_range text
    check (story_recap_range is null or char_length(story_recap_range) <= 40),
  add column if not exists story_recap_hash text
    check (story_recap_hash is null or char_length(story_recap_hash) <= 64),
  add column if not exists story_recap_at timestamptz;

comment on column public.topics.story_recap is
  'D-094: brief companion recap of the last three notes, shown at the top of the book hub.';
comment on column public.topics.story_recap_range is
  'D-094: position span of the notes recapped, e.g. "pp. 203-269" or "ch. 3-5"; null when the notes carry no position.';
comment on column public.topics.story_recap_hash is
  'D-094: djb2 hash of the three notes recapped; a mismatch means the recap is stale.';
comment on column public.topics.story_recap_at is
  'D-094: when the recap was written.';
-- Usage-event audit rows: accept the new feature.
alter table public.companion_usage_events
  drop constraint if exists companion_usage_events_feature_check;
alter table public.companion_usage_events
  add constraint companion_usage_events_feature_check check (feature in (
    'dialogue', 'recap', 'quiz', 'cue_cards', 'club_prep', 'word_bank',
    'structuring', 'event_flags', 'search',
    'structure_aid', 'suggest_flags', 'semantic_search', 'entry_summaries',
    'observations', 'observation_open', 'insight', 'comprehension',
    'character_extract', 'story_recap'
  ));

-- Quota RPC: widened allowlist; body otherwise unchanged from
-- 20261010120000.
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
    'character_extract', 'story_recap'
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
