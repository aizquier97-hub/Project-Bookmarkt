import {
  applyMentionToText,
  filterNamesForMention,
  findActiveMentionQuery,
  splitTextForMentions,
} from '@/domains/entries/mentions';

describe('findActiveMentionQuery', () => {
  it('detects an open mention at the end of the text', () => {
    expect(findActiveMentionQuery('Met @')).toBe('');
    expect(findActiveMentionQuery('Met @Kir')).toBe('Kir');
    expect(findActiveMentionQuery('Met @Frodo Bag')).toBe('Frodo Bag');
    expect(findActiveMentionQuery('@Asuna')).toBe('Asuna');
  });

  it('returns null when no mention is being typed', () => {
    expect(findActiveMentionQuery('Just reading along')).toBeNull();
    expect(findActiveMentionQuery('email me at a@b.com')).toBeNull();
    expect(findActiveMentionQuery('Met @Kirito today.')).toBeNull();
    expect(findActiveMentionQuery('')).toBeNull();
  });

  it('keeps the query open across one space so two-word names match', () => {
    // "Kirito today" matches no character, so the chips simply hide.
    expect(findActiveMentionQuery('Met @Kirito today')).toBe('Kirito today');
  });
});

describe('applyMentionToText', () => {
  it('completes the open mention with the chosen name', () => {
    expect(applyMentionToText('Met @Kir', 'Kirito')).toBe('Met @Kirito ');
    expect(applyMentionToText('Met @', 'Asuna Yuuki')).toBe('Met @Asuna Yuuki ');
    expect(applyMentionToText('(@fro', 'Frodo')).toBe('(@Frodo ');
  });

  it('leaves text without an open mention untouched', () => {
    expect(applyMentionToText('No mention here', 'Kirito')).toBe('No mention here');
  });
});

describe('filterNamesForMention', () => {
  const names = ['Kirito', 'Asuna Yuuki', 'Klein', 'Agil', 'Yui', 'Heathcliff'];

  it('matches prefixes on the full name or any word', () => {
    expect(filterNamesForMention(names, 'k')).toEqual(['Kirito', 'Klein']);
    expect(filterNamesForMention(names, 'yuu')).toEqual(['Asuna Yuuki']);
  });

  it('returns the first names for an empty query, capped at five', () => {
    expect(filterNamesForMention(names, '')).toEqual([
      'Kirito',
      'Asuna Yuuki',
      'Klein',
      'Agil',
      'Yui',
    ]);
  });
});

describe('splitTextForMentions', () => {
  const names = ['Kirito', 'Asuna Yuuki'];

  it('splits matched mentions into linked segments', () => {
    expect(splitTextForMentions('Met @Kirito at the tower.', names)).toEqual([
      { text: 'Met ', characterName: null },
      { text: '@Kirito', characterName: 'Kirito' },
      { text: ' at the tower.', characterName: null },
    ]);
  });

  it('matches multi-word names case-insensitively and prefers the longest', () => {
    const segments = splitTextForMentions('Saw @asuna yuuki fight.', names);
    expect(segments).toEqual([
      { text: 'Saw ', characterName: null },
      { text: '@asuna yuuki', characterName: 'Asuna Yuuki' },
      { text: ' fight.', characterName: null },
    ]);
  });

  it('leaves unmatched or embedded @ tokens as plain text', () => {
    expect(splitTextForMentions('Ping @Stranger or a@b.com', names)).toEqual([
      { text: 'Ping @Stranger or a@b.com', characterName: null },
    ]);
    // "@Kiritos" is a different word - the boundary check must reject it.
    expect(splitTextForMentions('Not @Kiritos though', names)).toEqual([
      { text: 'Not @Kiritos though', characterName: null },
    ]);
  });

  it('handles empty inputs', () => {
    expect(splitTextForMentions('', names)).toEqual([{ text: '', characterName: null }]);
    expect(splitTextForMentions('Met @Kirito', [])).toEqual([
      { text: 'Met @Kirito', characterName: null },
    ]);
  });
});
