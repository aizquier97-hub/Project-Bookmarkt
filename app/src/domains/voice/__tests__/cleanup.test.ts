import { cleanupTranscript, wordsMatchVerbatim } from '@/domains/voice/cleanup';

describe('cleanupTranscript', () => {
  it('capitalizes sentence starts and adds a terminal period', () => {
    expect(cleanupTranscript('she found the hidden door')).toBe('She found the hidden door.');
  });

  it('capitalizes after existing sentence punctuation', () => {
    expect(cleanupTranscript('the ship sank. everyone swam ashore')).toBe(
      'The ship sank. Everyone swam ashore.',
    );
  });

  it('collapses repeated whitespace', () => {
    expect(cleanupTranscript('  the   plot \n thickens  ')).toBe('The plot thickens.');
  });

  it('keeps existing terminal punctuation', () => {
    expect(cleanupTranscript('what a twist!')).toBe('What a twist!');
    expect(cleanupTranscript('did he know?')).toBe('Did he know?');
  });

  it('does not capitalize mid-sentence words', () => {
    expect(cleanupTranscript('anna met the count at dusk')).toBe('Anna met the count at dusk.');
  });

  it('handles sentences that start with numbers', () => {
    expect(cleanupTranscript('3 ships arrived. they anchored offshore')).toBe(
      '3 ships arrived. They anchored offshore.',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(cleanupTranscript('')).toBe('');
    expect(cleanupTranscript('   ')).toBe('');
  });

  it('is idempotent', () => {
    const once = cleanupTranscript('the crew mutinied. the captain fled');
    expect(cleanupTranscript(once)).toBe(once);
  });

  it('never alters the word sequence (D-016 invariant)', () => {
    const samples = [
      'she walked to the lighthouse and waited',
      'chapter twelve was slow but the ending paid off',
      "it was Elizabeth's letter that changed everything",
      'THE STORM BROKE at midnight. everyone ran',
      '3 ships arrived   then vanished',
    ];
    for (const raw of samples) {
      expect(wordsMatchVerbatim(raw, cleanupTranscript(raw))).toBe(true);
    }
  });
});

describe('wordsMatchVerbatim', () => {
  it('accepts punctuation and casing differences', () => {
    expect(wordsMatchVerbatim('the end came fast', 'The end came fast.')).toBe(true);
  });

  it('rejects added words', () => {
    expect(wordsMatchVerbatim('the end came', 'The end came fast.')).toBe(false);
  });

  it('rejects removed words', () => {
    expect(wordsMatchVerbatim('the end came fast', 'The end came.')).toBe(false);
  });

  it('rejects changed words', () => {
    expect(wordsMatchVerbatim('the end came fast', 'The end came quick.')).toBe(false);
  });
});
