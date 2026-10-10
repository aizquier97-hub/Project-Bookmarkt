import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Link, Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { summarizeEntriesByBook } from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import { listBooks } from '@/domains/library/service';
import { buildLibraryRows, sortBooksForShelf, type LibraryRow } from '@/domains/library/shelf';
import { BookCard } from '@/components/BookCard';
import { ContinueReadingCard } from '@/components/ContinueReadingCard';
import { ErrorState, LoadingState } from '@/components/states';
import { Button, HeaderAction } from '@/components/ui';
import { queryKeys } from '@/lib/queryKeys';
import { colors, fonts, radii, spacing } from '@/lib/theme';

// Three covers across (D-096, after the Figma "Library" frame): the shelf
// reads as a shelf again - the owner found two across "too zoomed in" -
// with the title, author, and progress set beneath each cover in Lora / Inter.
const COLUMNS = 3;

/**
 * The library shelf (D-040; moved from home to /library in D-064 when the
 * Profile became the landing tab): a clean, cover-first grid in the style
 * of the apps readers already know. Stats chips and the continue-reading
 * hero lead; "Currently reading" and "Finished" sections follow; adding a
 * book floats in the thumb zone. QR bookmarks and settings live on the tab
 * bar.
 */
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
          <Text style={styles.sectionTitle}>
            {item.title}
            <Text style={styles.sectionCount}> · {item.count}</Text>
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.bookRow}>
        {item.books.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            summary={summaries.get(book.id)}
            columns={COLUMNS}
          />
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
      <Stack.Screen
        options={{
          title: 'Library',
          headerRight: () => (
            <HeaderAction
              label="+ Add book"
              accessibilityLabel="Add a book"
              onPress={() => router.push('/add-book')}
            />
          ),
        }}
      />
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
            <Button label="Add your first book" icon="add" style={styles.welcomeButton} />
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 40,
  },
  listHeader: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface2,
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    color: colors.text,
    fontSize: 13,
  },
  sectionRow: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
  },
  sectionCount: {
    color: colors.muted,
  },
  bookRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  spacer: {
    flex: 1,
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
  },
  welcomeBody: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  welcomeButton: {
    marginTop: spacing.sm,
  },
  welcomeHint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});
