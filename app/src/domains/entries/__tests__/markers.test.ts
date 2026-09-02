import {
  encodeEntryBody,
  flagEntryTextImportant,
  parseEntryKind,
} from '@/domains/entries/markers';

describe('entry kind markers (D-039 free feeders)', () => {
  it('round-trips a quote', () => {
    const encoded = encodeEntryBody('quote', 'All that is gold does not glitter.');
    expect(encoded).toBe('[Quote]\nAll that is gold does not glitter.');
    expect(parseEntryKind(encoded)).toEqual({
      kind: 'quote',
      body: 'All that is gold does not glitter.',
    });
  });

  it('round-trips an important event', () => {
    const encoded = encodeEntryBody('important', 'Gandalf falls in Moria.');
    expect(parseEntryKind(encoded)).toEqual({
      kind: 'important',
      body: 'Gandalf falls in Moria.',
    });
  });

  it('leaves plain notes untouched', () => {
    expect(encodeEntryBody('note', 'Just where I am.')).toBe('Just where I am.');
    expect(parseEntryKind('Just where I am.')).toEqual({
      kind: 'note',
      body: 'Just where I am.',
    });
  });

  it('keeps multi-line bodies intact', () => {
    const body = 'Line one.\nLine two.';
    expect(parseEntryKind(encodeEntryBody('quote', body))).toEqual({ kind: 'quote', body });
  });

  it('is tolerant of marker casing and surrounding whitespace', () => {
    expect(parseEntryKind('  [quote]  \nA line.')).toEqual({ kind: 'quote', body: 'A line.' });
  });

  it('does not treat marker-like text mid-body as a marker', () => {
    expect(parseEntryKind('I wrote [Quote] in my margin.')).toEqual({
      kind: 'note',
      body: 'I wrote [Quote] in my margin.',
    });
  });

  it('handles a marker with no body and null input', () => {
    expect(parseEntryKind('[Important]')).toEqual({ kind: 'important', body: '' });
    expect(parseEntryKind(null)).toEqual({ kind: 'note', body: '' });
  });

  it('flags a full stored entry text as important', () => {
    expect(flagEntryTextImportant('[Manual Entry - page 12]\nThe duel begins.')).toBe(
      '[Manual Entry - page 12]\n[Important]\nThe duel begins.',
    );
  });

  it('flags a headerless legacy entry by prepending the marker', () => {
    expect(flagEntryTextImportant('The duel begins.')).toBe('[Important]\nThe duel begins.');
  });

  it('leaves already-marked entries unchanged when flagging', () => {
    const quote = '[Manual Entry - page 3]\n[Quote]\nA line.';
    const important = '[Manual Entry - page 3]\n[Important]\nA moment.';
    expect(flagEntryTextImportant(quote)).toBe(quote);
    expect(flagEntryTextImportant(important)).toBe(important);
  });
});
