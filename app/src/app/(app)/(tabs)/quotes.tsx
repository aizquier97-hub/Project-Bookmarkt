import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { listBooks } from '@/domains/library/service';
import { KeyboardPane } from '@/components/KeyboardPane';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

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

  const quotesQuery = useQuery({ queryKey: queryKeys.quotes, queryFn: listQuotes });
  const booksQuery = useQuery({ queryKey: queryKeys.books, queryFn: listBooks });

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

  if (quotesQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <LoadingState label="Gathering your quotes…" />
      </View>
    );
  }
  if (quotesQuery.isError) {
    return (
      <View style={styles.stateContainer}>
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
            <Stat label="Quotes" value={String(analysis.total)} />
            <Stat label="Favorites" value={String(analysis.favorites)} />
            <Stat label="Reflected" value={String(analysis.reflected)} />
            <Stat label="Books" value={String(analysis.books)} />
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

        <View style={styles.filterRow}>
          {(
            [
              ['all', 'All'],
              ['favorites', 'Favorites'],
              ['reflected', 'With reflection'],
            ] as const
          ).map(([value, label]) => {
            const active = filter === value;
            return (
              <Pressable
                key={value}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

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
        <Text style={styles.quoteBody}>“{quote.body}”</Text>
        <Text style={styles.quoteMeta}>
          {bookName ?? 'Unknown book'}
          {quote.boundaryLabel ? ` - ${quote.boundaryLabel}` : ''}
          {quote.createdAt ? ` - ${formatDate(quote.createdAt)}` : ''}
        </Text>
      </Pressable>
      {quote.reflection ? (
        <View style={styles.reflection}>
          <Ionicons name="create-outline" size={14} color={colors.accent} />
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
              comprehension factor behind your Reading Fitness.
            </Text>
            <View style={styles.sheetActions}>
              <Pressable style={styles.secondaryButton} onPress={onClose} accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, mutation.isPending && styles.disabled]}
                onPress={() => mutation.mutate()}
                disabled={mutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Save reflection"
              >
                {mutation.isPending ? (
                  <ActivityIndicator color={gold.onFill} />
                ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardPane>
      </View>
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
    padding: 16,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    ...cardShadow,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  cardBody: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
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
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontFamily: fonts.serif,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: colors.walnut,
    borderColor: colors.walnut,
  },
  filterText: {
    fontFamily: fonts.serif,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  filterTextActive: {
    color: colors.onWalnut,
  },
  quoteBody: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
  },
  quoteMeta: {
    fontFamily: fonts.serif,
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
  },
  reflection: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    padding: 10,
  },
  reflectionText: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontFamily: fonts.serif,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  actionTextActive: {
    color: colors.danger,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(25, 16, 8, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetPane: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 18,
    gap: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sheetQuote: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    fontStyle: 'italic',
  },
  sheetMeta: {
    fontFamily: fonts.serif,
    fontSize: 12,
    color: colors.muted,
  },
  sheetInput: {
    fontFamily: fonts.serif,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  sheetHint: {
    fontFamily: fonts.serif,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 13,
    ...buttonShadow,
  },
  primaryButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontWeight: '600',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.6,
  },
});
