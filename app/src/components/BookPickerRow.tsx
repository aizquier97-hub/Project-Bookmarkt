import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Book } from '@/domains/library/service';
import { colors, fonts, spacing, spineColorFor } from '@/lib/theme';

/**
 * One book as a tappable hairline row (Interface v2.0 → D-094, after the
 * Figma "Choose a book" lists): the pick-a-book step the Book Club, Recall,
 * and reading-timer screens lead with, since each is grounded in a single
 * book's records. Cover 48 × 72, serif title, muted author, a hairline
 * under each row, and a chevron only where the tap actually opens the
 * feature - the locked lists on the free tabs drop it.
 */
export function BookPickerRow({
  book,
  onPress,
  showChevron = true,
  last = false,
}: {
  book: Book;
  onPress: () => void;
  /** Hide for the locked lists, where the row leads to the offer rather than the feature. */
  showChevron?: boolean;
  /** Drops the hairline under the final row of a list. */
  last?: boolean;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.cover_url) && !coverFailed;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Choose ${book.name}`}
    >
      <View style={styles.thumb}>
        {showCover ? (
          <Image
            source={{ uri: book.cover_url ?? undefined }}
            style={styles.thumbImage}
            contentFit="cover"
            transition={120}
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <View style={[styles.thumbImage, { backgroundColor: spineColorFor(book.id) }]} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.name}
        </Text>
        {book.author ? (
          <Text style={styles.author} numberOfLines={1}>
            {book.author}
          </Text>
        ) : null}
      </View>
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    opacity: 0.75,
  },
  thumb: {
    width: 48,
    height: 72,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  thumbImage: {
    flex: 1,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
  },
  author: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
