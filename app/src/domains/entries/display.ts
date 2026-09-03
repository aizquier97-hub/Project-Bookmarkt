import { parseEntryKind } from '@/domains/entries/markers';
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

export interface BookmarkRibbonLabel {
  /** The one line shown on the ribbon. */
  text: string;
  /** True when the line is a companion summary, false for a raw excerpt. */
  fromCompanion: boolean;
}

/**
 * The one-line label for an entry's bookmark ribbon (Interface v2.0): the
 * companion's cached summary when present, otherwise the reader's own first
 * words trimmed to a word boundary. Display-only.
 */
export function buildBookmarkLabel(
  entry: { text: string | null; ai_summary?: string | null },
  maxChars = 96,
): BookmarkRibbonLabel {
  const summary = String(entry.ai_summary ?? '').trim();
  if (summary) {
    return { text: summary, fromCompanion: true };
  }
  const { body } = splitEntryText(entry.text);
  const plain = parseEntryKind(body).body.replace(/\s+/g, ' ').trim();
  if (plain.length <= maxChars) {
    return { text: plain, fromCompanion: false };
  }
  const slice = plain.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxChars / 2 ? slice.slice(0, lastSpace) : slice;
  return { text: `${cut.trimEnd()}…`, fromCompanion: false };
}

/**
 * The caption under a bookmark ribbon: "Page 187-192, Thursday Aug 20".
 * Position first (when the entry carries one), then the day it was written.
 */
export function formatBookmarkCaption(
  entry: { text: string | null; created_at: string | null },
): string {
  const { boundaryLabel } = splitEntryText(entry.text);
  const parts: string[] = [];
  if (boundaryLabel) {
    parts.push(boundaryLabel);
  }
  if (entry.created_at) {
    const day = new Date(entry.created_at);
    if (!Number.isNaN(day.getTime())) {
      parts.push(
        day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      );
    }
  }
  return parts.join(', ');
}

/** djb2 - must mirror the companion Edge Function's hashContent exactly. */
function hashEntryText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `djb2:${(hash >>> 0).toString(16)}:${text.length}`;
}

/**
 * True when an entry's cached companion summary is missing or was computed
 * from older text. Client-side twin of the server's staleness check, so the
 * book screen only spends a companion call when something actually changed.
 */
export function entrySummaryIsStale(entry: {
  text: string | null;
  ai_summary?: string | null;
  ai_summary_hash?: string | null;
}): boolean {
  const text = String(entry.text ?? '');
  if (!text.trim()) {
    return false;
  }
  if (!String(entry.ai_summary ?? '').trim()) {
    return true;
  }
  return entry.ai_summary_hash !== hashEntryText(text);
}
