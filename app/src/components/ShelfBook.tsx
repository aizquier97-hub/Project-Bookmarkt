import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBoundaryPosition, type BookPositionSummary } from '@/domains/entries/display';
import type { Book } from '@/domains/library/service';
import { computeCompletionPercent, shelfTitleTypography } from '@/domains/library/shelf';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fonts, gold, leather, paper, spineColorFor } from '@/lib/theme';

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
  const nudge = useRef(new Animated.Value(0)).current;
  const finished = Boolean(book.finished_at);
  // Finished books join the leather-bound collector set: one shared deep
  // leather, gold stamping, gilt page edges (Gestalt similarity groups the
  // trophy row; celebration, never dimmed-as-disabled).
  const cloth = finished ? leather.cover : spineColorFor(book.id);
  const percent = computeCompletionPercent(summary?.position ?? null, book.total_pages, finished);
  const titleType = shelfTitleTypography(book.name);
  const lastEntryRelative = spotlight ? formatRelativeTime(summary?.lastEntryAt) : null;

  // The hero book peeks off the shelf twice when the library appears -
  // one-time motion draws the eye without nagging (never loops).
  useEffect(() => {
    if (!spotlight) {
      return;
    }
    const timing = (toValue: number) =>
      Animated.timing(nudge, {
        toValue,
        duration: 230,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const sequence = Animated.sequence([
      Animated.delay(450),
      timing(1),
      timing(0),
      Animated.delay(180),
      timing(1),
      timing(0),
    ]);
    sequence.start();
    return () => sequence.stop();
  }, [spotlight, nudge]);

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
        translateY: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }),
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
          style={[
            styles.cloth,
            { backgroundColor: cloth },
            finished && styles.clothFinished,
          ]}
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

          <View style={[styles.paperLabel, finished && styles.paperLabelFinished]}>
            <Text
              style={[
                styles.title,
                { fontSize: titleType.fontSize, lineHeight: titleType.lineHeight },
                finished && styles.titleFinished,
              ]}
              numberOfLines={titleType.maxLines}
            >
              {book.name}
            </Text>
            <View>
              {book.author ? (
                <Text style={[styles.author, finished && styles.authorFinished]} numberOfLines={1}>
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
                  <View style={[styles.progressTrack, finished && styles.progressTrackFinished]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${percent}%` },
                        finished && styles.progressFillFinished,
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressText, finished && styles.progressTextFinished]}>
                    {percent}%
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Fore-edge page block: the stack of pages at the book's right. */}
          <View style={[styles.pages, finished && styles.pagesFinished]}>
            <View style={[styles.pageLine, finished && styles.pageLineFinished]} />
            <View style={[styles.pageLine, finished && styles.pageLineFinished]} />
            <View style={[styles.pageLine, finished && styles.pageLineFinished]} />
          </View>

          {finished ? (
            <>
              {/* Gold tooling frame, stamped like a collector's edition. */}
              <View style={styles.tooling} pointerEvents="none" />
              <View style={styles.finishedBand} pointerEvents="none">
                <Text style={styles.finishedBandText}>FINISHED</Text>
              </View>
            </>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // All books share one size - reading trackers (Bookly, StoryGraph, Kindle
  // home) keep covers uniform and signal the current read with placement,
  // badges, and motion instead. Our spotlight book leads the shelf and gets
  // the halo, bubble, and peek nudge.
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
    backgroundColor: colors.text,
    borderWidth: 1,
    borderColor: gold.base,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    zIndex: 2,
  },
  bubbleText: {
    color: '#f2c75c',
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
  // Collector's editions are gold-stamped straight onto the leather.
  paperLabelFinished: {
    backgroundColor: 'transparent',
  },
  title: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  titleFinished: {
    color: leather.stamp,
  },
  author: {
    color: colors.muted,
    fontSize: 11,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
  },
  authorFinished: {
    color: 'rgba(232, 201, 121, 0.75)',
  },
  position: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  positionFinished: {
    color: leather.stamp,
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
  progressTrackFinished: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
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
  progressTextFinished: {
    color: leather.stamp,
  },
  pages: {
    width: 7,
    backgroundColor: paper.edge,
    marginVertical: 8,
    borderTopLeftRadius: 1,
    borderBottomLeftRadius: 1,
    justifyContent: 'space-evenly',
  },
  // Gilt page edges, the collector-set finishing touch.
  pagesFinished: {
    backgroundColor: leather.gilt,
  },
  pageLine: {
    height: 1,
    backgroundColor: paper.edgeLine,
    marginHorizontal: 1,
  },
  pageLineFinished: {
    backgroundColor: 'rgba(109, 76, 21, 0.4)',
  },
  tooling: {
    position: 'absolute',
    top: 5,
    left: 12,
    right: 10,
    bottom: 5,
    borderWidth: 1,
    borderColor: leather.tooling,
    borderRadius: 3,
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
    color: '#33291b',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
