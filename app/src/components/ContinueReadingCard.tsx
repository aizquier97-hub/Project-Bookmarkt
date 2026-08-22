import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBoundaryPosition, type BookPositionSummary } from '@/domains/entries/display';
import type { Book } from '@/domains/library/service';
import { computeCompletionPercent } from '@/domains/library/shelf';
import { formatRelativeTime } from '@/lib/relativeTime';
import { cardShadow, colors, fonts, gold, spineColorFor } from '@/lib/theme';

/**
 * The hero "Continue reading" card above the shelf - the resume pattern
 * Kindle, Bookly, and StoryGraph lead their home screens with. It promotes
 * the freshest active book with its cover, position, and progress in one
 * tap target, replacing the old in-grid halo/bubble (which forced the
 * spotlight book to differ from its neighbors and crowded the shelf).
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
  const subLine = [positionText, lastEntry ? `Last entry ${lastEntry}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(book.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`Continue reading ${book.name}`}
    >
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
        <Text style={styles.eyebrow}>CONTINUE READING</Text>
        <Text style={styles.title} numberOfLines={2}>
          {book.name}
        </Text>
        {book.author ? (
          <Text style={styles.author} numberOfLines={1}>
            {book.author}
          </Text>
        ) : null}
        {percent !== null ? (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percent}%` }]} />
            </View>
            <Text style={styles.progressText}>{percent}%</Text>
          </View>
        ) : null}
        {subLine ? (
          <Text style={styles.subLine} numberOfLines={1}>
            {subLine}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.muted} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    ...cardShadow,
  },
  thumb: {
    width: 52,
    aspectRatio: 2 / 3,
    borderRadius: 4,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#2b1c10',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 1, height: 2 },
  },
  thumbImage: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  thumbPainted: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbInitial: {
    color: 'rgba(255, 253, 246, 0.92)',
    fontSize: 22,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: gold.deep,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  author: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  progressText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  subLine: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  chevron: {
    marginLeft: 2,
  },
});
