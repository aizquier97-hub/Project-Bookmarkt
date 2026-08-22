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
import { colors, wood } from '@/lib/theme';

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
      Animated.delay(800),
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
        <View style={styles.ribbonNotch} />
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

      <View style={styles.actionsRow}>
        <Link href="/add-book" asChild>
          <Pressable style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Add a book</Text>
          </Pressable>
        </Link>
      </View>

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
                  {shelf.length < BOOKS_PER_SHELF ? <View style={styles.coverSpacer} /> : null}
                </View>
                <View style={styles.shelfBoardTop} />
                <View style={styles.shelfBoardFront} />
              </View>
            )}
          />
          <BookmarkRibbon />
        </View>
      )}

      <Link href="/report-issue" asChild>
        <Pressable style={styles.reportLink} hitSlop={8}>
          <Text style={styles.reportLinkText}>Something broken? Report an issue</Text>
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
  actionsRow: {
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
  },
  bookcaseWrap: {
    flex: 1,
    position: 'relative',
  },
  bookcase: {
    backgroundColor: wood.back,
    borderColor: wood.rail,
    borderWidth: 8,
    borderRadius: 14,
  },
  bookcaseContent: {
    padding: 12,
    paddingTop: 16,
    paddingBottom: 4,
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
  coverSpacer: {
    flex: 1,
  },
  // Leather ribbon draped over the bookcase's top rail - QR bookmarks live
  // behind it.
  ribbonWrap: {
    position: 'absolute',
    top: 2,
    right: 22,
    zIndex: 10,
  },
  ribbonBody: {
    width: 26,
    height: 46,
    backgroundColor: colors.accent,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    alignItems: 'center',
    paddingTop: 6,
    elevation: 3,
    shadowColor: '#3f2f16',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  ribbonStripe: {
    width: 2,
    height: 30,
    backgroundColor: 'rgba(255, 253, 246, 0.55)',
    borderRadius: 1,
  },
  ribbonNotch: {
    alignSelf: 'center',
    width: 19,
    height: 19,
    marginTop: -10,
    transform: [{ rotate: '45deg' }],
    backgroundColor: wood.back,
  },
  shelfBoardTop: {
    height: 7,
    backgroundColor: wood.boardTop,
    borderRadius: 2,
  },
  shelfBoardFront: {
    height: 7,
    backgroundColor: wood.boardFront,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
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
