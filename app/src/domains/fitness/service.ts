/**
 * Reading Fitness data access (D-062): Sandglass session rows, the
 * library-wide entry stream the activity model reduces, and the companion
 * engagement days that power "Reading Current" streak freezes. All reads
 * are RLS-scoped to the signed-in reader.
 */

import { requireUserId } from '@/domains/auth/service';
import type { ActivityEntry } from '@/domains/fitness/activity';
import { dayKeyFromIso, shiftDayKey, dayKey } from '@/domains/fitness/days';
import { ENGAGEMENT_EVENT_NAMES, collectEngagementDays } from '@/domains/fitness/streaks';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type ReadingSession = Tables<'reading_sessions'>;

/** Enough history for the 1Y fitness chart at personal-library scale. */
const HISTORY_DAYS = 400;
const SESSION_LIMIT = 2000;
const ENTRY_LIMIT = 5000;
const EVENT_LIMIT = 5000;

function historyStartIso(): string {
  const start = shiftDayKey(dayKey(new Date()), -HISTORY_DAYS);
  return new Date(`${start}T00:00:00`).toISOString();
}

export async function listReadingSessions(): Promise<ReadingSession[]> {
  const { data, error } = await supabase
    .from('reading_sessions')
    .select('*')
    .gte('started_at', historyStartIso())
    .order('started_at', { ascending: false })
    .limit(SESSION_LIMIT);
  if (error) {
    throw error;
  }
  return data ?? [];
}

/** Minimal entry rows across the whole library for the activity model. */
export async function listActivityEntries(): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('topic_id, text, created_at, reflection')
    .gte('created_at', historyStartIso())
    .order('created_at', { ascending: false })
    .limit(ENTRY_LIMIT);
  if (error) {
    throw error;
  }
  return data ?? [];
}

export interface EngagementDays {
  all: Set<string>;
  byBook: Map<number, Set<string>>;
}

/** Days the reader engaged with the companion (overall and per book). */
export async function listEngagementDays(): Promise<EngagementDays> {
  const { data, error } = await supabase
    .from('analytics_events')
    .select('created_at, topic_id')
    .in('event_name', [...ENGAGEMENT_EVENT_NAMES])
    .gte('created_at', historyStartIso())
    .order('created_at', { ascending: false })
    .limit(EVENT_LIMIT);
  if (error) {
    throw error;
  }
  return collectEngagementDays(data ?? [], dayKeyFromIso);
}

export interface NewReadingSessionInput {
  bookId: number;
  startedAt: Date;
  endedAt: Date;
  plannedSeconds: number | null;
  startPage: number | null;
  endPage: number | null;
}

export async function createReadingSession(input: NewReadingSessionInput): Promise<ReadingSession> {
  const durationSeconds = Math.max(
    1,
    Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 1000),
  );
  const startPage = normalizePage(input.startPage);
  const endPage = normalizePage(input.endPage);
  if (startPage !== null && endPage !== null && endPage < startPage) {
    throw new Error('The page you finished on must be at or after the page you started on.');
  }
  const pagesRead = startPage !== null && endPage !== null ? endPage - startPage : null;
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('reading_sessions')
    .insert({
      user_id: userId,
      topic_id: input.bookId,
      started_at: input.startedAt.toISOString(),
      ended_at: input.endedAt.toISOString(),
      duration_seconds: durationSeconds,
      planned_seconds: input.plannedSeconds,
      start_page: startPage,
      end_page: endPage,
      pages_read: pagesRead,
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  trackAnalyticsEvent(
    'reading_session_completed',
    {
      durationSeconds,
      plannedSeconds: input.plannedSeconds,
      pagesRead,
      completedPlan:
        input.plannedSeconds !== null ? durationSeconds >= input.plannedSeconds : null,
    },
    input.bookId,
  );
  return data;
}

function normalizePage(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}
