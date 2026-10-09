import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BookClubCard } from '@/components/book/BookClubCard';
import { BookHeroCompact } from '@/components/book/BookHeroCompact';
import { JournalEntryCard } from '@/components/book/JournalEntryCard';
import { SectionFooterActions } from '@/components/book/SectionFooterActions';
import { bookSectionStyles as shared } from '@/components/book/shared';
import { CharacterSuggestions } from '@/components/CharacterSuggestions';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Chip, ChipRow, StickyFooter } from '@/components/ui';
import {
  CompanionRequestError,
  refreshEntrySummaries,
  requestFlagSuggestions,
  searchEntriesByMeaning,
  type CompanionFlagSuggestion,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { entrySummaryIsStale, splitEntryText } from '@/domains/entries/display';
import { useLastSavedNote } from '@/domains/entries/lastSaved';
import { flagEntryTextImportant, parseEntryKind } from '@/domains/entries/markers';
import { listEntries, updateEntry, type Entry } from '@/domains/entries/service';
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { queryKeys } from '@/lib/queryKeys';
import { formatRelativeTime } from '@/lib/relativeTime';
import { cardShadow, colors, fonts, radii, spacing } from '@/lib/theme';

// One-time "search by meaning" explainer flag (D-052).
const MEANING_INTRO_KEY = 'semantic_search_intro_seen';
// Journal search signal (D-086) waits for typing to settle before one event.
const ENTRY_SEARCH_SIGNAL_DELAY_MS = 900;

/**
 * The book's journal on its own screen (D-093). Entries are cards with the
 * day, page range, and a headline (the companion's summary for Book Club
 * readers); the footer writes or speaks a new entry on /compose-entry.
 */
export default function BookJournalScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { note: lastSavedNote, dismiss: dismissLastSavedNote } = useLastSavedNote(bookId);

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
    enabled: validId,
  });
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
    enabled: validId,
  });
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });
  const companionEntitled = entitlementQuery.data?.entitled === true;

  // Search plus kind filters keep a long journal scannable. The search
  // field hides behind the header's magnifier until asked for (D-093).
  const [searchOpen, setSearchOpen] = useState(false);
  const [entrySearch, setEntrySearch] = useState('');
  const [entryFilter, setEntryFilter] = useState<'all' | 'quote' | 'important'>('all');
  const [meaningMatches, setMeaningMatches] = useState<{ query: string; ids: number[] } | null>(
    null,
  );
  const hasMarkedEntries = useMemo(
    () => entries.some((entry) => parseEntryKind(splitEntryText(entry.text).body).kind !== 'note'),
    [entries],
  );
  const visibleEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();
    const filter = hasMarkedEntries ? entryFilter : 'all';
    const meaningIds = meaningMatches ? new Set(meaningMatches.ids) : null;
    return entries.filter((entry) => {
      const parts = splitEntryText(entry.text);
      const marked = parseEntryKind(parts.body);
      if (filter !== 'all' && marked.kind !== filter) {
        return false;
      }
      if (meaningIds) {
        return meaningIds.has(entry.id);
      }
      if (!query) {
        return true;
      }
      return `${parts.boundaryLabel ?? ''} ${marked.body}`.toLowerCase().includes(query);
    });
  }, [entries, entrySearch, entryFilter, hasMarkedEntries, meaningMatches]);

  // Zero-result journal searches (D-086): one debounced signal per settled
  // query with the match count only - the words stay on the device.
  const entrySearchLength = entrySearch.trim().length;
  const visibleCount = visibleEntries.length;
  useEffect(() => {
    if (entrySearchLength < 2 || meaningMatches) {
      return;
    }
    const timer = setTimeout(() => {
      trackAnalyticsEvent(
        'entry_search_used',
        { matches: visibleCount, zeroResults: visibleCount === 0, entries: entries.length },
        bookId,
      );
    }, ENTRY_SEARCH_SIGNAL_DELAY_MS);
    return () => clearTimeout(timer);
    // Re-arm on the query only: a background refetch should not re-emit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySearch, entrySearchLength, meaningMatches, bookId]);

  // Companion aid (D-039, premium): AI-suggested important flags over the
  // timeline. Transient - the reader confirms every saved word (D-012).
  const [flagSuggestions, setFlagSuggestions] = useState<CompanionFlagSuggestion[] | null>(null);
  const [flagsIntro, setFlagsIntro] = useState<string | null>(null);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const flagsMutation = useMutation({
    mutationFn: () => requestFlagSuggestions(bookId),
    onMutate: () => {
      setFlagsError(null);
      setFlagSuggestions(null);
      setFlagsIntro(null);
    },
    onSuccess: (result) => {
      setFlagSuggestions(result.suggestions);
      setFlagsIntro(result.reply.content || null);
      trackAnalyticsEvent('companion_tool_used', { tool: 'suggest_flags', status: 'succeeded' }, bookId);
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'suggest_flags', status }, bookId);
      setFlagsError(
        err instanceof CompanionRequestError ? err.message : 'The companion could not help just now.',
      );
    },
  });
  const applyFlagMutation = useMutation({
    mutationFn: (entry: Entry) => updateEntry(entry.id, bookId, flagEntryTextImportant(entry.text)),
    onSuccess: (_data, entry) => {
      setFlagSuggestions((prev) => (prev ?? []).filter((s) => s.entryId !== entry.id));
      trackAnalyticsEvent('entry_flag_applied', { source: 'suggestion' }, bookId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activityEntries });
    },
    onError: () => {
      setFlagsError('The flag could not be saved. Please try again.');
    },
  });

  // Search by meaning (D-052). First use shows a one-time explainer.
  const [showMeaningIntro, setShowMeaningIntro] = useState(false);
  const [meaningError, setMeaningError] = useState<string | null>(null);
  const meaningMutation = useMutation({
    mutationFn: (query: string) => searchEntriesByMeaning(bookId, query),
    onMutate: () => {
      setMeaningError(null);
      setMeaningMatches(null);
    },
    onSuccess: (result, query) => {
      setMeaningMatches({ query, ids: result.results.map((r) => r.entryId) });
      trackAnalyticsEvent(
        'semantic_search_used',
        { status: 'succeeded', matches: result.results.length },
        bookId,
      );
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('semantic_search_used', { status }, bookId);
      setMeaningError(
        err instanceof CompanionRequestError
          ? err.message
          : 'The search could not run just now. Please try again.',
      );
    },
  });
  const startMeaningSearch = async () => {
    const query = entrySearch.trim();
    if (query.length < 3 || meaningMutation.isPending) {
      return;
    }
    const seen = await AsyncStorage.getItem(MEANING_INTRO_KEY).catch(() => null);
    if (!seen) {
      setShowMeaningIntro(true);
      return;
    }
    meaningMutation.mutate(query);
  };
  const confirmMeaningIntro = () => {
    setShowMeaningIntro(false);
    void AsyncStorage.setItem(MEANING_INTRO_KEY, 'seen').catch(() => undefined);
    meaningMutation.mutate(entrySearch.trim());
  };

  // Card summaries: when entitled and any is missing or stale, one batched
  // companion call refreshes them. Cards fall back to the reader's words.
  const summariesRequestedRef = useRef(false);
  useEffect(() => {
    if (!companionEntitled || summariesRequestedRef.current || entries.length === 0) {
      return;
    }
    if (!entries.some((entry) => entrySummaryIsStale(entry))) {
      return;
    }
    summariesRequestedRef.current = true;
    refreshEntrySummaries(bookId)
      .then((result) => {
        if (result.summaries.length > 0) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
        }
      })
      .catch(() => undefined);
  }, [companionEntitled, entries, bookId, queryClient]);

  // Writing happens on its own page (D-092).
  const openComposer = (mode: 'write' | 'speak') => {
    router.push({
      pathname: '/compose-entry',
      params: { id: String(bookId), mode, source: 'capture_bar' },
    });
  };

  const screenOptions = <Stack.Screen options={{ title: 'Journal', headerBackTitle: 'Book' }} />;

  if (!validId) {
    return (
      <View style={[shared.flex, styles.invalid]}>
        {screenOptions}
        <Text style={shared.error}>This book link is not valid.</Text>
      </View>
    );
  }

  const latestRelative = formatRelativeTime(entries[0]?.created_at);
  const metaLine =
    entries.length === 0
      ? 'No entries yet'
      : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}${
          latestRelative ? ` · latest ${latestRelative}` : ''
        }`;
  const searchable = entries.length >= 6;
  const searchVisible = searchable && (searchOpen || entrySearch.length > 0);

  return (
    <View style={shared.flex}>
      {screenOptions}
      <BookHeroCompact book={bookQuery.data} entries={entries} />
      <FlatList
        data={visibleEntries}
        keyExtractor={(entry) => String(entry.id)}
        contentContainerStyle={shared.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={shared.sectionTitleRow}>
              <Text style={shared.sectionTitle} accessibilityRole="header">
                Your journal
              </Text>
              {searchable ? (
                <Pressable
                  style={shared.iconButton}
                  onPress={() => {
                    if (searchVisible) {
                      setEntrySearch('');
                      setMeaningMatches(null);
                      setShowMeaningIntro(false);
                    }
                    setSearchOpen(!searchVisible);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={searchVisible ? 'Close search' : 'Search your entries'}
                >
                  <Ionicons
                    name={searchVisible ? 'close-outline' : 'search-outline'}
                    size={22}
                    color={colors.text}
                  />
                </Pressable>
              ) : null}
            </View>
            <Text style={shared.sectionMeta}>{metaLine}</Text>

            {lastSavedNote && companionEntitled ? (
              <View style={styles.aidCard}>
                <Text style={styles.aidLabel}>Anyone new in that note?</Text>
                <CharacterSuggestions
                  key={lastSavedNote.id}
                  bookId={bookId}
                  noteText={lastSavedNote.text}
                  firstNoted={lastSavedNote.firstNoted}
                />
                <Pressable
                  style={shared.smallButtonGhost}
                  onPress={dismissLastSavedNote}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss character suggestions"
                >
                  <Text style={shared.smallButtonGhostText}>Done</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Free readers (D-093 Figma "Journal · Free reader"): the Book
                Club card sits above locked summary cards. Members reach the
                recap from the hub, so the card stays off their journal. */}
            {!companionEntitled && entitlementQuery.isSuccess && entries.length > 0 ? (
              <View style={styles.clubCardWrap}>
                <BookClubCard
                  title="Summarize with Book Club"
                  body="Your full entries are always free to open."
                  entitled={false}
                  openLabel="Read the recap"
                  onPress={() =>
                    router.push({ pathname: '/book-summary', params: { id: String(bookId) } })
                  }
                />
              </View>
            ) : null}

            {searchVisible ? (
              <TextInput
                style={[shared.input, shared.searchInput]}
                placeholder="Search your entries..."
                placeholderTextColor={colors.muted}
                value={entrySearch}
                onChangeText={(value) => {
                  setEntrySearch(value);
                  setMeaningMatches(null);
                  setShowMeaningIntro(false);
                }}
                autoFocus={entrySearch.length === 0}
                accessibilityLabel="Search your entries"
              />
            ) : null}
            {companionEntitled && searchVisible && entrySearch.trim().length >= 3 ? (
              <View style={styles.meaningBlock}>
                {showMeaningIntro ? (
                  <View style={styles.aidCard}>
                    <Text style={styles.aidLabel}>Search by meaning</Text>
                    <Text style={styles.aidSuggestion}>
                      The companion compares what your notes mean, not just the words they use —
                      “betrayal” can find the note where you wrote “he sold them out.” It only
                      reads the notes you already saved, and nothing about the search is kept.
                    </Text>
                    <View style={shared.cardActions}>
                      <Pressable
                        style={shared.smallButton}
                        onPress={confirmMeaningIntro}
                        accessibilityRole="button"
                        accessibilityLabel="Run the search by meaning"
                      >
                        <Text style={shared.smallButtonText}>Got it — search</Text>
                      </Pressable>
                      <Pressable
                        style={shared.smallButtonGhost}
                        onPress={() => setShowMeaningIntro(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Dismiss the explainer"
                      >
                        <Text style={shared.smallButtonGhostText}>Not now</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : meaningMutation.isPending ? (
                  <View style={styles.aidPendingRow}>
                    <ActivityIndicator size="small" color={colors.muted} />
                    <Text style={styles.aidPendingText}>Reading your notes…</Text>
                  </View>
                ) : meaningMatches ? (
                  <View style={styles.meaningResultRow}>
                    <Text style={styles.meaningResultText}>
                      {meaningMatches.ids.length === 0
                        ? 'Nothing in your notes reads close to that.'
                        : `${meaningMatches.ids.length} ${
                            meaningMatches.ids.length === 1 ? 'note reads' : 'notes read'
                          } close to “${meaningMatches.query}”`}
                    </Text>
                    <Pressable
                      onPress={() => setMeaningMatches(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Clear the meaning search"
                    >
                      <Text style={styles.meaningClearText}>Clear</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.flagsRow}
                    onPress={() => void startMeaningSearch()}
                    accessibilityRole="button"
                    accessibilityLabel="Search your notes by meaning"
                  >
                    <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
                    <Text style={styles.flagsRowText}>Search by meaning</Text>
                  </Pressable>
                )}
                {meaningError ? <Text style={shared.error}>{meaningError}</Text> : null}
              </View>
            ) : null}

            {hasMarkedEntries ? (
              <ChipRow style={styles.filterRow}>
                {(
                  [
                    ['all', 'All'],
                    ['quote', 'Quotes'],
                    ['important', 'Important'],
                  ] as const
                ).map(([filter, label]) => (
                  <Chip
                    key={filter}
                    label={label}
                    selected={entryFilter === filter}
                    onPress={() => setEntryFilter(filter)}
                  />
                ))}
              </ChipRow>
            ) : null}

            {companionEntitled && entries.length >= 3 ? (
              <View>
                {flagsMutation.isPending ? (
                  <View style={styles.aidPendingRow}>
                    <ActivityIndicator size="small" color={colors.muted} />
                    <Text style={styles.aidPendingText}>Reading your notes…</Text>
                  </View>
                ) : flagSuggestions === null ? (
                  <Pressable
                    style={styles.flagsRow}
                    onPress={() => flagsMutation.mutate()}
                    accessibilityRole="button"
                    accessibilityLabel="Ask the companion which moments look important"
                  >
                    <Ionicons name="flag-outline" size={14} color={colors.accent} />
                    <Text style={styles.flagsRowText}>Which moments look important?</Text>
                  </Pressable>
                ) : (
                  <View style={styles.aidCard}>
                    <View style={styles.flagsHeader}>
                      <Text style={styles.aidLabel}>
                        {flagsIntro ?? 'Moments that read like turning points'}
                      </Text>
                      <Pressable
                        onPress={() => {
                          setFlagSuggestions(null);
                          setFlagsIntro(null);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Close the suggestions"
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={18} color={colors.muted} />
                      </Pressable>
                    </View>
                    {flagSuggestions.length === 0 ? (
                      <Text style={styles.aidSuggestion}>
                        Nothing stands out as a turning point yet. You decide, of course.
                      </Text>
                    ) : (
                      flagSuggestions.map((suggestion) => {
                        const entry = entries.find((e) => e.id === suggestion.entryId);
                        if (!entry) {
                          return null;
                        }
                        const preview = parseEntryKind(splitEntryText(entry.text).body).body;
                        return (
                          <View key={suggestion.entryId} style={styles.flagSuggestion}>
                            <Text style={styles.flagPreview} numberOfLines={2}>
                              “{preview}”
                            </Text>
                            <Text style={styles.flagReason}>{suggestion.reason}</Text>
                            <View style={shared.cardActions}>
                              <Pressable
                                style={shared.smallButton}
                                onPress={() => applyFlagMutation.mutate(entry)}
                                disabled={applyFlagMutation.isPending}
                              >
                                <Text style={shared.smallButtonText}>Flag as important</Text>
                              </Pressable>
                              <Pressable
                                style={shared.smallButtonGhost}
                                onPress={() =>
                                  setFlagSuggestions((prev) =>
                                    (prev ?? []).filter((s) => s.entryId !== suggestion.entryId),
                                  )
                                }
                              >
                                <Text style={shared.smallButtonGhostText}>Skip</Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
                {flagsError ? <Text style={shared.error}>{flagsError}</Text> : null}
              </View>
            ) : null}

            {entriesQuery.isPending ? (
              <LoadingState label="Loading entries…" />
            ) : entriesQuery.isError ? (
              <ErrorState
                error={entriesQuery.error}
                fallback="Could not load entries."
                onRetry={() => void entriesQuery.refetch()}
              />
            ) : entries.length === 0 ? (
              <EmptyState message="No entries yet. One line about where you are is a perfect start." />
            ) : visibleEntries.length === 0 ? (
              <EmptyState
                message={
                  entrySearch.trim()
                    ? 'No entries match your search.'
                    : entryFilter === 'quote'
                      ? 'No quotes logged yet.'
                      : 'No important moments flagged yet.'
                }
              />
            ) : null}
          </View>
        }
        renderItem={({ item: entry }) => (
          <JournalEntryCard
            entry={entry}
            entitled={companionEntitled}
            onPress={() =>
              router.push({
                pathname: '/entry/[entryId]',
                params: { entryId: String(entry.id), book: String(bookId) },
              })
            }
          />
        )}
      />
      <StickyFooter>
        <SectionFooterActions
          primaryLabel="Write an entry"
          primaryIcon="create-outline"
          onPrimary={() => openComposer('write')}
          squareIcon="mic-outline"
          squareLabel="Speak an entry"
          onSquare={() => openComposer('speak')}
        />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  invalid: { padding: spacing.lg },
  clubCardWrap: { marginBottom: spacing.xs },
  filterRow: { marginBottom: spacing.xs },
  aidCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 12,
    marginBottom: 12,
    gap: 8,
    ...cardShadow,
  },
  aidLabel: {
    fontFamily: fonts.sansMedium,
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  aidSuggestion: { fontFamily: fonts.sans, color: colors.text, fontSize: 14, lineHeight: 21 },
  aidPendingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  aidPendingText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13 },
  flagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    marginBottom: 12,
    ...cardShadow,
  },
  flagsRowText: { fontFamily: fonts.sansSemiBold, color: colors.text, fontSize: 13 },
  flagsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flagSuggestion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    gap: 4,
  },
  flagPreview: { fontFamily: fonts.sans, color: colors.text, fontSize: 13 },
  flagReason: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12, lineHeight: 17 },
  meaningBlock: { marginTop: 6, marginBottom: 6 },
  meaningResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    ...cardShadow,
  },
  meaningResultText: { fontFamily: fonts.sans, color: colors.text, fontSize: 13, flex: 1 },
  meaningClearText: { fontFamily: fonts.sansSemiBold, color: colors.accent, fontSize: 13 },
});
