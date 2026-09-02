import { requireUserId } from '@/domains/auth/service';
import { encodeEntryBody, type EntryKind } from '@/domains/entries/markers';
import {
  buildProgressRangeLabel,
  getLatestProgressBoundary,
  normalizeProgressNumber,
  type ProgressType,
} from '@/domains/entries/progress';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import type { Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type Entry = Tables<'entries'>;

export interface NewEntryInput {
  text: string;
  progressType: ProgressType;
  progressValue: string | number;
  /** Verbatim dictation transcript (D-016); stored beside the cleaned text. */
  rawTranscript?: string | null;
  /** Quote Log / important-event flag (D-039); plain note when omitted. */
  kind?: EntryKind;
}

export async function listEntries(bookId: number): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('topic_id', bookId)
    .order('created_at', { ascending: false });
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Minimal newest-first rows across every book the user owns (RLS-scoped),
 * for the shelf's per-book position summaries. 500 rows comfortably covers
 * the recent horizon at personal-library scale.
 */
export async function listEntrySummaryRows(): Promise<
  Pick<Entry, 'topic_id' | 'text' | 'created_at'>[]
> {
  const { data, error } = await supabase
    .from('entries')
    .select('topic_id, text, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function addEntry(bookId: number, input: NewEntryInput): Promise<Entry> {
  const trimmed = input.text.trim();
  if (!trimmed) {
    throw new Error('Entry text is required.');
  }
  const progressValue = normalizeProgressNumber(input.progressValue);
  if (!progressValue) {
    throw new Error(
      `Current ${input.progressType} is required and must be a positive number.`,
    );
  }
  const existing = await listEntries(bookId);
  const latestBoundary = getLatestProgressBoundary(existing, input.progressType);
  const lowerBoundary = latestBoundary ? latestBoundary.upper : null;
  if (lowerBoundary !== null && progressValue < lowerBoundary) {
    throw new Error(`Current ${input.progressType} must be ${lowerBoundary} or greater.`);
  }
  const rangeLabel =
    lowerBoundary !== null && progressValue === lowerBoundary
      ? `${input.progressType} ${progressValue}`
      : buildProgressRangeLabel(input.progressType, lowerBoundary, progressValue);
  const userId = await requireUserId();
  const rawTranscript = input.rawTranscript?.trim() || null;
  const kind: EntryKind = input.kind ?? 'note';
  const { data, error } = await supabase
    .from('entries')
    .insert({
      text: `[Manual Entry - ${rangeLabel}]\n${encodeEntryBody(kind, trimmed)}`,
      topic_id: bookId,
      user_id: userId,
      raw_transcript: rawTranscript,
    })
    .select()
    .single();
  if (error) {
    throw error;
  }
  // PWA parity: same event name and property shape (captureMethod is additive).
  trackAnalyticsEvent(
    'manual_entry_added',
    {
      boundary: rangeLabel,
      progressType: input.progressType,
      progressValue,
      captureMethod: rawTranscript ? 'voice' : 'typed',
      kind,
    },
    bookId,
  );
  return data;
}

export async function updateEntry(entryId: number, bookId: number, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Entry text cannot be empty.');
  }
  const userId = await requireUserId();
  const { error } = await supabase
    .from('entries')
    .update({ text: trimmed, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('user_id', userId)
    .eq('topic_id', bookId);
  if (error) {
    throw error;
  }
}

export async function deleteEntry(entryId: number, bookId: number): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)
    .eq('topic_id', bookId);
  if (error) {
    throw error;
  }
}
