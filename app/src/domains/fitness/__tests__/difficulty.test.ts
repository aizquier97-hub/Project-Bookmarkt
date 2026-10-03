import {
  computeDifficulty,
  countSentences,
  countSyllables,
  describeDifficultySource,
  difficultyLabel,
  difficultyWeight,
  eraAdjustment,
  estimatePrior,
  genreAdjustment,
  gradeToDifficulty,
  lengthAdjustment,
  measureReadability,
} from '@/domains/fitness/difficulty';

const SIMPLE_PROSE =
  'The cat sat on the mat. It was warm. The sun was out. The dog ran by. ' +
  'The cat did not move. It just sat there and looked at the dog. The dog barked once. ' +
  'Then it ran off down the road and the cat went back to sleep in the sun. ' +
  'Later the boy came home. He fed the cat and the cat purred and purred.';

const DENSE_PROSE =
  'Notwithstanding the considerable epistemological difficulties inherent in any ' +
  'attempt to systematically reconcile phenomenological introspection with the ' +
  'methodological commitments of contemporary neuroscientific investigation, the ' +
  'philosophical literature has nevertheless continued to proliferate increasingly ' +
  'sophisticated conceptual frameworks whose explanatory ambitions substantially ' +
  'exceed their empirical corroboration, thereby perpetuating a theoretical impasse ' +
  'characterised by interminable disagreement concerning fundamental presuppositions.';

describe('readability primitives', () => {
  it('counts syllables with the silent-e rule', () => {
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('table')).toBe(2);
    expect(countSyllables('beautiful')).toBe(3);
    expect(countSyllables('epistemological')).toBeGreaterThanOrEqual(6);
  });

  it('counts sentences on terminal punctuation and trailing fragments', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
    expect(countSentences('No terminator here')).toBe(1);
    expect(countSentences('Ends well. Then a fragment')).toBe(2);
    expect(countSentences('')).toBe(0);
  });

  it('grades simple prose far below dense prose', () => {
    const simple = measureReadability(SIMPLE_PROSE).grade ?? 0;
    const dense = measureReadability(DENSE_PROSE).grade ?? 0;
    expect(simple).toBeLessThan(5);
    expect(dense).toBeGreaterThan(16);
  });

  it('maps grade 3 to 1.0 and grade 16 to 10.0', () => {
    expect(gradeToDifficulty(3)).toBeCloseTo(1, 5);
    expect(gradeToDifficulty(16)).toBeCloseTo(10, 5);
    expect(gradeToDifficulty(-4)).toBe(1);
    expect(gradeToDifficulty(30)).toBe(10);
  });
});

describe('metadata prior', () => {
  it('adjusts by genre with most-specific rows winning', () => {
    expect(genreAdjustment('Juvenile Fiction')).toBe(-2.5);
    expect(genreAdjustment('Science Fiction')).toBe(-1);
    expect(genreAdjustment('Science')).toBe(1.5);
    expect(genreAdjustment('Philosophy')).toBe(2.5);
    expect(genreAdjustment('Thriller')).toBe(-0.5);
    expect(genreAdjustment(null)).toBe(0);
    expect(genreAdjustment('Cooking')).toBe(0);
  });

  it('adjusts by era and length', () => {
    expect(eraAdjustment(1605)).toBe(2.5);
    expect(eraAdjustment(1851)).toBe(2);
    expect(eraAdjustment(1925)).toBe(1);
    expect(eraAdjustment(1975)).toBe(0.3);
    expect(eraAdjustment(2015)).toBe(0);
    expect(eraAdjustment(null)).toBe(0);
    expect(lengthAdjustment(300)).toBe(0);
    expect(lengthAdjustment(600)).toBeCloseTo(0.6, 5);
    expect(lengthAdjustment(5000)).toBe(1.5);
    expect(lengthAdjustment(20)).toBe(-1.5);
    expect(lengthAdjustment(null)).toBe(0);
  });

  it('starts at 5.0 and stays within 1-10', () => {
    expect(estimatePrior({ genre: null, publicationYear: null, totalPages: null })).toBe(5);
    expect(
      estimatePrior({ genre: 'Philosophy', publicationYear: 1650, totalPages: 1200 }),
    ).toBe(10);
    expect(
      estimatePrior({ genre: 'Picture Book', publicationYear: 2020, totalPages: 24 }),
    ).toBe(1);
  });
});

describe('computeDifficulty', () => {
  it('uses the prior when there are no quotes', () => {
    const result = computeDifficulty({
      genre: 'History',
      publicationYear: 1990,
      totalPages: 300,
      quoteTexts: [],
    });
    expect(result.score).toBe(6.5);
    expect(result.source).toBe('estimated');
    expect(result.confidence).toBe(0);
    expect(result.textGrade).toBeNull();
    expect(describeDifficultySource(result)).toBe('estimated from genre, era, and length');
  });

  it('ignores a quote sample below 20 words', () => {
    const result = computeDifficulty({
      genre: null,
      publicationYear: null,
      totalPages: null,
      quoteTexts: ['Notwithstanding epistemological difficulties, phenomenology persists.'],
    });
    expect(result.source).toBe('estimated');
    expect(result.score).toBe(5);
  });

  it('blends the measured grade in proportion to the sample size', () => {
    const partial = computeDifficulty({
      genre: null,
      publicationYear: null,
      totalPages: null,
      quoteTexts: [DENSE_PROSE],
    });
    expect(partial.source).toBe('measured');
    expect(partial.confidence).toBeGreaterThan(0.3);
    expect(partial.confidence).toBeLessThan(1);
    expect(partial.score).toBeGreaterThan(6);
    expect(partial.score).toBeLessThan(10);

    const full = computeDifficulty({
      genre: null,
      publicationYear: null,
      totalPages: null,
      quoteTexts: [DENSE_PROSE, DENSE_PROSE, DENSE_PROSE],
    });
    expect(full.confidence).toBe(1);
    expect(full.score).toBe(10);
    expect(describeDifficultySource(full)).toMatch(/^measured from \d+ quoted words$/);
  });

  it('measures simple prose as light even with a heavy prior', () => {
    const result = computeDifficulty({
      genre: 'Philosophy',
      publicationYear: 1700,
      totalPages: 900,
      quoteTexts: [SIMPLE_PROSE, SIMPLE_PROSE, SIMPLE_PROSE],
    });
    expect(result.confidence).toBe(1);
    expect(result.score).toBeLessThan(3);
    expect(result.label).toBe('Light');
  });

  it('lets a reader override win and clamps it', () => {
    const result = computeDifficulty({
      genre: 'Children',
      publicationYear: 2020,
      totalPages: 30,
      quoteTexts: [SIMPLE_PROSE],
      override: 12,
    });
    expect(result.source).toBe('override');
    expect(result.score).toBe(10);
    expect(describeDifficultySource(result)).toBe('set by you');
  });

  it('labels and weights scores', () => {
    expect(difficultyLabel(2)).toBe('Light');
    expect(difficultyLabel(5)).toBe('Moderate');
    expect(difficultyLabel(6.5)).toBe('Demanding');
    expect(difficultyLabel(9)).toBe('Dense');
    expect(difficultyWeight(5)).toBe(1);
    expect(difficultyWeight(10)).toBe(2);
    expect(difficultyWeight(2.5)).toBe(0.5);
  });
});
