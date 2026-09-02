// Inline @-mentions of characters inside entries (D-045). Mentions are
// stored as plain text ("@Frodo Baggins") so entry rows need no schema
// change; display-time matching against the book's character names turns
// them into tappable links. Pure module.

const ACTIVE_MENTION = /(^|[\s([{"'])@([A-Za-z0-9'’-]*(?: [A-Za-z0-9'’-]*)?)$/;

/**
 * The @query currently being typed at the end of the composer text, or null
 * when the text does not end in an open mention. Allows one internal space
 * so "first last" names stay suggestible.
 */
export function findActiveMentionQuery(text: string): string | null {
  const match = text.match(ACTIVE_MENTION);
  return match ? match[2] : null;
}

/** Replaces the open mention at the end of the text with "@Name " (completed). */
export function applyMentionToText(text: string, name: string): string {
  const match = text.match(ACTIVE_MENTION);
  if (!match || match.index === undefined) {
    return text;
  }
  const start = match.index + match[1].length;
  return `${text.slice(0, start)}@${name} `;
}

/** Character names matching an in-progress mention query (prefix on any word). */
export function filterNamesForMention(names: string[], query: string, limit = 5): string[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return names.slice(0, limit);
  }
  return names
    .filter((name) => {
      const lower = name.toLowerCase();
      return lower.startsWith(q) || lower.split(/\s+/).some((word) => word.startsWith(q));
    })
    .slice(0, limit);
}

export interface MentionSegment {
  text: string;
  /** The matched character's name, or null for plain text. */
  characterName: string | null;
}

/**
 * Splits entry text into plain segments and @mentions that match a known
 * character name (longest name wins, case-insensitive, word-boundary after).
 * Unmatched @tokens stay plain text.
 */
export function splitTextForMentions(text: string, names: string[]): MentionSegment[] {
  if (!text || !names.length) {
    return [{ text, characterName: null }];
  }
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  const lowerText = text.toLowerCase();
  const segments: MentionSegment[] = [];
  let cursor = 0;
  let at = text.indexOf('@', cursor);
  while (at !== -1) {
    const before = at === 0 ? '' : text[at - 1];
    const boundaryBefore = at === 0 || /[\s([{"']/.test(before);
    let matched: string | null = null;
    if (boundaryBefore) {
      for (const name of sorted) {
        const candidate = lowerText.slice(at + 1, at + 1 + name.length);
        if (candidate === name.toLowerCase()) {
          const after = text[at + 1 + name.length];
          if (after === undefined || !/[A-Za-z0-9]/.test(after)) {
            matched = name;
            break;
          }
        }
      }
    }
    if (matched) {
      if (at > cursor) {
        segments.push({ text: text.slice(cursor, at), characterName: null });
      }
      segments.push({ text: text.slice(at, at + 1 + matched.length), characterName: matched });
      cursor = at + 1 + matched.length;
    }
    at = text.indexOf('@', Math.max(cursor, at + 1));
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), characterName: null });
  }
  return segments.length ? segments : [{ text, characterName: null }];
}
