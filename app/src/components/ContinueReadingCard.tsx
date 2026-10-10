import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBoundaryPosition, type BookPositionSummary } from '@/domains/entries/display';
import type { Book } from '@/domains/library/service';
import { computeCompletionPercent } from '@/domains/library/shelf';
import { formatRelativeTime } from '@/lib/relativeTime';
import { cardShadow, colors, fonts, radii, spacing, spineColorFor } from '@/lib/theme';

/**
 * The hero "Continue reading" card above the shelf - the resume pattern
 * Kindle, Bookly, and StoryGraph lead their home screens with. It promotes
 * the freshest active book with its cover, position, and progress in one
 * tap target, replacing the old in-grid halo/bubble (which forced the
 * spotlight book to differ from its neighbors and crowded the shelf).
 * D-096 sizes it to the Figma "Library" frame: 56-wide cover, serif 18
 * title, progress bar with "Page N · N%", then a hairline and the last-entry
 * line.
 */
export function ContinueReadingCard({
  book,
  summary,
}: {
  book: Book;
  summary: BookPositionSummary | undefined;
}) {
  const router = useRouter();
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.cover_url) && !coverFailed;
  const percent = computeCompletionPercent(summary?.position ?? null, book.total_pages, false);
  const positionText = summary?.position ? formatBoundaryPosition(summary.position) : null;
  const lastEntry = formatRelativeTime(summary?.lastEntryAt);
  const progressLine = [positionText, percent !== null ? `${percent}%` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(book.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`Continue reading ${book.name}`}
    >
      <Text style={styles.eyebrow}>Continue reading</Text>
      <View style={styles.row}>
        <View style={styles.thumb}>
          {showCover ? (
            <Image
              source={{ uri: book.cover_url ?? undefined }}
              style={styles.thumbImage}
              contentFit="cover"
              transition={150}
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <View style={[styles.thumbPainted, { backgroundColor: spineColorFor(book.id) }]}>
              <Text style={styles.thumbInitial}>{book.name.trim().charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {book.name}
          </Text>
          {book.author ? (
            <Text style={styles.author} numberOfLines={1}>
              {book.author}
            </Text>
          ) : null}
          {percent !== null ? (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
          ) : null}
          {progressLine ? (
            <Text style={styles.progressText} numberOfLines={1}>
              {progressLine}
            </Text>
          ) : null}
        </View>
      </View>
      {lastEntry ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.subLine}>Last entry {lastEntry}</Text>
        </>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...cardShadow,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 56,
    aspectRatio: 2 / 3,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  thumbImage: {
    flex: 1,
  },
  thumbPainted: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbInitial: {
    color: 'rgba(255, 253, 246, 0.92)',
    fontSize: 24,
    fontFamily: fonts.serif,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontFamily: fonts.serif,
  },
  author: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.sans,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  progressText: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: -spacing.xs,
  },
  subLine: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
