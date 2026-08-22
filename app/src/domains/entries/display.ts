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
