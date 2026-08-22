import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBoundaryPosition, type BookPositionSummary } from '@/domains/entries/display';
import type { Book } from '@/domains/library/service';
import { computeCompletionPercent, shelfTitleTypography } from '@/domains/library/shelf';
import { colors, fonts, gold, leather, paper, spineColorFor } from '@/lib/theme';

/**
 * One book standing on the shelf. Real cover art renders full-bleed at true
 * 2:3 proportions with a bottom scrim progress bar while reading (white on
 * dark passes WCAG contrast over any artwork) and a gold corner medal once
 * finished - the badge-over-art treatments Kindle and Bookly use. Books
 * without art keep the painted 2.5D cover: cloth color, paper label, page
 * block, and the leather-and-gold collector set when finished. Tapping
 * pulls the book off the shelf, then opens it (core Animated, OTA-safe).
 */
export function ShelfBook({
  book,
  summary,
}: {
  book: Book;
  summary: BookPositionSummary | undefined;
}) {
  const router = useRouter();
  const pull = useRef(new Animated.Value(0)).current;
  const finished = Boolean(book.finished_at);
  // Finished books join the leather-bound collector set: one shared deep
  // leather, gold stamping, gilt page edges (Gestalt similarity groups the
  // trophy row; celebration, never dimmed-as-disabled).
  const cloth = finished ? leather.cover : spineColorFor(book.id);
  const percent = computeCompletionPercent(summary?.position ?? null, book.total_pages, finished);
  const titleType = shelfTitleTypography(book.name);
  // Real cover art when the reader picked one; broken images fall back to
  // the painted cloth cover so the shelf never shows a hole.
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => {
    setCoverFailed(false);
  }, [book.cover_url]);
  const showCover = Boolean(book.cover_url) && !coverFailed;

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
      <Animated.View style={pullStyle}>
        <Pressable
          style={[
            styles.cloth,
            { backgroundColor: cloth },
            showCover && styles.clothCover,
            finished && !showCover && styles.clothFinished,
          ]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={finished ? `${book.name}, finished` : book.name}
        >
          {showCover ? (
            <View style={styles.coverWrap}>
              {/* Full-bleed artwork: the image IS the book face, so it keeps
                  its true 2:3 shape (no painted strips squeezing it). */}
              <Image
                source={{ uri: book.cover_url ?? undefined }}
                style={styles.coverImage}
                contentFit="cover"
                transition={150}
                onError={() => setCoverFailed(true)}
                accessibilityLabel={`Cover of ${book.name}`}
              />
              {percent !== null && !finished ? (
                <View style={styles.scrim} pointerEvents="none">
                  <View style={styles.scrimTrack}>
                    <View style={[styles.scrimFill, { width: `${percent}%` }]} />
                  </View>
                  <Text style={styles.scrimText}>{percent}%</Text>
                </View>
              ) : null}
              {finished ? (
                <View style={styles.medal} pointerEvents="none">
                  <Ionicons name="trophy" size={12} color="#3a2b12" />
                </View>
              ) : null}
            </View>
          ) : (
            <>
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
                    <Text
                      style={[styles.author, finished && styles.authorFinished]}
                      numberOfLines={1}
                    >
                      {book.author}
                    </Text>
                  ) : null}
                  {finished ? (
                    <View style={styles.positionRow}>
                      <Ionicons name="trophy" size={10} color={leather.stamp} />
                      <Text style={[styles.position, styles.positionFinished, styles.positionInRow]}>
                        Finished
                      </Text>
                    </View>
                  ) : positionLine ? (
                    <Text style={styles.position} numberOfLines={1}>
                      {positionLine}
                    </Text>
                  ) : null}
                  {percent !== null ? (
                    <View style={styles.progressRow}>
                      <View
                        style={[styles.progressTrack, finished && styles.progressTrackFinished]}
                      >
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
              ) : (
                /* A soft shadow veil keeps painted covers quieter than real
                   art, so a fallback never outshines its neighbors. */
                <View style={styles.veil} pointerEvents="none" />
              )}
            </>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // All books share one size in a 2-across grid (owner: three felt small);
  // full-bleed 2:3 keeps two-across from going toy-like. The current read
  // is promoted by the hero card above the shelf, not by resizing books.
  slot: {
    flex: 1,
  },
  cloth: {
    // True book proportions (2:3, the ratio Goodreads/Bookly/StoryGraph
    // render covers at): height derives from the shared slot width, so
    // every cover stays identical AND real cover art keeps its shape.
    aspectRatio: 2 / 3,
    flexDirection: 'row',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
    overflow: 'hidden',
    // The border exists in BOTH states (transparent when unfinished):
    // toggling borderWidth on an elevated, clipped Android view hits a
    // redraw bug that leaves the cover painted as a solid color.
    borderWidth: 1.5,
    borderColor: 'transparent',
    elevation: 4,
    shadowColor: '#2b1c10',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 2, height: 4 },
  },
  clothCover: {
    // Real artwork has its own corners; keep the silhouette bookish but
    // don't paint spine strips over someone else's cover design. The
    // background goes transparent so no cloth color halos the art's edge.
    backgroundColor: 'transparent',
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  clothFinished: {
    borderColor: gold.base,
  },
  coverWrap: {
    flex: 1,
    position: 'relative',
  },
  coverImage: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  // Bottom scrim progress: white-on-dark stays readable over ANY artwork
  // (WCAG-safe), the pattern streaming and reading apps use over covers.
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(20, 13, 6, 0.62)',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  scrimTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 253, 246, 0.28)',
    overflow: 'hidden',
  },
  scrimFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: gold.base,
  },
  scrimText: {
    color: '#fffdf6',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  // Finished cover art keeps every inch of the artwork visible; the gold
  // corner medal is the Kindle finished-checkmark pattern, gilt-edged.
  medal: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: gold.base,
    borderWidth: 1,
    borderColor: 'rgba(58, 43, 18, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#2b1c10',
    shadowOpacity: 0.4,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
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
    marginVertical: 10,
    marginLeft: 6,
    marginRight: 5,
    borderRadius: 2,
    padding: 9,
    justifyContent: 'space-between',
  },
  // Collector's editions are gold-stamped straight onto the leather.
  paperLabelFinished: {
    backgroundColor: 'transparent',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  titleFinished: {
    color: leather.stamp,
  },
  author: {
    color: colors.muted,
    fontSize: 10,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
  },
  authorFinished: {
    color: 'rgba(232, 201, 121, 0.75)',
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  positionInRow: {
    marginTop: 0,
  },
  position: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
  },
  positionFinished: {
    color: leather.stamp,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.10)',
    overflow: 'hidden',
  },
  progressTrackFinished: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  progressFillFinished: {
    backgroundColor: gold.base,
  },
  progressText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  progressTextFinished: {
    color: leather.stamp,
  },
  pages: {
    width: 7,
    backgroundColor: paper.edge,
    marginVertical: 6,
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
    top: 4,
    left: 9,
    right: 7,
    bottom: 4,
    borderWidth: 1,
    borderColor: leather.tooling,
    borderRadius: 2,
  },
  finishedBand: {
    position: 'absolute',
    top: 10,
    right: -24,
    width: 88,
    transform: [{ rotate: '38deg' }],
    backgroundColor: gold.base,
    paddingVertical: 2,
    alignItems: 'center',
  },
  finishedBandText: {
    color: '#33291b',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  // Mutes the painted fallback (~14% ink) so it sits back beside real art;
  // finished painted books skip it - celebration is never dimmed.
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(43, 28, 16, 0.14)',
  },
});
