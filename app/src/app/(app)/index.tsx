import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { summarizeEntriesByBook } from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import { listBooks, type Book } from '@/domains/library/service';
import { sortBooksForShelf } from '@/domains/library/shelf';
import { ContinueReadingCard } from '@/components/ContinueReadingCard';
import { ShelfBook } from '@/components/ShelfBook';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { colors, leather, wood } from '@/lib/theme';

// Two covers per shelf: the owner tried three-across (Kindle density) and
// covers felt small; at true 2:3 full-bleed, two-across reads generous
// without going toy-like.
const BOOKS_PER_SHELF = 2;

function chunkIntoShelves(books: Book[]): Book[][] {
  const shelves: Book[][] = [];
  for (let i = 0; i < books.length; i += BOOKS_PER_SHELF) {
    shelves.push(books.slice(i, i + BOOKS_PER_SHELF));
  }
  return shelves;
}

/**
 * The QR-bookmark ribbon draped over the bookcase's top rail. It nudges
 * downward twice when the shelf appears - motion says "pull me" - then
 * rests. Tapping it opens bookmark management.
 */
function BookmarkRibbon() {
  const router = useRouter();
  const nudge = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timing = (toValue: number) =>
      Animated.timing(nudge, { toValue, duration: 240, useNativeDriver: true });
    const sequence = Animated.sequence([
      Animated.delay(1300),
      timing(1),
      timing(0),
      Animated.delay(220),
      timing(1),
      timing(0),
    ]);
    sequence.start();
    return () => sequence.stop();
  }, [nudge]);

  return (
    <Animated.View
      style={[
        styles.ribbonWrap,
        {
          transform: [
            { translateY: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }) },
          ],
        },
      ]}
    >
      <Pressable
        onPress={() => router.push('/bookmarks')}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Your QR bookmarks"
      >
        <View style={styles.ribbonBody}>
          <View style={styles.ribbonStripe} />
        </View>
        <View style={styles.ribbonTip} />
      </Pressable>
    </Animated.View>
  );
}

