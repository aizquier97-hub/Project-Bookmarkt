// Frictionless character capture (D-045): name suggestions mined from the
// reader's own entries, reading-position stamps, and order-of-appearance
// sorting. Pure module - no Supabase or React dependencies.

import { parseCharacterDescription } from '@/domains/characters/encoding';
import type { ProgressBoundary, ProgressType } from '@/domains/entries/progress';

const SUGGESTION_LIMIT = 6;

// Common capitalized English words that are never character names. Keeps the
// suggestion chips from echoing sentence starters back at the reader.
const STOPWORDS = new Set(
  (
    'the a an i he she it they we you my his her their our its this that these those there ' +
    'then when while after before but and or so as at in on of to from with for not no yes ' +
    'what who why how just now today finally meanwhile however also maybe perhaps once one ' +
    'two three first second last next new old every some all both even still since because ' +
    'though although until during later earlier suddenly end chapter page book part volume ' +
    'mr mrs ms dr if is was were be been am are had has have do does did will would could ' +
    'should may might must about into over under again very really'
  ).split(' '),
);

const CAPITALIZED = /^[A-Z][a-z'’-]+$/;

function stripPunctuation(token: string): string {
  return token.replace(/^[^A-Za-z@]+/, '').replace(/[^A-Za-z'’-]+$/, '');
}

function isNameWord(token: string): boolean {
  return (
    token.length >= 2 && CAPITALIZED.test(token) && !STOPWORDS.has(token.toLowerCase())
  );
}

/**
 * Mines likely character names from entry bodies: runs of 1-3 capitalized
 * words, ranked by how often they appear. A word capitalized only because it
 * starts a sentence is dropped from the front of a run unless it also shows
 * up capitalized mid-sentence; single sentence-start words need a repeat
 * sighting. Words that appear lowercase elsewhere are dropped, and anything
 * overlapping an existing character's name is excluded. Explicit @mentions
 * that match no existing character rank first - the reader already asked
 * for those.
 */
export function suggestCharacterNames(
  entryBodies: string[],
  existingNames: string[],
): string[] {
  const existingTokens = new Set<string>();
  for (const name of existingNames) {
    for (const token of name.toLowerCase().split(/\s+/)) {
      if (token) {
        existingTokens.add(token);
      }
    }
  }
  const overlapsExisting = (candidate: string) =>
    candidate
      .toLowerCase()
      .split(/\s+/)
      .some((token) => existingTokens.has(token));

  const lowercaseSeen = new Set<string>();
  for (const body of entryBodies) {
    for (const raw of body.split(/\s+/)) {
      const token = stripPunctuation(raw);
      if (token && /^[a-z]/.test(token)) {
        lowercaseSeen.add(token.toLowerCase());
      }
    }
  }

  // Pass 1: which capitalized words appear mid-sentence? Those are
  // capitalized by choice, not grammar - the real name signal.
  const capMid = new Set<string>();
  for (const body of entryBodies) {
    for (const sentence of body.split(/[.!?\n]+/)) {
      let position = 0;
      for (const raw of sentence.split(/\s+/).filter(Boolean)) {
        const token = stripPunctuation(raw);
        if (!token) {
          continue;
        }
        if (position > 0 && isNameWord(token)) {
          capMid.add(token.toLowerCase());
        }
        position += 1;
      }
    }
  }

  const counts = new Map<string, number>();
  const mentionCandidates = new Map<string, number>();

  for (const body of entryBodies) {
    // Explicit @mentions are the strongest signal.
    const mentionPattern = /(^|\s)@([A-Z][a-z'’-]+(?: [A-Z][a-z'’-]+){0,2})/g;
    let mention = mentionPattern.exec(body);
    while (mention) {
      const name = mention[2];
      if (!overlapsExisting(name)) {
        mentionCandidates.set(name, (mentionCandidates.get(name) ?? 0) + 1);
      }
      mention = mentionPattern.exec(body);
    }

    // Pass 2: collect capitalized runs. Trailing commas and the like end a
    // run so "Charlie, Delta" never fuses into one candidate.
    for (const sentence of body.split(/[.!?\n]+/)) {
      let run: string[] = [];
      let runStartsSentence = false;
      const flush = () => {
        if (!run.length) {
          return;
        }
        let words = run.slice(0, 3);
        if (
          runStartsSentence &&
          words.length > 1 &&
          !capMid.has(words[0].toLowerCase())
        ) {
          words = words.slice(1);
        }
        const candidate = words.join(' ');
        counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
        run = [];
      };
      let position = 0;
      for (const raw of sentence.split(/\s+/).filter(Boolean)) {
        const token = stripPunctuation(raw);
        if (!token) {
          flush();
          continue;
        }
        if (isNameWord(token) && !lowercaseSeen.has(token.toLowerCase())) {
          if (!run.length) {
            runStartsSentence = position === 0;
          }
          run.push(token);
          if (/[,;:)]$/.test(raw)) {
            flush();
          }
        } else {
          flush();
        }
        position += 1;
      }
      flush();
    }
  }

  const ranked: { name: string; count: number; fromMention: boolean }[] = [];
  for (const [name, count] of mentionCandidates) {
    ranked.push({ name, count, fromMention: true });
  }
  for (const [name, count] of counts) {
    if (overlapsExisting(name)) {
      continue;
    }
    if (mentionCandidates.has(name)) {
      continue;
    }
    const words = name.split(' ');
    // A word only ever capitalized at sentence starts needs a repeat sighting.
    if (words.length === 1 && !capMid.has(name.toLowerCase()) && count < 2) {
      continue;
    }
    ranked.push({ name, count, fromMention: false });
  }
  ranked.sort((a, b) => {
    if (a.fromMention !== b.fromMention) {
      return a.fromMention ? -1 : 1;
    }
    return b.count - a.count || a.name.localeCompare(b.name);
  });
  return ranked.slice(0, SUGGESTION_LIMIT).map((entry) => entry.name);
}

/** "page 124" stamp text for the reader's current position ('' when unknown). */
export function formatFirstNoted(position: ProgressBoundary | null): string {
  return position ? `${position.progressType} ${position.upper}` : '';
}

/** "Page 124" display label for a stored stamp (null when absent/unparseable). */
export function formatFirstNotedLabel(firstNoted: string | undefined): string | null {
  const parsed = parseFirstNoted(firstNoted);
  if (!parsed) {
    return null;
  }
  const type = parsed.progressType === 'chapter' ? 'Chapter' : 'Page';
  return `${type} ${parsed.value}`;
}

export function parseFirstNoted(
  firstNoted: string | undefined,
): { progressType: ProgressType; value: number } | null {
  const match = String(firstNoted ?? '')
    .trim()
    .match(/^(page|chapter)\s+(\d+)$/i);
  if (!match) {
    return null;
  }
  return {
    progressType: match[1].toLowerCase() === 'chapter' ? 'chapter' : 'page',
    value: Number(match[2]),
  };
}

/**
 * Order of appearance: characters stamped with the same progress type sort by
 * that number; everything else keeps its incoming (created_at) order, with
 * unstamped characters after stamped ones.
 */
export function sortCharactersByAppearance<
  T extends { description: string | null },
>(characters: T[]): T[] {
  const decorated = characters.map((character, index) => ({
    character,
    index,
    stamp: parseFirstNoted(parseCharacterDescription(character.description).firstNoted),
  }));
  decorated.sort((a, b) => {
    if (a.stamp && b.stamp) {
      if (a.stamp.progressType === b.stamp.progressType) {
        return a.stamp.value - b.stamp.value || a.index - b.index;
      }
      return a.index - b.index;
    }
    if (a.stamp !== b.stamp) {
      return a.stamp ? -1 : 1;
    }
    return a.index - b.index;
  });
  return decorated.map((entry) => entry.character);
}
