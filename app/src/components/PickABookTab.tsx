import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { BookClubCard } from '@/components/book/BookClubCard';
import { BookPickerRow } from '@/components/BookPickerRow';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { openSubscription, type PaywallSource } from '@/domains/billing/paywallSource';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { summarizeEntriesByBook } from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import type { Book } from '@/domains/library/service';
import { listBooks } from '@/domains/library/service';
import { sortBooksForShelf } from '@/domains/library/shelf';
import { queryKeys } from '@/lib/queryKeys';
import { colors, fonts, spacing } from '@/lib/theme';

export interface PickABookCopy {
  /** Screen title, e.g. "Recall". */
  title: string;
  /** Serif tagline under the title, e.g. "Remember what you read." */
  tagline: string;
  /** Sans lede for free readers. */
  freeLede: string;
  /** Sans lede for members. */
  memberLede: string;
  /** Muted grounding note under the lede, e.g. "Made only from your own entries." */
  groundingNote: string;
  /** Walnut card title for free readers, e.g. "Recall with Book Club". */
  lockCardTitle: string;
  /** Right-hand label beside the lock on the free list, e.g. "Recall locked". */
  lockedLabel: string;
  /** Muted hint under the member list, e.g. "Choose one book for your memory game." */
  memberFooter: string;
  /** Shown when the shelf is empty. */
  emptyMessage: string;
}

/**
 * The shared body of the Recall and Book Club tabs (D-094, after the Figma
 * "Recall · Free / Premium" and "Book Club · Free / Premium" screens). Both
 * are premium features grounded in one book's records, so both lead with
 * the same shape: title, serif tagline, a lede, the grounding note, then
 * the shelf. Free readers get the walnut Book Club card above a locked
 * "Your books" list (rows without a chevron); members get "Choose a book",
 * rows with a chevron, and a one-line hint. Either way a row hands the pick
 * to the caller, whose destination screen applies the real gate.
 */
export function PickABookTab({
  copy,
  paywallSource,
  onPickBook,
}: {
  copy: PickABookCopy;
  paywallSource: PaywallSource;
  onPickBook: (book: Book, context: { index: number; shelfSize: number; hasEntries: boolean }) => void;
}) {
  const router = useRouter();
  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });
  const summariesQuery = useQuery({
    queryKey: queryKeys.entrySummaries,
    queryFn: listEntrySummaryRows,
  });
  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });
  const entitled = entitlementQuery.data?.entitled === true;
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
        <EmptyState message={copy.emptyMessage} />
      </View>
    );
  }

  return (
    <FlatList
      data={sortedBooks}
      keyExtractor={(book) => String(book.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.title} accessibilityRole="header">
              {copy.title}
            </Text>
            <Text style={styles.tagline}>{copy.tagline}</Text>
            <Text style={styles.lede}>{entitled ? copy.memberLede : copy.freeLede}</Text>
            <Text style={styles.groundingNote}>{copy.groundingNote}</Text>
          </View>
          {entitled ? (
            <Text style={styles.listLabel}>Choose a book</Text>
          ) : (
            <>
              <BookClubCard
                title={copy.lockCardTitle}
                body="Your books and notes stay free."
                entitled={false}
                openLabel="Open"
                onPress={() => openSubscription(router, paywallSource)}
              />
              <View style={styles.lockedRow}>
                <Text style={styles.listLabel}>Your books</Text>
                <View style={styles.lockedLabelRow}>
                  <Ionicons name="lock-closed-outline" size={12} color={colors.muted} />
                  <Text style={styles.lockedLabel}>{copy.lockedLabel}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      }
      renderItem={({ item: book, index }) => (
        <BookPickerRow
          book={book}
          showChevron={entitled}
          last={index === sortedBooks.length - 1}
          onPress={() =>
            onPickBook(book, {
              index,
              shelfSize: sortedBooks.length,
              hasEntries: summaries.has(book.id),
            })
          }
        />
      )}
      ListFooterComponent={
        entitled ? <Text style={styles.footerHint}>{copy.memberFooter}</Text> : null
      }
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.lg,
    marginBottom: spacing.xs,
  },
  titleBlock: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 32,
    lineHeight: 40,
  },
  tagline: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 20,
    lineHeight: 28,
  },
  lede: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  groundingNote: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  listLabel: {
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  lockedLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  lockedLabel: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  footerHint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
