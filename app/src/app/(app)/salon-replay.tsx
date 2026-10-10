import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { ErrorState, LoadingState } from '@/components/states';
import { Button, StickyFooter } from '@/components/ui';
import { fetchCompanionMessages } from '@/domains/companion/api';
import {
  buildSalons,
  completedSalons,
  formatSalonDate,
  replayCards,
  type ReplayCard,
} from '@/domains/companion/salons';
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { queryKeys } from '@/lib/queryKeys';
import { cardShadow, colors, fonts, gold, radii, spacing } from '@/lib/theme';

/** One swipeable page: an answered question, or the closing insight. */
type ReplayPage =
  | { kind: 'card'; index: number; card: ReplayCard }
  | { kind: 'insight'; insight: string };

/**
 * Relive a completed Book Club discussion (D-098): the same cue-card deck
 * as the live salon, paged sideways - Question 1 -> ... -> Question N ->
 * Insight - with the reader's own answers shown read-only beneath each
 * question. "Continue this discussion" re-opens the salon in the deck.
 */
export default function SalonReplayScreen() {
  const params = useLocalSearchParams<{ id: string; salon?: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const salonId = typeof params.salon === 'string' ? params.salon : '';
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
    enabled: validId,
  });
  const messagesQuery = useQuery({
    queryKey: queryKeys.companionMessages(bookId),
    queryFn: () => fetchCompanionMessages(bookId),
    enabled: validId,
  });

  // Only a completed discussion can be relived; a stale link to one that
  // never reached its insight lands on the "no longer here" state.
  const salon = useMemo(
    () =>
      completedSalons(buildSalons(messagesQuery.data ?? [])).find((item) => item.id === salonId) ??
      null,
    [messagesQuery.data, salonId],
  );
  const pages = useMemo<ReplayPage[]>(() => {
    if (!salon) {
      return [];
    }
    const cards: ReplayPage[] = replayCards(salon).map((card, index) => ({
      kind: 'card',
      index,
      card,
    }));
    return salon.insight ? [...cards, { kind: 'insight', insight: salon.insight }] : cards;
  }, [salon]);

  // Once per visit: how long the discussion was, never what was said.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (!salon || trackedRef.current) {
      return;
    }
    trackedRef.current = true;
    trackAnalyticsEvent(
      'salon_replay_viewed',
      { cards: replayCards(salon).length, hasInsight: Boolean(salon.insight) },
      bookId,
    );
  }, [salon, bookId]);

  const screenOptions = (
    <Stack.Screen options={{ title: 'Discussion', headerBackTitle: 'Book Club' }} />
  );

  if (!validId || !salonId) {
    return (
      <View style={styles.stateContainer}>
        {screenOptions}
        <Text style={styles.stateText}>This discussion link is not valid.</Text>
      </View>
    );
  }
  if (messagesQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        {screenOptions}
        <LoadingState label="Opening your discussion…" />
      </View>
    );
  }
  if (messagesQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        {screenOptions}
        <ErrorState
          error={messagesQuery.error}
          fallback="Could not open this discussion."
          onRetry={() => void messagesQuery.refetch()}
        />
      </View>
    );
  }
  if (!salon || pages.length === 0) {
    return (
      <View style={styles.stateContainer}>
        {screenOptions}
        <Text style={styles.stateText}>This discussion is no longer here.</Text>
      </View>
    );
  }

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    setPageIndex(Math.min(Math.max(next, 0), pages.length - 1));
  };
  const handleContinue = () => {
    trackAnalyticsEvent('salon_fork', { choice: 'continue_replay', cards: pages.length - 1 }, bookId);
    // Replace, not push: back from the live deck returns to the hub, not here.
    router.replace({ pathname: '/companion', params: { id: String(bookId), salon: salonId } });
  };
  const bookName = bookQuery.data?.name ?? null;
  const atEnd = pageIndex >= pages.length - 1;

  return (
    <View style={styles.flex}>
      {screenOptions}
      <View style={styles.contextBar}>
        {bookName ? (
          <Text style={styles.contextBook} numberOfLines={1}>
            {bookName}
          </Text>
        ) : null}
        <View style={styles.dateChip}>
          <Ionicons name="calendar-outline" size={12} color={gold.deep} />
          <Text style={styles.dateText}>Discussed {formatSalonDate(salon.startedAt)}</Text>
        </View>
      </View>

      <FlatList
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        keyExtractor={(page) => (page.kind === 'insight' ? 'insight' : `card-${page.index}`)}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={handleScrollEnd}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width }}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
          >
            {item.kind === 'insight' ? (
              <View style={[styles.paperCard, styles.convergenceCard]}>
                <View style={styles.cardLabelRow}>
                  <Text style={[styles.cardLabel, styles.convergenceLabel]}>Insight unlocked</Text>
                  <Text style={styles.cardCount}>Your takeaway</Text>
                </View>
                <Text style={styles.questionText}>{item.insight}</Text>
              </View>
            ) : (
              <View style={styles.paperCard}>
                <View style={styles.cardLabelRow}>
                  <Text style={styles.cardLabel}>
                    {item.card.question ? 'The companion asked' : 'A thought of your own'}
                  </Text>
                  <Text style={styles.cardCount}>Question {item.index + 1}</Text>
                </View>
                {item.card.question ? (
                  <Text style={styles.questionText}>{item.card.question}</Text>
                ) : null}
                <View style={styles.answerBlock}>
                  <Text style={styles.answerLabel}>You answered</Text>
                  <Text style={styles.answerText}>{item.card.answer}</Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}
      />

      <View style={styles.pagerRow}>
        <View style={styles.dots}>
          {pages.map((page, index) => (
            <View
              key={page.kind === 'insight' ? 'insight' : `dot-${page.index}`}
              style={[
                styles.dot,
                index === pageIndex && styles.dotActive,
                page.kind === 'insight' && styles.dotInsight,
              ]}
            />
          ))}
        </View>
        <Text style={styles.pagerHint}>
          {atEnd ? 'Where this discussion landed' : 'Swipe to keep reading'}
        </Text>
      </View>

      <StickyFooter>
        <Button
          label="Continue this discussion"
          icon="chatbubble-ellipses"
          onPress={handleContinue}
          accessibilityLabel="Continue this discussion in the Book Club"
        />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  stateContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stateText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 15 },

  contextBar: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  contextBook: {
    fontFamily: fonts.serif,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.chip,
    backgroundColor: gold.glowSoft,
  },
  dateText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: gold.deep,
  },

  page: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  // The same paper as the live deck's cards, read-only.
  paperCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...cardShadow,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardCount: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.text,
    backgroundColor: gold.glowSoft,
    borderRadius: radii.chip,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  questionText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 23,
    lineHeight: 31,
  },
  answerBlock: {
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  answerLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    color: gold.deep,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  answerText: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15.5,
    lineHeight: 23,
  },
  convergenceCard: {
    backgroundColor: gold.glowSoft,
    borderColor: gold.base,
    borderWidth: 1.5,
  },
  convergenceLabel: { color: gold.deep },

  pagerRow: { alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.sm },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.accent, width: 18 },
  dotInsight: { borderWidth: 1, borderColor: gold.base },
  pagerHint: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.muted,
  },
});
