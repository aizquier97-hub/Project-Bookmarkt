/**
 * Photo title + description packed into the single `book_images.caption`
 * column (D-093). The add-photo screen asks for both; the storage row keeps
 * one text field, so the title is the first line and the description follows
 * after a blank line. Legacy single-line captions parse as a title alone.
 */
export interface PhotoCaptionParts {
  title: string;
  description: string;
}

const SEPARATOR = '\n\n';

export function composePhotoCaption(parts: PhotoCaptionParts): string {
  const title = parts.title.trim();
  const description = parts.description.trim();
  if (!description) {
    return title;
  }
  if (!title) {
    return description;
  }
  return `${title}${SEPARATOR}${description}`;
}

export function parsePhotoCaption(caption: string | null | undefined): PhotoCaptionParts {
  const value = String(caption ?? '').trim();
  if (!value) {
    return { title: '', description: '' };
  }
  const index = value.indexOf(SEPARATOR);
  if (index === -1) {
    return { title: value, description: '' };
  }
  return {
    title: value.slice(0, index).trim(),
    description: value.slice(index + SEPARATOR.length).trim(),
  };
}
