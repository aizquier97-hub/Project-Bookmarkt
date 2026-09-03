import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBoundaryPosition, type BookPositionSummary } from '@/domains/entries/display';
import type { Book } from '@/domains/library/service';
import { computeCompletionPercent, shelfTitleTypography } from '@/domains/library/shelf';
import { colors, fonts, gold, spineColorFor } from '@/lib/theme';

/**
 * One book in the library grid (D-040): the flat, cover-first card every app
 * in this space uses (StoryGraph, Goodreads, Fable, Kindle). Cover art
 * renders at true 2:3 with rounded corners; title, author, and a thin
 * progress bar sit beneath it. Finished books earn a gold checkmark badge on
 * the cover corner. Books without art get a flat colored placeholder cover
 * with the title set word-safe, never mid-word.
 */
export function BookCard({
  book,
  summary,
}: {
  book: Book;
  summary: BookPositionSummary | undefined;
}) {
  const router = useRouter();
  const finished = Boolean(book.finished_at);
  const percent = computeCompletionPercent(summary?.position ?? null, book.total_pages, finished);
  const titleType = shelfTitleTypography(book.name);

  // Broken cover art falls back to the placeholder so the grid has no holes.
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => {
    setCoverFailed(false);
  }, [book.cover_url]);
  const showCover = Boolean(book.cover_url) && !coverFailed;

  const positionLine = summary?.position
    ? formatBoundaryPosition(summary.position)
    : summary?.lastEntryAt
      ? 'In progress'
      : book.total_pages
        ? `${book.total_pages} pages`
        : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(book.id) } })}
      accessibilityRole="button"
      accessibilityLabel={finished ? `${book.name}, finished` : book.name}
    >
      <View style={styles.cover}>
        {showCover ? (
          <Image
            source={{ uri: book.cover_url ?? undefined }}
            style={styles.coverImage}
            contentFit="cover"
            transition={150}
            onError={() => setCoverFailed(true)}
            accessibilityLabel={`Cover of ${book.name}`}
          />
        ) : (
          <View style={[styles.placeholder, { backgroundColor: spineColorFor(book.id) }]}>
            <Text
              style={[
                styles.placeholderTitle,
                { fontSize: titleType.fontSize, lineHeight: titleType.lineHeight },
              ]}
              numberOfLines={titleType.maxLines}
            >
              {book.name}
            </Text>
            {book.author ? (
              <Text style={styles.placeholderAuthor} numberOfLines={1}>
                {book.author}
              </Text>
            ) : null}
          </View>
        )}
        {finished ? (
          <View style={styles.badge} pointerEvents="none">
            <Ionicons name="checkmark" size={14} color="#3a2b12" />
          </View>
        ) : null}
      </View>

      {/* Single-word titles stay on one line: shrink first, ellipsize last
          (D-054); multi-word titles wrap at spaces across two lines. */}
      <Text
        style={styles.title}
        numberOfLines={book.name.trim().includes(' ') ? 2 : 1}
        adjustsFontSizeToFit={!book.name.trim().includes(' ')}
        minimumFontScale={0.72}
      >
        {book.name}
      </Text>
      {book.author ? (
        <Text style={styles.author} numberOfLines={1}>
          {book.author}
        </Text>
      ) : null}

      {finished ? (
        <View style={styles.metaRow}>
          <Ionicons name="checkmark-circle" size={12} color={gold.deep} />
          <Text style={styles.finishedText}>Finished</Text>
        </View>
      ) : percent !== null ? (
        <View style={styles.metaRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.progressText}>{percent}%</Text>
        </View>
      ) : positionLine ? (
        <Text style={styles.positionText} numberOfLines={1}>
          {positionLine}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  // Quiet press feedback in place of the old pull-off-the-shelf animation;
  // opacity needs no motion, so reduce-motion readers get the same cue.
  cardPressed: {
    opacity: 0.7,
  },
  cover: {
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.border,
    elevation: 2,
    shadowColor: '#3a3125',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  coverImage: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
    gap: 6,
  },
  placeholderTitle: {
    color: 'rgba(255, 255, 255, 0.96)',
    fontFamily: fonts.serif,
    fontWeight: '700',
    textAlign: 'center',
  },
  placeholderAuthor: {
    fontFamily: fonts.serif,
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 10,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: gold.base,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#3a3125',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  title: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: fonts.serif,
    fontWeight: '600',
    marginTop: 7,
  },
  author: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(58, 49, 37, 0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  progressText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  finishedText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  positionText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 10,
    marginTop: 5,
  },
});
