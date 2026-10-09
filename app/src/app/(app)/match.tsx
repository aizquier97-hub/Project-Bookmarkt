import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CompanionRequestError,
  requestCueCards,
  type CompanionCueCard,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import {
  DECK_OVERLAP_CEILING,
  deckOverlap,
  formatClock,
  hasEnoughForBoard,
  MAX_PAIRS,
  MIN_PAIRS,
  NEED_MORE_MATERIAL,
  playableCards,
  type GameResult,
} from '@/domains/cueCards/memoryGame';
import { loadBestResult, recordResult } from '@/domains/cueCards/records';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { MemoryMatch } from '@/components/MemoryMatch';
import { PremiumOffer } from '@/components/PremiumOffer';
import { ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

/**
 * Recall match for one book (D-066, replacing the D-055 flip-card deck).
 * The companion writes cue cards from the reader's own entries and
 * character maps - nothing from outside the records, nothing past the
 * latest page - and the screen deals them straight onto a memory-match
 * board: a cue on one tile, the answer on another, pairs to be found
 * against a clock. After a win the reader can take new cards or play the
 * same ones reshuffled; a fresh deal that merely repeats the last one means
 * the records have run dry, and the game says so.
 */
export default function MatchScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });

  const screenTitle = <Stack.Screen options={{ title: 'Recall' }} />;

  if (!validId) {
    return (
      <View style={styles.stateContainer}>
        {screenTitle}
        <Text style={styles.stateText}>This book link is not valid.</Text>
      </View>
    );
  }
  if (entitlementQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        {screenTitle}
        <LoadingState label="Checking your companion access…" />
      </View>
    );
  }
  if (entitlementQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        {screenTitle}
        <ErrorState
          error={entitlementQuery.error}
          fallback="Could not check your companion access."
          onRetry={() => void entitlementQuery.refetch()}
        />
      </View>
    );
  }
  if (!entitlementQuery.data.entitled) {
    return (
      <View style={styles.flex}>
        {screenTitle}
        <PremiumOffer
          title="Recall match"
          source="match_lock"
          body="A memory-match board dealt only from your own entries and character maps, timed against your best. Pairing each cue with its answer is the little effort that makes the book stick."
        />
      </View>
    );
  }
  return <RecallMatch bookId={bookId} />;
}

