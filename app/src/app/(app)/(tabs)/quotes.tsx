import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  listQuotes,
  saveQuoteReflection,
  setQuoteFavorite,
  type Quote,
} from '@/domains/entries/quotes';
import { countWords } from '@/domains/fitness/difficulty';
import { READING_MODEL_KEYS } from '@/domains/fitness/useReadingModel';
import { summarizeEntriesByBook } from '@/domains/entries/display';
import { listEntrySummaryRows } from '@/domains/entries/service';
import { listBooks, type Book } from '@/domains/library/service';
import { sortBooksForShelf } from '@/domains/library/shelf';
import { KeyboardPane } from '@/components/KeyboardPane';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { Button, CircleButton, SegmentedControl } from '@/components/ui';
import { queryKeys } from '@/lib/queryKeys';
import { cardShadow, colors, fonts, gold, radii, spacing } from '@/lib/theme';

type Filter = 'all' | 'favorites' | 'reflected';

/**
 * Favorite Quotes & Personal Analysis (D-062): every "[Quote]" the reader
 * has logged, across the whole library, on one shelf. Heart the ones that
 * matter; write a few lines about why. Reflections feed the comprehension
 * factor behind Reading Fitness, so thinking about a passage counts.
 */
export default function QuotesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Quote | null>(null);
  const [pickingBook, setPickingBook] = useState(false);

  const quotesQuery = useQuery({ queryKey: queryKeys.quotes, queryFn: listQuotes });
  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });
  // Shelf order for the picker (D-090): the book being read now first, then
  // the one before it, finished books last - the same order as the Library.
  const summariesQuery = useQuery({
    queryKey: queryKeys.entrySummaries,
    queryFn: listEntrySummaryRows,
  });
  const summaries = useMemo(
    () => summarizeEntriesByBook(summariesQuery.data ?? []),
    [summariesQuery.data],
  );

  const bookNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const book of booksQuery.data ?? []) {
      map.set(book.id, book.name);
    }
    return map;
  }, [booksQuery.data]);

  const favoriteMutation = useMutation({
    mutationFn: ({ quote, next }: { quote: Quote; next: boolean }) =>
      setQuoteFavorite(quote.entryId, next),
    onMutate: async ({ quote, next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.quotes });
      const previous = queryClient.getQueryData<Quote[]>(queryKeys.quotes);
      queryClient.setQueryData<Quote[]>(queryKeys.quotes, (current) =>
        (current ?? []).map((item) =>
          item.entryId === quote.entryId ? { ...item, isFavorite: next } : item,
        ),
      );
      return { previous };
    },
    onError: (err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.quotes, context.previous);
      }
      showToast(err instanceof Error ? err.message : 'Could not update the favorite.', 'error');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes });
    },
  });

  const quotes = useMemo(() => quotesQuery.data ?? [], [quotesQuery.data]);
  const visible = quotes.filter((quote) =>
    filter === 'favorites' ? quote.isFavorite : filter === 'reflected' ? Boolean(quote.reflection) : true,
  );

  const analysis = useMemo(() => summarize(quotes, bookNames), [quotes, bookNames]);

  // The circular "+" (D-089): one tap to log a quote. A single book goes
  // straight to its composer in quote mode; more than one asks which book.
  const books = useMemo(
    () => sortBooksForShelf(booksQuery.data ?? [], summaries),
    [booksQuery.data, summaries],
  );
  const openQuoteComposer = (bookId: number) => {
    setPickingBook(false);
    router.push({
      pathname: '/compose-entry',
      params: { id: String(bookId), mode: 'write', kind: 'quote', source: 'quotes_shelf' },
    });
  };
  const onAddQuote = () => {
    if (books.length === 0) {
      showToast('Add a book to your library first.', 'error');
      router.push('/library');
      return;
    }
    const reading = books.filter((book) => !book.finished_at);
    if (books.length === 1) {
      openQuoteComposer(books[0].id);
    } else if (reading.length === 1) {
      openQuoteComposer(reading[0].id);
    } else {
      setPickingBook(true);
    }
  };
  const header = (
    <Stack.Screen
      options={{
        title: 'Quotes',
        headerRight: () => (
          <CircleButton icon="add" accessibilityLabel="Add a quote" onPress={onAddQuote} />
        ),
      }}
    />
  );

  if (quotesQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        {header}
        <LoadingState label="Gathering your quotes…" />
      </View>
    );
  }
  if (quotesQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        {header}
        <ErrorState
          error={quotesQuery.error}
          fallback="Could not load your quotes."
          onRetry={() => void quotesQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={quotesQuery.isRefetching}
            onRefresh={() => void quotesQuery.refetch()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal analysis</Text>
          <View style={styles.statRow}>
            <Stat label="quotes" value={String(analysis.total)} />
            <Stat label="favorites" value={String(analysis.favorites)} />
            <Stat label="reflected" value={String(analysis.reflected)} />
            <Stat label="books" value={String(analysis.books)} />
          </View>
          <Text style={styles.cardBody}>
            {analysis.total === 0
              ? 'Log a quote from any book - use the Quote toggle when you add a bookmark - and it lands here.'
              : analysis.mostQuoted
                ? `You quote ${analysis.mostQuoted.name} most (${analysis.mostQuoted.count}). ` +
                  `${analysis.reflectionWords} words of reflection so far${
                    analysis.reflected > 0
                      ? ` - about ${Math.round(analysis.reflectionWords / analysis.reflected)} per quote`
                      : ''
                  }.`
                : `${analysis.reflectionWords} words of reflection so far.`}
          </Text>
        </View>

        <SegmentedControl<Filter>
          options={[
            { value: 'all', label: 'All' },
            { value: 'favorites', label: 'Favorites' },
            { value: 'reflected', label: 'With reflection' },
          ]}
          value={filter}
          onChange={setFilter}
        />

        {visible.length === 0 ? (
          <EmptyState
            message={
              filter === 'favorites'
                ? 'No favorites yet. Tap the heart on a quote you want to keep close.'
                : filter === 'reflected'
                  ? 'No reflections yet. Open a quote and write a line about why it landed.'
                  : 'No quotes logged yet.'
            }
          />
        ) : (
          visible.map((quote) => (
            <QuoteCard
              key={quote.entryId}
              quote={quote}
              bookName={quote.bookId !== null ? bookNames.get(quote.bookId) ?? null : null}
              onToggleFavorite={() =>
                favoriteMutation.mutate({ quote, next: !quote.isFavorite })
              }
              onReflect={() => setEditing(quote)}
              onOpen={() => {
                if (quote.bookId === null) {
                  return;
                }
                router.push({
                  pathname: '/entry/[entryId]',
                  params: { entryId: String(quote.entryId), book: String(quote.bookId) },
                });
              }}
            />
          ))
        )}
      </ScrollView>

      <BookPickerSheet
        visible={pickingBook}
        books={books}
        onPick={openQuoteComposer}
        onClose={() => setPickingBook(false)}
      />

      <ReflectionSheet
        quote={editing}
        bookName={editing?.bookId != null ? bookNames.get(editing.bookId) ?? null : null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void queryClient.invalidateQueries({ queryKey: queryKeys.quotes });
          for (const key of READING_MODEL_KEYS) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
        }}
      />
    </>
  );
}

