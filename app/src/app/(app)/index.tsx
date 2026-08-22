import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { signOut } from '@/domains/auth/service';
import {
  formatBoundaryPosition,
  summarizeEntriesByBook,
} from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import { listBooks, type Book } from '@/domains/library/service';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { formatRelativeTime } from '@/lib/relativeTime';
import { cardShadow, colors, fonts, spineColorFor, wood } from '@/lib/theme';

const BOOKS_PER_SHELF = 2;

function chunkIntoShelves(books: Book[]): Book[][] {
  const shelves: Book[][] = [];
  for (let i = 0; i < books.length; i += BOOKS_PER_SHELF) {
    shelves.push(books.slice(i, i + BOOKS_PER_SHELF));
  }
  return shelves;
}

export default function LibraryScreen() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });
  const shelves = useMemo(() => chunkIntoShelves(booksQuery.data ?? []), [booksQuery.data]);

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

  // The most recently touched book becomes the one-tap "Continue reading"
  // card; ISO timestamps compare lexicographically.
  const continueReading = useMemo(() => {
    let best: { book: Book; lastEntryAt: string } | null = null;
    for (const book of booksQuery.data ?? []) {
      const summary = summaries.get(book.id);
      if (!summary || !summary.lastEntryAt) {
        continue;
      }
      if (!best || summary.lastEntryAt > best.lastEntryAt) {
        best = { book, lastEntryAt: summary.lastEntryAt };
      }
    }
    return best;
  }, [booksQuery.data, summaries]);

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
          <Pressable style={[styles.addButton, styles.actionFlex]}>
            <Text style={styles.addButtonText}>+ Add a book</Text>
          </Pressable>
        </Link>
        <Link href="/bookmarks" asChild>
          <Pressable style={[styles.bookmarksButton, styles.actionFlex]}>
            <Text style={styles.bookmarksButtonText}>My bookmarks</Text>
          </Pressable>
        </Link>
      </View>

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      {continueReading ? (
        <Link
          href={{ pathname: '/book/[id]', params: { id: String(continueReading.book.id) } }}
          asChild
        >
          <Pressable
            style={styles.continueCard}
            accessibilityRole="button"
            accessibilityLabel={`Continue reading ${continueReading.book.name}`}
          >
            <View
              style={[
                styles.continueSpine,
                { backgroundColor: spineColorFor(continueReading.book.id) },
              ]}
            />
            <View style={styles.continueBody}>
              <Text style={styles.continueKicker}>Continue reading</Text>
              <Text style={styles.continueTitle} numberOfLines={1}>
                {continueReading.book.name}
              </Text>
              <Text style={styles.continueMeta} numberOfLines={1}>
                {[
                  (() => {
                    const position = summaries.get(continueReading.book.id)?.position;
                    return position ? formatBoundaryPosition(position) : null;
                  })(),
                  (() => {
                    const relative = formatRelativeTime(continueReading.lastEntryAt);
                    return relative ? `last entry ${relative}` : null;
                  })(),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Text style={styles.continueArrow}>›</Text>
          </Pressable>
        </Link>
      ) : null}

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
        <FlatList
          data={shelves}
          keyExtractor={(shelf) => shelf.map((book) => book.id).join('-')}
          style={styles.bookcase}
          contentContainerStyle={styles.bookcaseContent}
          renderItem={({ item: shelf }) => (
            <View style={styles.shelfUnit}>
              <View style={styles.shelfRow}>
                {shelf.map((book) => (
                  <Link
                    key={book.id}
                    href={{ pathname: '/book/[id]', params: { id: String(book.id) } }}
                    asChild
                  >
                    <Pressable style={styles.bookCover}>
                      <View
                        style={[styles.coverSpine, { backgroundColor: spineColorFor(book.id) }]}
                      />
                      <View style={styles.coverBody}>
                        <Text style={styles.coverTitle} numberOfLines={4}>
                          {book.name}
                        </Text>
                        <View>
                          {book.author ? (
                            <Text style={styles.coverAuthor} numberOfLines={1}>
                              {book.author}
                            </Text>
                          ) : null}
                          {(() => {
                            const summary = summaries.get(book.id);
                            if (summary && summary.position) {
                              return (
                                <Text style={styles.coverPosition} numberOfLines={1}>
                                  {formatBoundaryPosition(summary.position)}
                                </Text>
                              );
                            }
                            if (summary && summary.lastEntryAt) {
                              return <Text style={styles.coverPosition}>In progress</Text>;
                            }
                            if (book.total_pages) {
                              return (
                                <Text style={styles.coverPages}>{book.total_pages} pages</Text>
                              );
                            }
                            return null;
                          })()}
                        </View>
                      </View>
                    </Pressable>
                  </Link>
                ))}
                {shelf.length < BOOKS_PER_SHELF ? <View style={styles.coverSpacer} /> : null}
              </View>
              <View style={styles.shelfBoardTop} />
              <View style={styles.shelfBoardFront} />
            </View>
          )}
        />
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
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionFlex: {
    flex: 1,
  },
  addButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  bookmarksButton: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bookmarksButtonText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
  },
  bookcase: {
    backgroundColor: wood.back,
    borderColor: wood.rail,
    borderWidth: 8,
    borderRadius: 14,
  },
  bookcaseContent: {
    padding: 12,
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
  bookCover: {
    flex: 1,
    minHeight: 165,
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
    ...cardShadow,
  },
  coverSpine: {
    width: 9,
  },
  coverBody: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  coverTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  coverAuthor: {
    color: colors.muted,
    fontSize: 12,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    marginTop: 8,
  },
  coverPages: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  coverPosition: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 14,
    overflow: 'hidden',
    ...cardShadow,
  },
  continueSpine: {
    alignSelf: 'stretch',
    width: 6,
  },
  continueBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  continueKicker: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  continueTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  continueMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  continueArrow: {
    color: colors.accent,
    fontSize: 26,
    fontWeight: '700',
    paddingHorizontal: 14,
  },
  coverSpacer: {
    flex: 1,
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