export default function LibraryScreen() {
  const router = useRouter();

  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });

  // Per-book re-entry cues (J4): when each book was last touched and where
  // the reader is, so multi-book readers can see which book to resume.
  const summariesQuery = useQuery({
    queryKey: queryKeys.entrySummaries,
    queryFn: listEntrySummaryRows,
  });
  const summaries = useMemo(
    () => summarizeEntriesByBook(summariesQuery.data ?? []),
    [summariesQuery.data],
  );

  // Research-backed shelf order: freshest active book lands top-left and
  // gets the gold spotlight; finished books settle onto the lower shelves.
  const sortedBooks = useMemo(
    () => sortBooksForShelf(booksQuery.data ?? [], summaries),
    [booksQuery.data, summaries],
  );
  const shelves = useMemo(() => chunkIntoShelves(sortedBooks), [sortedBooks]);
  // The freshest active book with at least one entry earns the hero card -
  // the "pick up where you left off" promotion, Kindle/Bookly style.
  const heroBook =
    sortedBooks.length > 0 &&
    !sortedBooks[0].finished_at &&
    summaries.get(sortedBooks[0].id)?.lastEntryAt
      ? sortedBooks[0]
      : null;
  const readingCount = sortedBooks.filter((b) => !b.finished_at).length;
  const finishedCount = sortedBooks.length - readingCount;
  const statLine = [
    readingCount > 0 ? `${readingCount} reading` : null,
    finishedCount > 0 ? `${finishedCount} finished` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Your bookshelf',
          // Settings behind a gear (J9): account, bookmarks, and support
          // live one tap away instead of crowding the shelf itself.
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      {booksQuery.isPending ? (
        <LoadingState label="Loading your shelf…" />
      ) : booksQuery.isError ? (
        <ErrorState
          error={booksQuery.error}
          fallback="Could not load your library."
          onRetry={() => void booksQuery.refetch()}
        />
      ) : booksQuery.data.length === 0 ? (
        <EmptyState message="Your shelf is empty. Add the book you are reading to start capturing entries." />
      ) : (
        <>
          {statLine ? <Text style={styles.statLine}>{statLine}</Text> : null}
          {heroBook ? (
            <ContinueReadingCard book={heroBook} summary={summaries.get(heroBook.id)} />
          ) : null}
          <View style={styles.bookcaseWrap}>
          {/* Back panel: plank seams and shaded sides give the case depth. */}
          <View style={styles.caseBackdrop} pointerEvents="none">
            <View style={styles.plankRow}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.plank} />
              ))}
            </View>
            <View style={[styles.caseSideShade, styles.caseSideLeft]} />
            <View style={[styles.caseSideShade, styles.caseSideRight]} />
          </View>
          <FlatList
            data={shelves}
            keyExtractor={(shelf) => shelf.map((book) => book.id).join('-')}
            style={styles.bookcase}
            contentContainerStyle={styles.bookcaseContent}
            renderItem={({ item: shelf }) => (
              <View style={styles.shelfUnit}>
                <View style={styles.shelfRow}>
                  {shelf.map((book) => (
                    <ShelfBook key={book.id} book={book} summary={summaries.get(book.id)} />
                  ))}
                  {/* Empty slots keep the grid geometry without filler chrome. */}
                  {shelf.length < BOOKS_PER_SHELF
                    ? Array.from({ length: BOOKS_PER_SHELF - shelf.length }).map((_, i) => (
                        <View key={`empty-${i}`} style={styles.emptySlot} pointerEvents="none" />
                      ))
                    : null}
                </View>
                <View style={styles.shelfBoardTop} />
                <View style={styles.shelfBoardFront} />
                <View style={styles.shelfShade} />
              </View>
            )}
          />
          {/* Crown molding across the case top; the ribbon hangs over it. */}
          <View style={styles.crown} pointerEvents="none">
            <View style={styles.crownTop} />
            <View style={styles.crownFront} />
            <View style={styles.crownShade} />
          </View>
          <BookmarkRibbon />
          </View>
        </>
      )}

      {/* Primary action floats bottom-right: the natural one-handed thumb
          zone (Hoober; Material FAB), keeping the top clear for the shelf. */}
      <Link href="/add-book" asChild>
        <Pressable
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Add a book"
        >
          <Ionicons name="add" size={30} color="#fffdf6" />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  statLine: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  bookcaseWrap: {
    flex: 1,
    position: 'relative',
  },
  caseBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: wood.back,
    borderRadius: 14,
    overflow: 'hidden',
  },
  plankRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  plank: {
    width: 2,
    backgroundColor: 'rgba(255, 236, 200, 0.07)',
  },
  caseSideShade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
  },
  caseSideLeft: {
    left: 0,
  },
  caseSideRight: {
    right: 0,
  },
  bookcase: {
    borderColor: wood.rail,
    borderWidth: 8,
    borderRadius: 14,
  },
  bookcaseContent: {
    padding: 12,
    paddingTop: 44,
    paddingBottom: 64,
  },
  crown: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
  },
  crownTop: {
    height: 9,
    backgroundColor: wood.boardTop,
  },
  crownFront: {
    height: 13,
    backgroundColor: wood.boardFront,
  },
  crownShade: {
    height: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  shelfUnit: {
    marginBottom: 14,
  },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 2,
  },
  emptySlot: {
    flex: 1,
  },
  // Leather ribbon draped over the crown - QR bookmarks live behind it.
  ribbonWrap: {
    position: 'absolute',
    top: 5,
    right: 24,
    zIndex: 10,
  },
  ribbonBody: {
    width: 24,
    height: 30,
    backgroundColor: leather.ribbon,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    alignItems: 'center',
    paddingTop: 5,
    elevation: 3,
    shadowColor: '#3f2f16',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  ribbonStripe: {
    width: 2,
    height: 20,
    backgroundColor: leather.thread,
    borderRadius: 1,
  },
  ribbonTip: {
    alignSelf: 'center',
    width: 17,
    height: 17,
    marginTop: -9,
    transform: [{ rotate: '45deg' }],
    backgroundColor: leather.ribbon,
  },
  shelfBoardTop: {
    height: 7,
    backgroundColor: wood.boardTop,
    marginHorizontal: -12,
  },
  shelfBoardFront: {
    height: 7,
    backgroundColor: wood.boardFront,
    marginHorizontal: -12,
  },
  shelfShade: {
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    marginHorizontal: -12,
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 58,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 6,
    shadowColor: '#3f2f16',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
