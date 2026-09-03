import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { summarizeEntriesByBook } from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import { listBooks } from '@/domains/library/service';
import { sortBooksForShelf } from '@/domains/library/shelf';
import { BookPickerRow } from '@/components/BookPickerRow';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { colors, fonts, gold } from '@/lib/theme';

/**
 * The Book Club tab (Interface v2.0): the companion's socratic dialogue,
 * promoted from a row inside each book to its own home destination - the
 * standout PRO feature. A book is chosen first, since the conversation is
 * grounded in that book's records alone; the chat itself lives on the
 * companion screen, which also offers the club snapshot for a date range.
 */
export default function BookClubTab() {
  const router = useRouter();
  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });
  const summariesQuery = useQuery({
    queryKey: queryKeys.entrySummaries,
    queryFn: listEntrySummaryRows,
  });
  const summaries = useMemo(
    () => summarizeEntriesByBook(summariesQuery.data ?? []),
    [summariesQuery.data],
  );
  const sortedBooks = useMemo(
    () => sortBooksForShelf(booksQuery.data ?? [], summaries),
    [booksQuery.data, summaries],
  );

  if (booksQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <LoadingState label="Fetching your shelf…" />
      </View>
    );
  }
  if (booksQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <ErrorState
          error={booksQuery.error}
          fallback="Could not load your books."
          onRetry={() => void booksQuery.refetch()}
        />
      </View>
    );
  }
  if (sortedBooks.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <EmptyState message="Add a book to your library first - the Book Club talks about one book at a time." />
      </View>
    );
  }

  return (
    <FlatList
      data={sortedBooks}
      keyExtractor={(book) => String(book.id)}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.rowGap} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="people" size={16} color={gold.deep} />
            <Text style={styles.badgeText}>A book club of two</Text>
          </View>
          <Text style={styles.lede}>
            Talk a book over, properly - questions, doubts, half-formed theories. The companion
            reads only your own records and never goes past your latest page. Choose the book
            first: every conversation is about one book alone.
          </Text>
          <Text style={styles.pickHeading}>Which book is on the table?</Text>
        </View>
      }
      renderItem={({ item: book }) => (
        <BookPickerRow
          book={book}
          onPress={() =>
            router.push({ pathname: '/companion', params: { id: String(book.id) } })
          }
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: gold.glowSoft,
    borderWidth: 1,
    borderColor: gold.base,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
  },
  badgeText: {
    fontFamily: fonts.serif,
    color: gold.deep,
    fontSize: 13,
    fontWeight: '700',
  },
  lede: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  pickHeading: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rowGap: {
    height: 10,
  },
});
