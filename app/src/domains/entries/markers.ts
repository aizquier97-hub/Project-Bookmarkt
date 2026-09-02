/**
 * Entry kind markers (D-039 free-tier feeders): Quote Logs and manual
 * important-event flags. Encoded as a bracketed machine line at the top of
 * the entry body — the same convention as the "[Manual Entry - page 12]"
 * header — so no schema change is needed and every existing client simply
 * shows the line. Free capture: these are never paywalled (D-012).
 */

export type EntryKind = 'note' | 'quote' | 'important';

const MARKERS: Record<Exclude<EntryKind, 'note'>, string> = {
  quote: '[Quote]',
  important: '[Important]',
};

/** Prepend the marker line for the chosen kind; notes pass through. */
export function encodeEntryBody(kind: EntryKind, body: string): string {
  if (kind === 'quote' || kind === 'important') {
    return `${MARKERS[kind]}\n${body}`;
  }
  return body;
}

/**
 * Flag a full stored entry text (header line included) as an important
 * moment. Used when the reader confirms an AI-suggested flag — the reader
 * decides; this only inserts the same marker the composer writes.
 * Already-marked entries are returned unchanged.
 */
export function flagEntryTextImportant(text: string): string {
  const value = String(text ?? '');
  const lines = value.split('\n');
  const hasHeader = /^\[manual entry\b[^\]]*\]$/i.test((lines[0] ?? '').trim());
  const body = hasHeader ? lines.slice(1).join('\n') : value;
  if (parseEntryKind(body).kind !== 'note') {
    return value;
  }
  return hasHeader
    ? `${lines[0]}\n${MARKERS.important}\n${body}`
    : `${MARKERS.important}\n${value}`;
}
export function parseEntryKind(body: string | null | undefined): {
  kind: EntryKind;
  body: string;
} {
  const value = String(body ?? '');
  const newlineIndex = value.indexOf('\n');
  const firstLine = (newlineIndex === -1 ? value : value.slice(0, newlineIndex)).trim();
  for (const [kind, marker] of Object.entries(MARKERS) as [Exclude<EntryKind, 'note'>, string][]) {
    if (firstLine.toLowerCase() === marker.toLowerCase()) {
      return {
        kind,
        body: newlineIndex === -1 ? '' : value.slice(newlineIndex + 1).trim(),
      };
    }
  }
  return { kind: 'note', body: value.trim() };
}
