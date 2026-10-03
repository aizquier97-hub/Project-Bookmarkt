/**
 * Text Difficulty Index (D-062) - a standardized 1-10 rating for every book,
 * computed on-device with no provider call so it is free, instant, and
 * explainable. Full method in docs/READING_METRICS.md.
 *
 *   difficulty = c * measured + (1 - c) * prior
 *
 * - measured: Flesch-Kincaid grade level of the reader's VERBATIM quote
 *   logs for the book (quotes are the book's own prose, so they sample its
 *   real sentence length and word complexity), mapped onto 1-10.
 * - prior: 5.0 adjusted by genre, publication era, and length - the
 *   estimate available the moment a book is added, before any quote exists.
 * - c: confidence in the measurement, 0 until 20 quoted words, 1 at 150.
 * - A reader-set override always wins (the feedback asked for editable
 *   tags); its provenance is shown as "set by you".
 */

export type DifficultySource = 'override' | 'measured' | 'estimated';

export interface DifficultyInput {
  genre: string | null | undefined;
  publicationYear: number | null | undefined;
  totalPages: number | null | undefined;
  /** The reader's verbatim quote bodies for this book (marker lines removed). */
  quoteTexts: readonly string[];
  /** Reader-set 1-10 override; null/undefined falls back to the computation. */
  override?: number | null;
}

export interface DifficultyResult {
  /** 1.0-10.0, one decimal. */
  score: number;
  source: DifficultySource;
  /** Weight placed on the measured text (0-1). */
  confidence: number;
  /** Flesch-Kincaid grade level of the sampled quotes, when any were sampled. */
  textGrade: number | null;
  /** Words of verbatim quote text that fed the measurement. */
  sampledWords: number;
  /** The metadata-only estimate. */
  prior: number;
  label: DifficultyLabel;
}

export type DifficultyLabel = 'Light' | 'Moderate' | 'Demanding' | 'Dense';

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 10;
/** Neutral point: a book at 5.0 carries weight 1.0 in the effort formula. */
export const DIFFICULTY_NEUTRAL = 5;

/** Below this many quoted words the measurement is ignored entirely. */
export const MIN_SAMPLE_WORDS = 20;
/** At this many quoted words the measurement is fully trusted. */
export const FULL_CONFIDENCE_WORDS = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// --- Readability -----------------------------------------------------------

