import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { signOut } from '@/domains/auth/service';
import { summarizeEntriesByBook } from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import { listBooks, type Book } from '@/domains/library/service';
import { sortBooksForShelf } from '@/domains/library/shelf';
import { ShelfBook } from '@/components/ShelfBook';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { colors, leather, spineColorFor, wood } from '@/lib/theme';

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
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

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
  const spotlightId =
    sortedBooks.length > 0 &&
    !sortedBooks[0].finished_at &&
    summaries.get(sortedBooks[0].id)?.lastEntryAt
      ? sortedBooks[0].id
      : null;

  const handleSignOut = async () => {
    try {
      await signOut();
      // Cross-account hygiene: drop every cached row before the next user.
      queryClient.clear();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Your bookshelf',
          headerRight: () => (
            <Pressable onPress={handleSignOut} hitSlop={8}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          ),
        }}
      />

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

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
                    <ShelfBook
                      key={book.id}
                      book={book}
                      summary={summaries.get(book.id)}
                      spotlight={book.id === spotlightId}
                    />
                  ))}
                  {shelf.length < BOOKS_PER_SHELF ? (
                    <View style={styles.restingStack} pointerEvents="none">
                      <View
                        style={[
                          styles.restingBook,
                          {
                            backgroundColor: spineColorFor(5),
                            width: '58%',
                            transform: [{ rotate: '-2deg' }],
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.restingBook,
                          { backgroundColor: spineColorFor(2), width: '72%' },
                        ]}
                      />
                      <View
                        style={[
                          styles.restingBook,
                          { backgroundColor: spineColorFor(8), width: '84%' },
                        ]}
                      />
                    </View>
                  ) : null}
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
      )}

      <Link href="/report-issue" asChild>
        <Pressable style={styles.reportLink} hitSlop={8}>
          <Text style={styles.reportLinkText}>Something broken? Report an issue</Text>
        </Pressable>
      </Link>

      {/* Primary action floats bottom-right: the natural one-handed thumb
          zone (Hoober; Material FAB), keeping the top clear for the shelf. */}
      <Link href="/add-book" asChild>
        <Pressable
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Add a book"
        >
          <Text style={styles.fabText}>+</Text>
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
  signOut: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: colors.danger,
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
    backgroundColor: 'rgba(122, 89, 45, 0.16)',
  },
  caseSideShade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 14,
    backgroundColor: 'rgba(63, 47, 22, 0.08)',
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
    backgroundColor: 'rgba(63, 47, 22, 0.22)',
  },
  shelfUnit: {
    marginBottom: 14,
  },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 2,
  },
  // A casual pile of books fills an odd shelf slot - lived-in, not empty.
  restingStack: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 2,
  },
  restingBook: {
    height: 12,
    borderRadius: 3,
    marginTop: 3,
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
    backgroundColor: 'rgba(63, 47, 22, 0.14)',
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
  fabText: {
    color: '#fffdf6',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '600',
  },
  reportLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  reportLinkText: {
    color: colors.muted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
