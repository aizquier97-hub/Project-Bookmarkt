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
 * The Cue Cards tab (Interface v2.0): flip-card decks drawn only from the
 * reader's own entries and character maps. Book first, deck second - each
 * deck covers one book. The deck itself lives on the cue-cards screen.
 */
export default function CueCardsTab() {
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
        <EmptyState message="Add a book to your library first - each cue-card deck covers one book." />
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
            <Ionicons name="albums" size={16} color={gold.deep} />
            <Text style={styles.badgeText}>Recall before you reread</Text>
          </View>
          <Text style={styles.lede}>
            A deck of real cue cards - terse on the front, the answer on the back, press to flip.
            Every card is drawn from your own entries and character maps, nothing else. The small
            effort of recalling is what makes a book stay with you.
          </Text>
          <Text style={styles.pickHeading}>Which book should the deck cover?</Text>
        </View>
      }
      renderItem={({ item: book }) => (
        <BookPickerRow
          book={book}
          onPress={() =>
            router.push({ pathname: '/cue-cards', params: { id: String(book.id) } })
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