const WORD_PATTERN = /[\p{L}\p{N}'’-]+/gu;

export function countWords(text: string): number {
  return (text.match(WORD_PATTERN) ?? []).length;
}

export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  // Terminal punctuation runs count once; a trailing fragment still counts.
  const terminators = trimmed.match(/[.!?;]+(?=\s|$)/g) ?? [];
  const endsWithTerminator = /[.!?;]["'”’)\]]*$/.test(trimmed);
  return Math.max(1, terminators.length + (endsWithTerminator ? 0 : 1));
}

/**
 * Heuristic English syllable count: vowel groups, minus silent endings.
 * Accurate to within a few percent on running prose, which is all the
 * grade-level formula needs.
 */
export function countSyllables(rawWord: string): number {
  const word = rawWord.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) {
    return 0;
  }
  if (word.length <= 3) {
    return 1;
  }
  const trimmed = word
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

export interface ReadabilitySample {
  words: number;
  sentences: number;
  syllables: number;
  /** Flesch-Kincaid grade level; null when there is no text. */
  grade: number | null;
}

/** Flesch-Kincaid grade level over a text sample. */
export function measureReadability(text: string): ReadabilitySample {
  const words = text.match(WORD_PATTERN) ?? [];
  if (words.length === 0) {
    return { words: 0, sentences: 0, syllables: 0, grade: null };
  }
  const sentences = countSentences(text);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const grade =
    0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return { words: words.length, sentences, syllables, grade };
}

/** Grade 3 reads as 1.0, grade 16 (dense academic prose) as 10.0. */
export function gradeToDifficulty(grade: number): number {
  return clamp(1 + (grade - 3) * (9 / 13), DIFFICULTY_MIN, DIFFICULTY_MAX);
}

// --- Metadata prior --------------------------------------------------------

// Ordered most-specific first; the first matching row wins so "Juvenile
// Fiction" reads as children's, and "Science Fiction" never matches the
// science row.
const GENRE_ADJUSTMENTS: readonly (readonly [readonly string[], number])[] = [
  [['children', 'juvenile', 'picture book', 'early reader'], -2.5],
  [['young adult', 'teen', 'middle grade', 'graphic novel', 'manga', 'comics', 'light novel', 'litrpg'], -1.5],
  [['philosoph', 'theolog', 'metaphysic'], 2.5],
  [['classic', 'poetry', 'poem', 'literary criticism', 'academic', 'scholar', 'textbook'], 2.0],
  [['science fiction', 'sci-fi', 'scifi', 'romance', 'fantasy'], -1.0],
  [['science', 'physics', 'mathemat', 'econom', 'law', 'legal', 'medic', 'history', 'engineering'], 1.5],
  [['literary', 'nonfiction', 'non-fiction', 'essay', 'biograph', 'memoir', 'politic', 'psycholog', 'business'], 1.0],
  [['mystery', 'thriller', 'horror', 'adventure', 'humor', 'humour', 'fiction'], -0.5],
];

export function genreAdjustment(genre: string | null | undefined): number {
  const value = String(genre ?? '').toLowerCase();
  if (!value.trim()) {
    return 0;
  }
  for (const [needles, adjustment] of GENRE_ADJUSTMENTS) {
    if (needles.some((needle) => value.includes(needle))) {
      return adjustment;
    }
  }
  return 0;
}

export function eraAdjustment(publicationYear: number | null | undefined): number {
  if (typeof publicationYear !== 'number' || !Number.isFinite(publicationYear)) {
    return 0;
  }
  if (publicationYear < 1800) {
    return 2.5;
  }
  if (publicationYear < 1900) {
    return 2.0;
  }
  if (publicationYear < 1950) {
    return 1.0;
  }
  if (publicationYear < 1990) {
    return 0.3;
  }
  return 0;
}

/** 300 pages is neutral; every doubling adds 0.6, capped at +/-1.5. */
export function lengthAdjustment(totalPages: number | null | undefined): number {
  if (typeof totalPages !== 'number' || !Number.isFinite(totalPages) || totalPages <= 0) {
    return 0;
  }
  return clamp(Math.log2(totalPages / 300) * 0.6, -1.5, 1.5);
}

export function estimatePrior(input: {
  genre: string | null | undefined;
  publicationYear: number | null | undefined;
  totalPages: number | null | undefined;
}): number {
  return clamp(
    DIFFICULTY_NEUTRAL +
      genreAdjustment(input.genre) +
      eraAdjustment(input.publicationYear) +
      lengthAdjustment(input.totalPages),
    DIFFICULTY_MIN,
    DIFFICULTY_MAX,
  );
}

// --- Blend -----------------------------------------------------------------

export function difficultyLabel(score: number): DifficultyLabel {
  if (score < 3.5) {
    return 'Light';
  }
  if (score < 5.5) {
    return 'Moderate';
  }
  if (score < 7.5) {
    return 'Demanding';
  }
  return 'Dense';
}

export function computeDifficulty(input: DifficultyInput): DifficultyResult {
  const prior = estimatePrior(input);
  const sample = measureReadability(input.quoteTexts.join('\n'));
  const confidence =
    sample.words >= MIN_SAMPLE_WORDS ? clamp(sample.words / FULL_CONFIDENCE_WORDS, 0, 1) : 0;
  const textGrade = confidence > 0 ? sample.grade : null;

  if (typeof input.override === 'number' && Number.isFinite(input.override)) {
    const score = round1(clamp(input.override, DIFFICULTY_MIN, DIFFICULTY_MAX));
    return {
      score,
      source: 'override',
      confidence,
      textGrade,
      sampledWords: sample.words,
      prior: round1(prior),
      label: difficultyLabel(score),
    };
  }

  const measured = textGrade !== null ? gradeToDifficulty(textGrade) : prior;
  const blended = confidence * measured + (1 - confidence) * prior;
  const score = round1(clamp(blended, DIFFICULTY_MIN, DIFFICULTY_MAX));
  return {
    score,
    source: confidence > 0 ? 'measured' : 'estimated',
    confidence,
    textGrade,
    sampledWords: sample.words,
    prior: round1(prior),
    label: difficultyLabel(score),
  };
}

/** The multiplier a book's difficulty applies to effort: 1.0 at 5.0. */
export function difficultyWeight(score: number): number {
  return clamp(score, DIFFICULTY_MIN, DIFFICULTY_MAX) / DIFFICULTY_NEUTRAL;
}

/** One-line provenance for the UI ("measured from 84 quoted words"). */
export function describeDifficultySource(result: DifficultyResult): string {
  switch (result.source) {
    case 'override':
      return 'set by you';
    case 'measured':
      return `measured from ${result.sampledWords} quoted words`;
    default:
      return 'estimated from genre, era, and length';
  }
}
