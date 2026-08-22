import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBoundaryPosition, type BookPositionSummary } from '@/domains/entries/display';
import type { Book } from '@/domains/library/service';
import { computeCompletionPercent } from '@/domains/library/shelf';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fonts, gold, paper, spineColorFor } from '@/lib/theme';

/**
 * One 2.5D book standing on the shelf: cloth cover in the book's own color,
 * paper title label, page block on the fore-edge, and a pull-out animation
 * when tapped (the book tips off the shelf, then opens). The freshest book
 * gets a gold spotlight halo and a "last entry" bubble; finished books wear
 * a gold FINISHED band. Uses core Animated (OTA-safe, no worklets).
 */
export function ShelfBook({
  book,
  summary,
  spotlight,
}: {
  book: Book;
  summary: BookPositionSummary | undefined;
  spotlight: boolean;
}) {
  const router = useRouter();
  const pull = useRef(new Animated.Value(0)).current;
  const finished = Boolean(book.finished_at);
  const cloth = spineColorFor(book.id);
  const percent = computeCompletionPercent(summary?.position ?? null, book.total_pages, finished);
  const lastEntryRelative = spotlight ? formatRelativeTime(summary?.lastEntryAt) : null;

  const handlePress = () => {
    Animated.timing(pull, {
      toValue: 1,
      duration: 210,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      router.push({ pathname: '/book/[id]', params: { id: String(book.id) } });
      // Reset after navigation so the book is back in place on return.
      setTimeout(() => pull.setValue(0), 450);
    });
  };

  const pullStyle = {
    transform: [
      {
        translateY: pull.interpolate({ inputRange: [0, 1], outputRange: [0, -16] }),
      },
      {
        rotate: pull.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-4deg'] }),
      },
      {
        scale: pull.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
      },
    ],
  };

  const positionLine = summary?.position
    ? formatBoundaryPosition(summary.position)
    : summary?.lastEntryAt
      ? 'In progress'
      : book.total_pages
        ? `${book.total_pages} pages`
        : null;

  return (
    <View style={styles.slot}>
      {spotlight ? (
        <>
          <View style={styles.haloOuter} pointerEvents="none" />
          <View style={styles.haloInner} pointerEvents="none" />
        </>
      ) : null}

      <Animated.View style={[styles.animatedWrap, pullStyle]}>
        {spotlight && lastEntryRelative ? (
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>✨ Last entry {lastEntryRelative}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.cloth, { backgroundColor: cloth }, finished && styles.clothFinished]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={
            finished
              ? `${book.name}, finished`
              : spotlight
                ? `Continue reading ${book.name}`
                : book.name
          }
        >
          {/* Spine ridge and hinge highlight give the cover its depth. */}
          <View style={styles.spineRidge} />
          <View style={styles.hinge} />

          <View style={styles.paperLabel}>
            <Text style={styles.title} numberOfLines={3}>
              {book.name}
            </Text>
            <View>
              {book.author ? (
                <Text style={styles.author} numberOfLines={1}>
                  {book.author}
                </Text>
              ) : null}
              {positionLine ? (
                <Text
                  style={[styles.position, finished && styles.positionFinished]}
                  numberOfLines={1}
                >
                  {finished ? '🏆 Finished' : positionLine}
                </Text>
              ) : finished ? (
                <Text style={[styles.position, styles.positionFinished]}>🏆 Finished</Text>
              ) : null}
              {percent !== null ? (
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${percent}%` },
                        finished && styles.progressFillFinished,
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>{percent}%</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Fore-edge page block: the stack of pages at the book's right. */}
          <View style={styles.pages}>
            <View style={styles.pageLine} />
            <View style={styles.pageLine} />
            <View style={styles.pageLine} />
          </View>

          {finished ? (
            <View style={styles.finishedBand} pointerEvents="none">
              <Text style={styles.finishedBandText}>FINISHED</Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    position: 'relative',
  },
  animatedWrap: {
    flex: 1,
  },
  haloOuter: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -6,
    borderRadius: 22,
    backgroundColor: gold.glowSoft,
  },
  haloInner: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -2,
    borderRadius: 16,
    backgroundColor: gold.glow,
  },
  bubble: {
    alignSelf: 'center',
    backgroundColor: gold.base,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    zIndex: 2,
  },
  bubbleText: {
    color: '#fffdf6',
    fontSize: 11,
    fontWeight: '700',
  },
  cloth: {
    flex: 1,
    minHeight: 172,
    flexDirection: 'row',
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#3f2f16',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 2, height: 4 },
  },
  clothFinished: {
    borderWidth: 1.5,
    borderColor: gold.base,
  },
  spineRidge: {
    width: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  hinge: {
    width: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  paperLabel: {
    flex: 1,
    backgroundColor: colors.card,
    marginVertical: 12,
    marginLeft: 8,
    marginRight: 6,
    borderRadius: 3,
    padding: 10,
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  author: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
  },
  position: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  positionFinished: {
    color: gold.deep,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.10)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  progressFillFinished: {
    backgroundColor: gold.base,
  },
  progressText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  pages: {
    width: 7,
    backgroundColor: paper.edge,
    marginVertical: 8,
    borderTopLeftRadius: 1,
    borderBottomLeftRadius: 1,
    justifyContent: 'space-evenly',
  },
  pageLine: {
    height: 1,
    backgroundColor: paper.edgeLine,
    marginHorizontal: 1,
  },
  finishedBand: {
    position: 'absolute',
    top: 14,
    right: -26,
    width: 104,
    transform: [{ rotate: '38deg' }],
    backgroundColor: gold.base,
    paddingVertical: 3,
    alignItems: 'center',
  },
  finishedBandText: {
    color: '#fffdf6',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
