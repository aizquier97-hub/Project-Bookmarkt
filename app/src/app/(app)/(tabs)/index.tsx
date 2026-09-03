import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { summarizeEntriesByBook } from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import { listBooks } from '@/domains/library/service';
import { buildLibraryRows, sortBooksForShelf, type LibraryRow } from '@/domains/library/shelf';
import { BookCard } from '@/components/BookCard';
import { ContinueReadingCard } from '@/components/ContinueReadingCard';
import { ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, colors, fonts, gold } from '@/lib/theme';

// Three covers across, the grid density StoryGraph/Goodreads/Kindle use.
// Without the old bookcase borders the full content width is available, so
// covers stay generous at true 2:3.
const COLUMNS = 3;

/**
 * The library home (D-040): a clean, cover-first grid in the style of the
 * apps readers already know. Stats chips and the continue-reading hero lead;
 * "Currently reading" and "Finished" sections follow; adding a book floats
 * in the thumb zone. QR bookmarks and settings live on the tab bar.
 */
export default function LibraryScreen() {
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

  // Freshest active book first, then untouched books, then finished (J4).
  const sortedBooks = useMemo(
    () => sortBooksForShelf(booksQuery.data ?? [], summaries),
    [booksQuery.data, summaries],
  );
  const rows = useMemo(() => buildLibraryRows(sortedBooks, COLUMNS), [sortedBooks]);

  // The freshest active book with at least one entry earns the hero card -
  // the "pick up where you left off" promotion Kindle and StoryGraph lead with.
  const heroBook =
    sortedBooks.length > 0 &&
    !sortedBooks[0].finished_at &&
    summaries.get(sortedBooks[0].id)?.lastEntryAt
      ? sortedBooks[0]
      : null;
  const readingCount = sortedBooks.filter((b) => !b.finished_at).length;
  const finishedCount = sortedBooks.length - readingCount;

  const renderRow = ({ item }: { item: LibraryRow }) => {
    if (item.kind === 'section') {
      return (
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
          <Text style={styles.sectionCount}>{item.count}</Text>
        </View>
      );
    }
    return (
      <View style={styles.bookRow}>
        {item.books.map((book) => (
          <BookCard key={book.id} book={book} summary={summaries.get(book.id)} />
        ))}
        {/* Spacers keep partial rows on the same grid geometry. */}
        {item.books.length < COLUMNS
          ? Array.from({ length: COLUMNS - item.books.length }).map((_, i) => (
              <View key={`spacer-${i}`} style={styles.spacer} pointerEvents="none" />
            ))
          : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {booksQuery.isPending ? (
        <LoadingState label="Loading your library…" />
      ) : booksQuery.isError ? (
        <ErrorState
          error={booksQuery.error}
          fallback="Could not load your library."
          onRetry={() => void booksQuery.refetch()}
        />
      ) : booksQuery.data.length === 0 ? (
        // First-run welcome (J2): teach by inviting, not touring - a warm
        // promise and one obvious first step in place of a bare empty state.
        <View style={styles.welcomeWrap}>
          <Ionicons name="book-outline" size={44} color={colors.accent} />
          <Text style={styles.welcomeTitle}>Welcome to Bookmarkt</Text>
          <Text style={styles.welcomeBody}>
            Your reading, in your own words. Add the book you are reading, jot one line about
            where you are, and picking it back up - even weeks later - takes seconds, not pages.
          </Text>
          <Link href="/add-book" asChild>
            <Pressable
              style={styles.welcomeButton}
              accessibilityRole="button"
              accessibilityLabel="Add your first book"
            >
              <Ionicons name="add" size={20} color={gold.onFill} />
              <Text style={styles.welcomeButtonText}>Add your first book</Text>
            </Pressable>
          </Link>
          <Text style={styles.welcomeHint}>
            One sentence per sitting is plenty - your words, kept verbatim.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={styles.listContent}
          renderItem={renderRow}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Ionicons name="book-outline" size={13} color={colors.accent} />
                  <Text style={styles.chipText}>{readingCount} reading</Text>
                </View>
                {finishedCount > 0 ? (
                  <View style={styles.chip}>
                    <Ionicons name="checkmark-circle-outline" size={13} color={colors.accent} />
                    <Text style={styles.chipText}>{finishedCount} finished</Text>
                  </View>
                ) : null}
              </View>
              {heroBook ? (
                <ContinueReadingCard book={heroBook} summary={summaries.get(heroBook.id)} />
              ) : null}
            </View>
          }
        />
      )}

      {/* Primary action floats bottom-right: the natural one-handed thumb
          zone (Material FAB), sitting just above the tab bar. */}
      <Link href="/add-book" asChild>
        <Pressable style={styles.fab} accessibilityRole="button" accessibilityLabel="Add a book">
          <Ionicons name="add" size={30} color={gold.onFill} />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 96,
  },
  listHeader: {
    gap: 12,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 7,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionCount: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  bookRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  spacer: {
    flex: 1,
  },
  // The one primary action on the shelf: a physical gold button (D-054).
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 5,
    shadowColor: '#2a1c11',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  welcomeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  welcomeTitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  welcomeBody: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  welcomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 6,
    ...buttonShadow,
  },
  welcomeButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 16,
    fontWeight: '700',
  },
  welcomeHint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});
