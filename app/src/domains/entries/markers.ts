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
 * Split a header-stripped entry body into its kind and the reader's words.
 * Unmarked bodies (all pre-existing entries) are plain notes.
 */
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
