import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { summarizeEntriesByBook } from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import { listBooks } from '@/domains/library/service';
import { sortBooksForShelf } from '@/domains/library/shelf';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { BookPickerRow } from '@/components/BookPickerRow';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { colors, fonts, gold, spacing } from '@/lib/theme';

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
          <Ionicons name="people-outline" size={28} color={gold.base} />
          <Text style={styles.title} accessibilityRole="header">
            A book club of two
          </Text>
          <Text style={styles.subtitle}>
            Talk a book over, properly - questions, doubts, half-formed theories.
          </Text>
          <Text style={styles.lede}>
            The companion reads only your own records and never goes past your latest page. Choose
            the book first: every conversation is about one book alone.
          </Text>
          <Text style={styles.pickHeading}>Which book is on the table?</Text>
        </View>
      }
      renderItem={({ item: book, index }) => (
        <BookPickerRow
          book={book}
          onPress={() => {
            // Club funnel (D-087): which shelf position gets picked and
            // whether that book has notes to talk about - before the
            // companion's own gate decides what the reader sees.
            trackAnalyticsEvent(
              'club_book_picked',
              {
                shelfIndex: index,
                shelfSize: sortedBooks.length,
                hasEntries: summaries.has(book.id),
                finished: Boolean(book.finished_at),
              },
              book.id,
            );
            router.push({ pathname: '/companion', params: { id: String(book.id) } });
          }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 32,
    lineHeight: 40,
  },
  subtitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 20,
    lineHeight: 28,
  },
  lede: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  pickHeading: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
  rowGap: {
    height: spacing.md,
  },
});
