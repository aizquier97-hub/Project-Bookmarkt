import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Book } from '@/domains/library/service';
import { colors, fonts, spineColorFor } from '@/lib/theme';

/**
 * One book as a tappable paper row (Interface v2.0): the pick-a-book step
 * both the Book Club and Cue Cards tabs lead with, since both features are
 * grounded in a single book's records. Cover thumb, title, author, chevron.
 */
export function BookPickerRow({ book, onPress }: { book: Book; onPress: () => void }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.cover_url) && !coverFailed;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
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
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    elevation: 2,
    shadowColor: '#2a1c11',
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  rowPressed: {
    opacity: 0.75,
  },
  thumb: {
    width: 38,
    height: 57,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  thumbImage: {
    flex: 1,
  },
  info: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  author: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
