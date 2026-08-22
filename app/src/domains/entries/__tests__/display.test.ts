import {
  formatBoundaryPosition,
  getCurrentPosition,
  splitEntryText,
} from '@/domains/entries/display';

describe('splitEntryText', () => {
  it('splits the machine header from the body', () => {
    expect(splitEntryText('[Manual Entry - page 12-15]\nKip reaches the tower.')).toEqual({
      boundaryLabel: 'Page 12-15',
      body: 'Kip reaches the tower.',
    });
  });

  it('handles single-value chapter headers', () => {
    expect(splitEntryText('[Manual Entry - chapter 3]\nThe duel begins.')).toEqual({
      boundaryLabel: 'Chapter 3',
      body: 'The duel begins.',
    });
  });

  it('keeps multi-line bodies intact', () => {
    const parts = splitEntryText('[Manual Entry - page 40]\nLine one.\nLine two.');
    expect(parts.body).toBe('Line one.\nLine two.');
  });

  it('passes through text without a header', () => {
    expect(splitEntryText('Just a thought about the plot.')).toEqual({
      boundaryLabel: null,
      body: 'Just a thought about the plot.',
    });
  });

  it('does not treat a mid-text bracket line as a header', () => {
    const parts = splitEntryText('First line\n[Manual Entry - page 2]\nrest');
    expect(parts.boundaryLabel).toBeNull();
  });

  it('handles null, undefined, and header-only text', () => {
    expect(splitEntryText(null)).toEqual({ boundaryLabel: null, body: '' });
    expect(splitEntryText(undefined)).toEqual({ boundaryLabel: null, body: '' });
    expect(splitEntryText('[Manual Entry - page 5]')).toEqual({
      boundaryLabel: 'Page 5',
      body: '',
    });
  });
});

describe('formatBoundaryPosition', () => {
  it('formats page and chapter positions', () => {
    expect(formatBoundaryPosition({ progressType: 'page', lower: 12, upper: 15 })).toBe(
      'Page 15',
    );
    expect(formatBoundaryPosition({ progressType: 'chapter', lower: null, upper: 7 })).toBe(
      'Chapter 7',
    );
  });
});

describe('getCurrentPosition', () => {
  it('returns the newest parseable boundary regardless of progress type', () => {
    const entries = [
      { text: 'edited away the header' },
      { text: '[Manual Entry - chapter 7]\nlatest chapter' },
      { text: '[Manual Entry - page 90]\nolder page entry' },
    ];
    expect(getCurrentPosition(entries)).toEqual({
      progressType: 'chapter',
      lower: null,
      upper: 7,
    });
  });

  it('returns null when nothing parses', () => {
    expect(getCurrentPosition([{ text: 'no header' }, { text: null }])).toBeNull();
  });
});
