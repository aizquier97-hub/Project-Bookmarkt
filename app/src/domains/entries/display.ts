import {
  parseProgressBoundaryFromEntryText,
  type ProgressBoundary,
} from '@/domains/entries/progress';

export interface EntryDisplayParts {
  /** Human boundary label ("Page 12-15"), or null when the entry has no header. */
  boundaryLabel: string | null;
  /** The reader's own words, with the machine header line removed. */
  body: string;
}

const HEADER_PATTERN = /^\[Manual Entry - ([^\]]+)\]\s*$/i;

/**
 * Splits the stored entry text into its machine header and the reader's words.
 * Entry rows are stored as "[Manual Entry - page 12-15]\n<body>" (PWA-parity
 * format); entries without that header (edited or legacy rows) pass through
 * unchanged. Display-only: stored text is never modified.
 */
export function splitEntryText(text: string | null | undefined): EntryDisplayParts {
  const value = String(text ?? '');
  const newlineIndex = value.indexOf('\n');
  const firstLine = newlineIndex === -1 ? value : value.slice(0, newlineIndex);
  const match = firstLine.match(HEADER_PATTERN);
  if (!match) {
    return { boundaryLabel: null, body: value.trim() };
  }
  const label = match[1].trim();
  const body = newlineIndex === -1 ? '' : value.slice(newlineIndex + 1).trim();
  return {
    boundaryLabel: label.charAt(0).toUpperCase() + label.slice(1),
    body,
  };
}

/** "Page 124" / "Chapter 7" for a parsed boundary. */
export function formatBoundaryPosition(boundary: ProgressBoundary): string {
  const type = boundary.progressType === 'chapter' ? 'Chapter' : 'Page';
  return `${type} ${boundary.upper}`;
}

export interface HighlightSegment {
  text: string;
  /** True when this segment matches the search query (case-insensitive). */
  match: boolean;
}

/**
 * Splits text into plain and matching segments for search-hit highlighting
 * (every editor and journal app marks the hit itself, not just the row).
 * Case-insensitive, matches every occurrence, display-only. An empty query
 * returns the whole text as one plain segment.
 */
export function splitTextForHighlight(text: string, query: string): HighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (!text || !needle) {
    return [{ text, match: false }];
  }
  const haystack = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  let hit = haystack.indexOf(needle, cursor);
  while (hit !== -1) {
    if (hit > cursor) {
      segments.push({ text: text.slice(cursor, hit), match: false });
    }
    segments.push({ text: text.slice(hit, hit + needle.length), match: true });
    cursor = hit + needle.length;
    hit = haystack.indexOf(needle, cursor);
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}

/**
 * The reader's most recent position across both progress types: the first
 * entry (list is newest-first) whose text carries a parseable boundary.
 */
export function getCurrentPosition(
  entries: { text: string | null }[],
): ProgressBoundary | null {
  for (const entry of entries) {
    const parsed = parseProgressBoundaryFromEntryText(entry?.text);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export interface EntrySummaryRow {
  topic_id: number | null;
  text: string | null;
  created_at: string | null;
}

export interface BookPositionSummary {
  /** ISO timestamp of the newest entry for the book. */
  lastEntryAt: string | null;
  /** Newest parseable position for the book, if any entry carries one. */
  position: ProgressBoundary | null;
}

/**
 * Reduces a newest-first stream of minimal entry rows to one summary per
 * book: when it was last touched and where the reader is. Powers the shelf's
 * multi-book re-entry cues (J4).
 */
export function summarizeEntriesByBook(
  rows: EntrySummaryRow[],
): Map<number, BookPositionSummary> {
  const map = new Map<number, BookPositionSummary>();
  for (const row of rows) {
    const bookId = row.topic_id;
    if (typeof bookId !== 'number') {
      continue;
    }
    let summary = map.get(bookId);
    if (!summary) {
      summary = { lastEntryAt: row.created_at ?? null, position: null };
      map.set(bookId, summary);
    }
    if (!summary.position) {
      const parsed = parseProgressBoundaryFromEntryText(row.text);
      if (parsed) {
        summary.position = parsed;
      }
    }
  }
  return map;
}
