import { Image as CoverImage } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { formatBoundaryPosition, getCurrentPosition } from '@/domains/entries/display';
import type { Book } from '@/domains/library/service';
import { cardShadow, colors, fonts, spacing } from '@/lib/theme';

/**
 * The compact book hero on the section screens (D-093): a small cover, the
 * title, author · pages, and the reader's position, over a hairline. The
 * hub screen carries the larger hero; this one just keeps the book in view.
 */
export function BookHeroCompact({
  book,
  entries,
}: {
  book: Book | undefined;
  entries: { text: string | null }[];
}) {
  if (!book) {
    return <View style={styles.placeholder} />;
  }
  const position = getCurrentPosition(entries);
  const percent =
    position && position.progressType !== 'chapter' && book.total_pages
      ? Math.min(100, Math.max(0, Math.round((position.upper / book.total_pages) * 100)))
      : null;
  const meta = [book.author, book.total_pages ? `${book.total_pages} pages` : null]
    .filter(Boolean)
    .join(' · ');
  const positionLine = position
    ? `${formatBoundaryPosition(position)}${percent !== null ? ` · ${percent}% read` : ''}`
    : null;
  return (
    <View style={styles.root}>
      {book.cover_url ? (
        <CoverImage
          source={{ uri: book.cover_url }}
          style={styles.cover}
          contentFit="cover"
          accessibilityLabel={`Cover of ${book.name}`}
        />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]} />
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.name}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {positionLine ? <Text style={styles.meta}>{positionLine}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  placeholder: { height: 88 },
  cover: {
    width: 48,
    height: 72,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    ...cardShadow,
  },
  coverEmpty: { borderWidth: 1, borderColor: colors.border },
  info: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.serif, fontSize: 20, lineHeight: 26, color: colors.text },
  meta: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted },
});
