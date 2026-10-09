import { composePhotoCaption, parsePhotoCaption } from '@/domains/library/photoCaption';

describe('photoCaption', () => {
  it('packs title and description with a blank line between', () => {
    expect(
      composePhotoCaption({ title: ' Main house living room ', description: 'Where Carl hides.' }),
    ).toBe('Main house living room\n\nWhere Carl hides.');
  });

  it('keeps a lone title or lone description as-is', () => {
    expect(composePhotoCaption({ title: 'Cover', description: '' })).toBe('Cover');
    expect(composePhotoCaption({ title: '', description: 'Just words' })).toBe('Just words');
    expect(composePhotoCaption({ title: '  ', description: '  ' })).toBe('');
  });

  it('round-trips through parse', () => {
    const parts = { title: 'Map of the dungeon', description: 'Floor 3, east wing.' };
    expect(parsePhotoCaption(composePhotoCaption(parts))).toEqual(parts);
  });

  it('reads legacy single-line captions as a title', () => {
    expect(parsePhotoCaption('Old caption')).toEqual({ title: 'Old caption', description: '' });
    expect(parsePhotoCaption(null)).toEqual({ title: '', description: '' });
    expect(parsePhotoCaption('')).toEqual({ title: '', description: '' });
  });

  it('splits on the first blank line only', () => {
    expect(parsePhotoCaption('Title\n\nPara one.\n\nPara two.')).toEqual({
      title: 'Title',
      description: 'Para one.\n\nPara two.',
    });
  });
});
