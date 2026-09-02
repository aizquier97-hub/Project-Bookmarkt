import {
  formatFirstNoted,
  formatFirstNotedLabel,
  parseFirstNoted,
  sortCharactersByAppearance,
  suggestCharacterNames,
} from '@/domains/characters/capture';

describe('suggestCharacterNames', () => {
  it('surfaces repeated capitalized names from entry bodies', () => {
    const bodies = [
      'Met Kirito at the tower. Kirito seems suspicious of the guild.',
      'The party welcomed Asuna, who argued with Kirito.',
    ];
    const suggestions = suggestCharacterNames(bodies, []);
    expect(suggestions).toContain('Kirito');
    expect(suggestions).toContain('Asuna');
    expect(suggestions).not.toContain('Met Kirito');
  });

  it('excludes names that overlap existing characters', () => {
    const bodies = ['Kirito and Asuna reached the boss room together with Klein.'];
    const suggestions = suggestCharacterNames(bodies, ['Kirito', 'Asuna Yuuki']);
    expect(suggestions).not.toContain('Kirito');
    expect(suggestions).not.toContain('Asuna');
    expect(suggestions).toContain('Klein');
  });

  it('skips sentence-starting words unless they repeat or appear mid-sentence', () => {
    const bodies = ['Today the plot thickened.', 'Reading felt slow but steady.'];
    expect(suggestCharacterNames(bodies, [])).toEqual([]);
  });

  it('groups multi-word capitalized runs into a single name', () => {
    const bodies = ['We finally met Frodo Baggins near the river.'];
    expect(suggestCharacterNames(bodies, [])).toContain('Frodo Baggins');
  });

  it('drops words that also appear lowercase in the corpus', () => {
    const bodies = ['Winter is coming.', 'The winter dragged on for the whole chapter.'];
    expect(suggestCharacterNames(bodies, [])).not.toContain('Winter');
  });

  it('ranks unmatched @mentions first', () => {
    const bodies = [
      'Gandalf spoke of the mountain. Gandalf left at dawn. Gandalf again.',
      'I should track @Radagast for later.',
    ];
    const suggestions = suggestCharacterNames(bodies, []);
    expect(suggestions[0]).toBe('Radagast');
  });

  it('caps the list at six suggestions', () => {
    const bodies = [
      'Alpha met Bravo. Later Alpha saw Charlie, Delta, Echo, Foxtrot and Golf. ' +
        'Then Bravo, Charlie, Delta, Echo, Foxtrot and Golf returned to Alpha.',
    ];
    expect(suggestCharacterNames(bodies, []).length).toBeLessThanOrEqual(6);
  });
});

describe('first-noted stamps', () => {
  it('formats the current position as a stamp and back', () => {
    expect(formatFirstNoted({ progressType: 'page', lower: 120, upper: 124 })).toBe('page 124');
    expect(formatFirstNoted(null)).toBe('');
    expect(parseFirstNoted('page 124')).toEqual({ progressType: 'page', value: 124 });
    expect(parseFirstNoted('Chapter 7')).toEqual({ progressType: 'chapter', value: 7 });
    expect(parseFirstNoted('somewhere nice')).toBeNull();
    expect(parseFirstNoted(undefined)).toBeNull();
  });

  it('renders a display label only for parseable stamps', () => {
    expect(formatFirstNotedLabel('page 124')).toBe('Page 124');
    expect(formatFirstNotedLabel('chapter 7')).toBe('Chapter 7');
    expect(formatFirstNotedLabel('')).toBeNull();
    expect(formatFirstNotedLabel(undefined)).toBeNull();
  });
});

describe('sortCharactersByAppearance', () => {
  const character = (name: string, description: string | null) => ({ name, description });

  it('orders stamped characters by position and keeps unstamped ones after', () => {
    const list = [
      character('Late', 'First noted: page 200'),
      character('NoStamp', 'Role: Sidekick'),
      character('Early', 'First noted: page 12'),
    ];
    expect(sortCharactersByAppearance(list).map((c) => c.name)).toEqual([
      'Early',
      'Late',
      'NoStamp',
    ]);
  });

  it('keeps original order for mixed progress types and no stamps', () => {
    const mixed = [
      character('Pages', 'First noted: page 50'),
      character('Chapters', 'First noted: chapter 2'),
    ];
    expect(sortCharactersByAppearance(mixed).map((c) => c.name)).toEqual(['Pages', 'Chapters']);
    const none = [character('A', null), character('B', 'Role: Hero')];
    expect(sortCharactersByAppearance(none).map((c) => c.name)).toEqual(['A', 'B']);
  });
});
