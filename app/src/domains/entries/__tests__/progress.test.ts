import {
  buildProgressRangeLabel,
  getLatestProgressBoundary,
  normalizeProgressNumber,
  normalizeProgressType,
  parseProgressBoundaryFromEntryText,
} from '@/domains/entries/progress';

describe('normalizeProgressType', () => {
  it('defaults to page for anything but chapter', () => {
    expect(normalizeProgressType('chapter')).toBe('chapter');
    expect(normalizeProgressType('page')).toBe('page');
    expect(normalizeProgressType('bogus')).toBe('page');
    expect(normalizeProgressType(null)).toBe('page');
    expect(normalizeProgressType(undefined)).toBe('page');
  });
});

describe('normalizeProgressNumber', () => {
  it('floors positive numbers', () => {
    expect(normalizeProgressNumber('12')).toBe(12);
    expect(normalizeProgressNumber(' 42 ')).toBe(42);
    expect(normalizeProgressNumber(7.9)).toBe(7);
  });

  it('rejects zero, negatives, and non-numbers', () => {
    expect(normalizeProgressNumber('0')).toBeNull();
    expect(normalizeProgressNumber('-3')).toBeNull();
    expect(normalizeProgressNumber('abc')).toBeNull();
    expect(normalizeProgressNumber('')).toBeNull();
    expect(normalizeProgressNumber(null)).toBeNull();
    expect(normalizeProgressNumber(undefined)).toBeNull();
  });
});

describe('buildProgressRangeLabel', () => {
  it('labels a first entry with a single value', () => {
    expect(buildProgressRangeLabel('page', null, 12)).toBe('page 12');
  });

  it('starts the window one after the previous boundary', () => {
    expect(buildProgressRangeLabel('page', 12, 20)).toBe('page 13-20');
    expect(buildProgressRangeLabel('chapter', 3, 5)).toBe('chapter 4-5');
  });

  it('collapses to a single value when the window start reaches the upper bound', () => {
    expect(buildProgressRangeLabel('page', 12, 13)).toBe('page 13');
    expect(buildProgressRangeLabel('page', 12, 12)).toBe('page 12');
  });
});

describe('parseProgressBoundaryFromEntryText', () => {
  it('parses the PWA manual-entry header', () => {
    expect(parseProgressBoundaryFromEntryText('[Manual Entry - page 13-20]\nNotes')).toEqual({
      progressType: 'page',
      lower: 13,
      upper: 20,
    });
  });

  it('parses single-value headers', () => {
    expect(parseProgressBoundaryFromEntryText('[Manual Entry - chapter 4]\nNotes')).toEqual({
      progressType: 'chapter',
      lower: null,
      upper: 4,
    });
  });

  it('is case-insensitive and order-insensitive for ranges', () => {
    expect(parseProgressBoundaryFromEntryText('[Manual Entry - Page 20-13]')).toEqual({
      progressType: 'page',
      lower: 13,
      upper: 20,
    });
  });

  it('only reads the first line', () => {
    expect(parseProgressBoundaryFromEntryText('plain first line\npage 9')).toBeNull();
  });

  it('returns null for text without a progress header', () => {
    expect(parseProgressBoundaryFromEntryText('just notes')).toBeNull();
    expect(parseProgressBoundaryFromEntryText(null)).toBeNull();
    expect(parseProgressBoundaryFromEntryText(undefined)).toBeNull();
  });
});

describe('getLatestProgressBoundary', () => {
  const entries = [
    { text: '[Manual Entry - chapter 6]\nlatest chapter note' },
    { text: 'freeform note without header' },
    { text: '[Manual Entry - page 41-55]\nlatest page note' },
    { text: '[Manual Entry - page 12-40]\nolder page note' },
  ];

  it('returns the first matching boundary of the requested type (list is newest-first)', () => {
    expect(getLatestProgressBoundary(entries, 'page')).toEqual({
      progressType: 'page',
      lower: 41,
      upper: 55,
    });
    expect(getLatestProgressBoundary(entries, 'chapter')).toEqual({
      progressType: 'chapter',
      lower: null,
      upper: 6,
    });
  });

  it('returns null when no entry of the type exists', () => {
    expect(getLatestProgressBoundary([{ text: 'no header' }], 'page')).toBeNull();
    expect(getLatestProgressBoundary([], 'chapter')).toBeNull();
  });
});
