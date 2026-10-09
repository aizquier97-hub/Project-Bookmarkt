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
import { colors, fonts, gold, radii, spacing } from '@/lib/theme';

/**
 * The Recall tab (D-066, formerly Cue Cards): a timed memory-match game
 * dealt only from the reader's own entries and character maps. Book first,
 * board second - each board covers one book. The game itself lives on the
 * match screen.
 */
export default function RecallTab() {
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
        <EmptyState message="Add a book to your library first - each Recall board covers one book." />
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
          <View style={styles.tilePair} accessible accessibilityLabel="A cue tile and an answer tile">
            <View style={styles.tile}>
              <Ionicons name="bookmark-outline" size={26} color={gold.base} />
              <Text style={styles.tileLabel}>Cue</Text>
            </View>
            <View style={[styles.tile, styles.tileAnswer]}>
              <Ionicons name="bookmark-outline" size={26} color={gold.base} />
              <Text style={[styles.tileLabel, styles.tileLabelAnswer]}>Answer</Text>
            </View>
          </View>
          <Text style={styles.eyebrow}>Your words, remembered</Text>
          <Text style={styles.title} accessibilityRole="header">
            Recall before you reread
          </Text>
          <Text style={styles.subtitle}>
            A memory-match board dealt from your own records: a cue on one tile, the answer from
            your entries on another, all face down.
          </Text>
          <Text style={styles.lede}>
            Turn two at a time and pair them up against the clock. Every card comes from what you
            wrote, nothing else - and the small effort of recalling is what makes a book stay with
            you. Beat your best time, then deal new cards.
          </Text>
          <Text style={styles.pickHeading}>Which book should the board cover?</Text>
        </View>
      }
      renderItem={({ item: book, index }) => (
        <BookPickerRow
          book={book}
          onPress={() => {
            // Recall funnel (D-087): same shape as the club pick so the two
            // premium doors can be compared side by side.
            trackAnalyticsEvent(
              'recall_book_picked',
              {
                shelfIndex: index,
                shelfSize: sortedBooks.length,
                hasEntries: summaries.has(book.id),
                finished: Boolean(book.finished_at),
              },
              book.id,
            );
            router.push({ pathname: '/match', params: { id: String(book.id) } });
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
  tilePair: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  tile: {
    width: 104,
    height: 136,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  tileAnswer: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tileLabel: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tileLabelAnswer: {
    color: colors.onAccent,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
