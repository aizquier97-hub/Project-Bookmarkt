/**
 * Favorite Quotes (D-062): the Quotes tab's view over "[Quote]" entries
 * across every book, plus the reader's favorites and reflections. Quote
 * text is never rewritten; favorites and reflections live in their own
 * columns so the stored entry stays byte-compatible with every client.
 */

import { requireUserId } from '@/domains/auth/service';
import { splitEntryText } from '@/domains/entries/display';
import { parseEntryKind } from '@/domains/entries/markers';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { supabase } from '@/lib/supabase';

export interface QuoteRow {
  id: number;
  topic_id: number | null;
  text: string;
  created_at: string | null;
  is_favorite: boolean;
  reflection: string | null;
}

export interface Quote {
  entryId: number;
  bookId: number | null;
  /** The quoted passage itself. */
  body: string;
  /** "Page 12-15" when the entry carried a position. */
  boundaryLabel: string | null;
  createdAt: string | null;
  isFavorite: boolean;
  reflection: string | null;
}

/** Null when the row is not a quote log. */
export function toQuote(row: QuoteRow): Quote | null {
  const { boundaryLabel, body } = splitEntryText(row.text);
  const parsed = parseEntryKind(body);
  if (parsed.kind !== 'quote' || !parsed.body.trim()) {
    return null;
  }
  return {
    entryId: row.id,
    bookId: row.topic_id,
    body: parsed.body,
    boundaryLabel,
    createdAt: row.created_at,
    isFavorite: Boolean(row.is_favorite),
    reflection: row.reflection?.trim() ? row.reflection : null,
  };
}

export function extractQuotes(rows: readonly QuoteRow[]): Quote[] {
  const quotes: Quote[] = [];
  for (const row of rows) {
    const quote = toQuote(row);
    if (quote) {
      quotes.push(quote);
    }
  }
  return quotes;
}

const QUOTE_LIMIT = 1000;

/** Newest-first quote logs across the library. */
export async function listQuotes(): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('id, topic_id, text, created_at, is_favorite, reflection')
    .ilike('text', '%[Quote]%')
    .order('created_at', { ascending: false })
    .limit(QUOTE_LIMIT);
  if (error) {
    throw error;
  }
  return extractQuotes(data ?? []);
}

export async function setQuoteFavorite(entryId: number, isFavorite: boolean): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('entries')
    .update({ is_favorite: isFavorite })
    .eq('id', entryId)
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
  if (isFavorite) {
    trackAnalyticsEvent('quote_favorited', { entryId });
  }
}

export async function saveQuoteReflection(entryId: number, reflection: string): Promise<void> {
  const trimmed = reflection.trim();
  const userId = await requireUserId();
  const { error } = await supabase
    .from('entries')
    .update({ reflection: trimmed || null })
    .eq('id', entryId)
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
  if (trimmed) {
    trackAnalyticsEvent('quote_reflection_saved', { entryId, words: trimmed.split(/\s+/).length });
  }
}
