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
import { listBooks, type Book } from '@/domains/library/service';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
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
                          {book.total_pages ? (
                            <Text style={styles.coverPages}>{book.total_pages} pages</Text>
                          ) : null}
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
