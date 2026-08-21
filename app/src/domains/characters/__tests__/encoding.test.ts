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
});

describe('parseCharacterDescription', () => {
  it('round-trips what merge produces', () => {
    const details = {
      role: 'Protagonist',
      description: 'Errant knight',
      relationships: 'Sancho (squire)',
    };
    expect(parseCharacterDescription(mergeCharacterDescription(details))).toEqual(details);
  });

  it('tolerates extra whitespace and blank lines', () => {
    expect(
      parseCharacterDescription('  Role:  Mentor  \n\n  Description:  Wise  \n'),
    ).toEqual({ role: 'Mentor', description: 'Wise', relationships: '' });
  });

  it('treats unlabeled legacy text as the description', () => {
    expect(parseCharacterDescription('An old PWA record without labels')).toEqual({
      role: '',
      description: 'An old PWA record without labels',
      relationships: '',
    });
  });

  it('handles null and empty input', () => {
    expect(parseCharacterDescription(null)).toEqual({
      role: '',
      description: '',
      relationships: '',
    });
    expect(parseCharacterDescription('')).toEqual({ role: '', description: '', relationships: '' });
  });
});
