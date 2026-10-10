import {
  encodeEntryBody,
  entryBodyForEditing,
  flagEntryTextImportant,
  parseEntryKind,
  replaceEntryBody,
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

describe('editing the body only (D-096)', () => {
  it('hides the header and kind marker from the edit field', () => {
    expect(entryBodyForEditing('[Manual Entry - page 152]\n[Quote]\nA line.')).toBe('A line.');
    expect(entryBodyForEditing('[Manual Entry - chapter 3]\nJust where I am.')).toBe(
      'Just where I am.',
    );
    expect(entryBodyForEditing('Legacy note.')).toBe('Legacy note.');
    expect(entryBodyForEditing(null)).toBe('');
  });

  it('keeps the reader\'s paragraph breaks and spacing inside the body', () => {
    const body = 'First thought.\n\nSecond thought.  Two spaces.';
    const stored = `[Manual Entry - page 9]\n[Quote]\n${body}`;
    expect(entryBodyForEditing(stored)).toBe(body);
    expect(replaceEntryBody(stored, body)).toBe(stored);
  });

  it('puts an edited body back under the original header and marker', () => {
    expect(replaceEntryBody('[Manual Entry - page 152]\n[Quote]\nOld.', 'New words.')).toBe(
      '[Manual Entry - page 152]\n[Quote]\nNew words.',
    );
    expect(replaceEntryBody('[Manual Entry - page 1]\n[Important]\nOld.', 'New.')).toBe(
      '[Manual Entry - page 1]\n[Important]\nNew.',
    );
    expect(replaceEntryBody('[Manual Entry - page 1]\nOld.', 'New.')).toBe(
      '[Manual Entry - page 1]\nNew.',
    );
    expect(replaceEntryBody('Legacy note.', 'New.')).toBe('New.');
    expect(replaceEntryBody('[Quote]\nOld.', 'New.')).toBe('[Quote]\nNew.');
  });

  it('round-trips through parseEntryKind after an edit', () => {
    const edited = replaceEntryBody('[Manual Entry - page 4]\n[Quote]\nOld.', 'Fresh line.');
    expect(parseEntryKind(edited.split('\n').slice(1).join('\n'))).toEqual({
      kind: 'quote',
      body: 'Fresh line.',
    });
  });
});
