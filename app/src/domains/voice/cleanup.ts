// Voice transcript cleanup (D-016): adjustments are limited to punctuation,
// casing, and whitespace. Words are never added, removed, or changed — the
// verbatim raw transcript is stored beside the cleaned text.

export function cleanupTranscript(raw: string): string {
  const collapsed = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) {
    return '';
  }
  let result = '';
  let capitalizeNext = true;
  for (const char of collapsed) {
    if (capitalizeNext && /[\p{L}\p{N}]/u.test(char)) {
      result += /\p{L}/u.test(char) ? char.toUpperCase() : char;
      capitalizeNext = false;
    } else {
      result += char;
      if (/[.!?]/.test(char)) {
        capitalizeNext = true;
      }
    }
  }
  if (!/[.!?…]$/.test(result)) {
    result += '.';
  }
  return result;
}

function normalizeWords(value: string): string[] {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** True when cleanup preserved the exact word sequence (the D-016 invariant). */
export function wordsMatchVerbatim(raw: string, cleaned: string): boolean {
  const rawWords = normalizeWords(raw);
  const cleanedWords = normalizeWords(cleaned);
  return (
    rawWords.length === cleanedWords.length &&
    rawWords.every((word, index) => word === cleanedWords[index])
  );
}
