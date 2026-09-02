import {
  mergeCharacterDescription,
  parseCharacterDescription,
} from '@/domains/characters/encoding';

describe('mergeCharacterDescription', () => {
  it('encodes only the provided fields as labeled lines', () => {
    expect(
      mergeCharacterDescription({
        role: 'Protagonist',
        description: 'Errant knight',
        relationships: 'Sancho (squire)',
      }),
    ).toBe('Role: Protagonist\nDescription: Errant knight\nRelationships: Sancho (squire)');
    expect(mergeCharacterDescription({ role: 'Villain', description: '', relationships: '' })).toBe(
      'Role: Villain',
    );
    expect(mergeCharacterDescription({ role: '', description: '', relationships: '' })).toBe('');
  });

  it('encodes the first-noted stamp as its own line', () => {
    expect(
      mergeCharacterDescription({
        role: 'Mentor',
        description: '',
        relationships: '',
        firstNoted: 'page 124',
      }),
    ).toBe('Role: Mentor\nFirst noted: page 124');
    expect(
      mergeCharacterDescription({
        role: '',
        description: '',
        relationships: '',
        firstNoted: 'chapter 7',
      }),
    ).toBe('First noted: chapter 7');
  });
});

describe('parseCharacterDescription', () => {
  it('round-trips what merge produces', () => {
    const details = {
      role: 'Protagonist',
      description: 'Errant knight',
      relationships: 'Sancho (squire)',
      firstNoted: 'page 42',
    };
    expect(parseCharacterDescription(mergeCharacterDescription(details))).toEqual(details);
  });

  it('tolerates extra whitespace and blank lines', () => {
    expect(
      parseCharacterDescription('  Role:  Mentor  \n\n  Description:  Wise  \n'),
    ).toEqual({ role: 'Mentor', description: 'Wise', relationships: '', firstNoted: '' });
  });

  it('treats unlabeled legacy text as the description', () => {
    expect(parseCharacterDescription('An old PWA record without labels')).toEqual({
      role: '',
      description: 'An old PWA record without labels',
      relationships: '',
      firstNoted: '',
    });
  });

  it('keeps a lone first-noted line out of the description fallback', () => {
    expect(parseCharacterDescription('First noted: page 9')).toEqual({
      role: '',
      description: '',
      relationships: '',
      firstNoted: 'page 9',
    });
  });

  it('handles null and empty input', () => {
    expect(parseCharacterDescription(null)).toEqual({
      role: '',
      description: '',
      relationships: '',
      firstNoted: '',
    });
    expect(parseCharacterDescription('')).toEqual({
      role: '',
      description: '',
      relationships: '',
      firstNoted: '',
    });
  });
});