function RecallMatch({ bookId }: { bookId: number }) {
  const [cards, setCards] = useState<CompanionCueCard[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A counter that re-keys the board for a reshuffle, the last clear and
  // whether it set the book's record, and the stored best for this board
  // size (D-066).
  const [boardKey, setBoardKey] = useState(0);
  const [win, setWin] = useState<{ result: GameResult; isRecord: boolean } | null>(null);
  const [best, setBest] = useState<GameResult | null>(null);

  const pairs = cards ? Math.min(playableCards(cards).length, MAX_PAIRS) : 0;

  useEffect(() => {
    if (pairs < MIN_PAIRS) {
      return;
    }
    let cancelled = false;
    void loadBestResult(bookId, pairs).then((stored) => {
      if (!cancelled) {
        setBest(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookId, pairs]);

  const dealMutation = useMutation({
    mutationFn: () => requestCueCards(bookId),
    onMutate: () => {
      setError(null);
      setNotice(null);
    },
    onSuccess: (result) => {
      trackAnalyticsEvent(
        'companion_tool_used',
        { tool: 'cue_cards', status: 'succeeded', cards: result.cards.length, mode: 'match' },
        bookId,
      );
      if (!hasEnoughForBoard(result.cards)) {
        setNotice(
          result.cards.length === 0 && result.reply.content
            ? result.reply.content
            : `A board needs at least ${MIN_PAIRS} cards. ${NEED_MORE_MATERIAL}`,
        );
        return;
      }
      if (cards && deckOverlap(cards, result.cards) >= DECK_OVERLAP_CEILING) {
        // A fresh board after a win: the companion varies its decks, so a
        // near-copy of the last one means the records have run dry. The
        // reader keeps the board they have, reshuffled.
        setNotice(NEED_MORE_MATERIAL);
        setWin(null);
        setBoardKey((key) => key + 1);
        return;
      }
      setCards(result.cards);
      setWin(null);
      setBoardKey((key) => key + 1);
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'cue_cards', status, mode: 'match' }, bookId);
      if (cards && err instanceof CompanionRequestError && err.quotaExceeded) {
        // Out of deals for today: the same cards, reshuffled, still make a game.
        setNotice("Today's deals are used up, so here is the same board reshuffled.");
        setWin(null);
        setBoardKey((key) => key + 1);
        return;
      }
      setError(
        err instanceof CompanionRequestError
          ? err.message
          : 'The board could not be dealt just now. Please try again.',
      );
    },
  });

  const reshuffle = () => {
    setNotice(null);
    setWin(null);
    setBoardKey((key) => key + 1);
  };

  const handleWon = useCallback(
    (result: GameResult) => {
      trackAnalyticsEvent(
        'companion_tool_used',
        {
          tool: 'cue_cards',
          mode: 'match',
          status: 'won',
          moves: result.turns,
          seconds: result.seconds,
          pairs: result.pairs,
        },
        bookId,
      );
      void recordResult(bookId, result).then(({ best: stored, isRecord }) => {
        setBest(stored);
        setWin({ result, isRecord });
      });
    },
    [bookId],
  );

  const dealButton = (label: string, accessibilityLabel: string) => (
    <Pressable
      style={styles.goldButton}
      onPress={() => dealMutation.mutate()}
      disabled={dealMutation.isPending}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {dealMutation.isPending ? (
        <ActivityIndicator size="small" color={gold.onFill} />
      ) : (
        <>
          <Ionicons name="sparkles" size={15} color={gold.onFill} />
          <Text style={styles.goldButtonText}>{label}</Text>
        </>
      )}
    </Pressable>
  );

  if (!cards) {
    return (
      <ScrollView contentContainerStyle={styles.introContainer}>
        <Stack.Screen options={{ title: 'Recall' }} />
        <View style={styles.introCard}>
          <Ionicons name="extension-puzzle-outline" size={28} color={gold.deep} />
          <Text style={styles.introTitle}>Deal a board</Text>
          <Text style={styles.introBody}>
            Up to {MAX_PAIRS} cue cards written from your own entries and character maps - nothing
            from outside your records, nothing past your latest page - dealt face down. Turn two
            tiles at a time and pair each cue with its answer. The clock starts on your first turn.
          </Text>
          {dealButton('Deal a board', 'Deal a memory-match board')}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    );
  }

  if (win) {
    const { result, isRecord } = win;
    return (
      <ScrollView contentContainerStyle={styles.winContainer}>
        <Stack.Screen options={{ title: 'Recall' }} />
        <View style={styles.winCard}>
          <Ionicons
            name={isRecord ? 'trophy-outline' : 'ribbon-outline'}
            size={28}
            color={gold.deep}
          />
          <Text style={styles.winTitle}>{isRecord ? 'New record' : 'Every pair found'}</Text>
          <View style={styles.resultRow}>
            <ResultStat label="Time" value={formatClock(result.seconds)} />
            <ResultStat label="Turns" value={String(result.turns)} />
            <ResultStat label="Best" value={best ? formatClock(best.seconds) : '-'} />
          </View>
          <Text style={styles.winBody}>
            {result.pairs} pairs in {result.turns} {result.turns === 1 ? 'turn' : 'turns'}.
            {isRecord
              ? ' Your fastest clear of a board this size for this book.'
              : best
                ? ` Your best is ${formatClock(best.seconds)}.`
                : ''}{' '}
            Deal new cues from your records, or play these again in a new order.
          </Text>
          {dealButton('New cards', 'Deal a fresh board from new cards')}
          <Pressable
            style={styles.navButton}
            onPress={reshuffle}
            disabled={dealMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Play the same cards again, reshuffled"
          >
            <Ionicons name="shuffle" size={16} color={colors.text} />
            <Text style={styles.navButtonText}>Same cards, reshuffled</Text>
          </Pressable>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.boardContainer}>
      <Stack.Screen options={{ title: 'Recall' }} />
      <Text style={styles.hint}>Turn two tiles; pair each cue with its answer</Text>
      <MemoryMatch key={boardKey} cards={cards} best={best} onWon={handleWon} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Pressable
        style={styles.reshuffleButton}
        onPress={reshuffle}
        accessibilityRole="button"
        accessibilityLabel="Reshuffle the board and restart the clock"
      >
        <Text style={styles.reshuffleText}>Reshuffle</Text>
      </Pressable>
    </View>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultStat}>
      <Text style={styles.resultValue}>{value}</Text>
      <Text style={styles.resultLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stateContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  stateText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  introContainer: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'center',
  },
  introCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    gap: 12,
    ...cardShadow,
  },
  introTitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  introBody: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  goldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: gold.fill,
    borderWidth: 1.5,
    borderColor: gold.deep,
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 11,
    marginTop: 4,
    ...buttonShadow,
  },
  goldButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 14,
    fontWeight: '700',
  },
  notice: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  error: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  boardContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  hint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  reshuffleButton: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reshuffleText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  navButtonText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  winContainer: {
    flexGrow: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  winCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    gap: 12,
    ...cardShadow,
  },
  winTitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  winBody: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    marginTop: 2,
  },
  resultStat: {
    alignItems: 'center',
    gap: 2,
    minWidth: 64,
  },
  resultValue: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  resultLabel: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