function QuoteCard({
  quote,
  bookName,
  onToggleFavorite,
  onReflect,
  onOpen,
}: {
  quote: Quote;
  bookName: string | null;
  onToggleFavorite: () => void;
  onReflect: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open this entry">
        <Text style={styles.quoteMark} accessibilityElementsHidden importantForAccessibility="no">
          ”
        </Text>
        <Text style={styles.quoteBody}>“{quote.body}”</Text>
        <Text style={styles.quoteMeta}>
          {bookName ?? 'Unknown book'}
          {quote.boundaryLabel ? ` · ${quote.boundaryLabel}` : ''}
          {quote.createdAt ? ` · ${formatDate(quote.createdAt)}` : ''}
        </Text>
      </Pressable>
      {quote.reflection ? (
        <View style={styles.reflection}>
          <Text style={styles.reflectionLabel}>My reflection</Text>
          <Text style={styles.reflectionText}>{quote.reflection}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityLabel={quote.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          accessibilityState={{ selected: quote.isFavorite }}
          hitSlop={6}
        >
          <Ionicons
            name={quote.isFavorite ? 'heart' : 'heart-outline'}
            size={20}
            color={quote.isFavorite ? colors.danger : colors.muted}
          />
          <Text style={[styles.actionText, quote.isFavorite && styles.actionTextActive]}>
            {quote.isFavorite ? 'Favorited' : 'Favorite'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={onReflect}
          accessibilityRole="button"
          accessibilityLabel={quote.reflection ? 'Edit reflection' : 'Write a reflection'}
          hitSlop={6}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={19} color={colors.muted} />
          <Text style={styles.actionText}>{quote.reflection ? 'Edit reflection' : 'Reflect'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReflectionSheet({
  quote,
  bookName,
  onClose,
  onSaved,
}: {
  quote: Quote | null;
  bookName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [draft, setDraft] = useState('');

  // Start from the saved reflection each time a quote opens the sheet.
  useEffect(() => {
    if (quote) {
      setDraft(quote.reflection ?? '');
    }
  }, [quote]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!quote) {
        throw new Error('No quote selected.');
      }
      return saveQuoteReflection(quote.entryId, draft);
    },
    onSuccess: () => {
      showToast(draft.trim() ? 'Reflection saved.' : 'Reflection cleared.', 'success');
      onSaved();
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Could not save the reflection.', 'error');
    },
  });

  return (
    <Modal visible={quote !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <KeyboardPane style={styles.sheetPane}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Why this one?</Text>
            {quote ? (
              <Text style={styles.sheetQuote} numberOfLines={4}>
                “{quote.body}”
              </Text>
            ) : null}
            {bookName ? <Text style={styles.sheetMeta}>{bookName}</Text> : null}
            <TextInput
              style={styles.sheetInput}
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder="What it made you think, where it connects, why you kept it…"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <Text style={styles.sheetHint}>
              {countWords(draft)} {countWords(draft) === 1 ? 'word' : 'words'}. Reflections lift the
              comprehension score behind your Reading Fitness.
            </Text>
            <View style={styles.sheetActions}>
              <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.sheetButton} />
              <Button
                label="Save"
                onPress={() => mutation.mutate()}
                loading={mutation.isPending}
                disabled={mutation.isPending}
                accessibilityLabel="Save reflection"
                style={styles.sheetButton}
              />
            </View>
          </View>
        </KeyboardPane>
      </View>
    </Modal>
  );
}

function BookPickerSheet({
  visible,
  books,
  onPick,
  onClose,
}: {
  visible: boolean;
  books: readonly Book[];
  onPick: (bookId: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const ordered = books;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Which book is this quote from?</Text>
          <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
            {ordered.map((book) => (
              <Pressable
                key={book.id}
                style={({ pressed }) => [styles.pickerRow, pressed && styles.disabled]}
                onPress={() => onPick(book.id)}
                accessibilityRole="button"
                accessibilityLabel={`Add a quote from ${book.name}`}
              >
                <View style={styles.pickerBody}>
                  <Text style={styles.pickerTitle} numberOfLines={2}>
                    {book.name}
                  </Text>
                  {book.author ? (
                    <Text style={styles.pickerAuthor} numberOfLines={1}>
                      {book.author}
                      {book.finished_at ? ' · Finished' : ''}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function summarize(quotes: readonly Quote[], bookNames: ReadonlyMap<number, string>) {
  const counts = new Map<number, number>();
  let favorites = 0;
  let reflected = 0;
  let reflectionWords = 0;
  for (const quote of quotes) {
    if (quote.isFavorite) {
      favorites += 1;
    }
    if (quote.reflection) {
      reflected += 1;
      reflectionWords += countWords(quote.reflection);
    }
    if (quote.bookId !== null) {
      counts.set(quote.bookId, (counts.get(quote.bookId) ?? 0) + 1);
    }
  }
  let mostQuoted: { name: string; count: number } | null = null;
  for (const [bookId, count] of counts) {
    if (!mostQuoted || count > mostQuoted.count) {
      mostQuoted = { name: bookNames.get(bookId) ?? 'an untitled book', count };
    }
  }
  return {
    total: quotes.length,
    favorites,
    reflected,
    reflectionWords,
    books: counts.size,
    mostQuoted,
  };
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.md,
    ...cardShadow,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
  },
  cardBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 2,
  },
  quoteMark: {
    fontFamily: fonts.serif,
    fontSize: 40,
    lineHeight: 40,
    height: 28,
    color: gold.base,
    marginBottom: spacing.sm,
  },
  quoteBody: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 32,
    color: colors.text,
  },
  quoteMeta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: spacing.md,
  },
  reflection: {
    backgroundColor: colors.surface2,
    borderRadius: radii.button,
    padding: spacing.md,
    gap: spacing.xs,
  },
  reflectionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  reflectionText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
  },
  actionText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.muted,
  },
  actionTextActive: {
    color: colors.danger,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(42, 28, 17, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetPane: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
  },
  sheetQuote: {
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  sheetMeta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  sheetInput: {
    fontFamily: fonts.sans,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.field,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  sheetHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  sheetButton: {
    flex: 1,
  },
  pickerList: {
    maxHeight: 360,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerBody: {
    flex: 1,
    gap: 2,
  },
  pickerTitle: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 23,
    color: colors.text,
  },
  pickerAuthor: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  disabled: {
    opacity: 0.6,
  },
});
