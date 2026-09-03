import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  CompanionRequestError,
  requestCueCards,
  type CompanionCueCard,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { PremiumOffer } from '@/components/PremiumOffer';
import { ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

/**
 * The cue-card deck for one book (Interface v2.0): real flip cards - a terse
 * cue on the front, the answer on the back, press to flip. Grounded only in
 * the reader's own entries and character maps; recalling before rereading is
 * the point (reconsolidation), so the front never gives the answer away.
 */
export default function CueCardsScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });

  const screenTitle = <Stack.Screen options={{ title: 'Cue cards' }} />;

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
          title="Cue cards"
          body="A deck of flip cards drawn only from your own entries and character maps. Try to recall before you flip - that little effort is what makes the book stick."
        />
      </View>
    );
  }
  return <CueCardDeck bookId={bookId} />;
}

function CueCardDeck({ bookId }: { bookId: number }) {
  const [cards, setCards] = useState<CompanionCueCard[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // The dealt-card motion: -1 = off to the left, 0 = in hand, +1 = off to
  // the right. The old card slides away, the new one glides in behind it.
  const slide = useRef(new Animated.Value(0)).current;
  const sliding = useRef(false);

  const goTo = (nextIndex: number, direction: 1 | -1) => {
    if (sliding.current || nextIndex === index) {
      return;
    }
    sliding.current = true;
    Animated.timing(slide, {
      toValue: -direction,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIndex(nextIndex);
      slide.setValue(direction);
      Animated.spring(slide, {
        toValue: 0,
        friction: 9,
        tension: 50,
        useNativeDriver: true,
      }).start(() => {
        sliding.current = false;
      });
    });
  };

  const dealMutation = useMutation({
    mutationFn: () => requestCueCards(bookId),
    onMutate: () => {
      setError(null);
      setNotice(null);
    },
    onSuccess: (result) => {
      trackAnalyticsEvent(
        'companion_tool_used',
        { tool: 'cue_cards', status: 'succeeded', cards: result.cards.length },
        bookId,
      );
      if (result.cards.length === 0) {
        setNotice(
          result.reply.content ||
            'Not enough in your records for a deck yet. A few more entries will do it.',
        );
        setCards(null);
        return;
      }
      setCards(result.cards);
      setIndex(0);
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'cue_cards', status }, bookId);
      setError(
        err instanceof CompanionRequestError
          ? err.message
          : 'The deck could not be dealt just now. Please try again.',
      );
    },
  });

  if (!cards) {
    return (
      <ScrollView contentContainerStyle={styles.introContainer}>
        <Stack.Screen options={{ title: 'Cue cards' }} />
        <View style={styles.introCard}>
          <Ionicons name="albums-outline" size={26} color={gold.deep} />
          <Text style={styles.introTitle}>Deal yourself a deck</Text>
          <Text style={styles.introBody}>
            Each card carries a cue from your own entries and character maps - nothing from outside
            your records, nothing past your latest page. Recall first, then flip.
          </Text>
          <Pressable
            style={styles.goldButton}
            onPress={() => dealMutation.mutate()}
            disabled={dealMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Deal the cards"
          >
            {dealMutation.isPending ? (
              <ActivityIndicator size="small" color={gold.onFill} />
            ) : (
              <>
                <Ionicons name="sparkles" size={15} color={gold.onFill} />
                <Text style={styles.goldButtonText}>Deal the cards</Text>
              </>
            )}
          </Pressable>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>
    );
  }

  const card = cards[Math.min(index, cards.length - 1)];
  const slideX = slide.interpolate({ inputRange: [-1, 1], outputRange: [-380, 380] });
  const slideRotate = slide.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] });
  const slideOpacity = slide.interpolate({
    inputRange: [-1, -0.4, 0, 0.4, 1],
    outputRange: [0, 1, 1, 1, 0],
  });

  return (
    <View style={styles.deckContainer}>
      <Stack.Screen options={{ title: 'Cue cards' }} />
      <Text style={styles.counter}>
        Card {Math.min(index, cards.length - 1) + 1} of {cards.length}
      </Text>

      <Animated.View
        style={[
          styles.slideStage,
          { opacity: slideOpacity, transform: [{ translateX: slideX }, { rotate: slideRotate }] },
        ]}
      >
        {/* Key by index so each card starts front-side up. */}
        <FlipCard key={index} front={card.front} back={card.back} />
      </Animated.View>

      <Text style={styles.flipHint}>Tap the card to flip it</Text>

      <View style={styles.navRow}>
        <Pressable
          style={[styles.navButton, index === 0 && styles.navButtonDisabled]}
          onPress={() => goTo(Math.max(0, index - 1), -1)}
          disabled={index === 0}
          accessibilityRole="button"
          accessibilityLabel="Previous card"
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.navButtonText}>Back</Text>
        </Pressable>
        <Pressable
          style={[styles.navButton, index >= cards.length - 1 && styles.navButtonDisabled]}
          onPress={() => goTo(Math.min(cards.length - 1, index + 1), 1)}
          disabled={index >= cards.length - 1}
          accessibilityRole="button"
          accessibilityLabel="Next card"
        >
          <Text style={styles.navButtonText}>Next</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text} />
        </Pressable>
      </View>

      <Pressable
        style={styles.newDeckButton}
        onPress={() => {
          setCards(null);
          setIndex(0);
        }}
        accessibilityRole="button"
        accessibilityLabel="Put the deck away and deal a new one"
      >
        <Text style={styles.newDeckText}>New deck</Text>
      </Pressable>
    </View>
  );
}

/**
 * A physical flip card: two faces on the same spot, rotated about the Y
 * axis. backfaceVisibility keeps the hidden face hidden mid-turn.
 */
function FlipCard({ front, back }: { front: string; back: string }) {
  const flip = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  const turn = () => {
    Animated.spring(flip, {
      toValue: flipped ? 0 : 1,
      friction: 8,
      tension: 12,
      useNativeDriver: true,
    }).start();
    setFlipped((prev) => !prev);
  };

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  return (
    <Pressable
      onPress={turn}
      style={styles.cardStage}
      accessibilityRole="button"
      accessibilityLabel={flipped ? `Answer: ${back}` : `Cue: ${front}. Tap to flip.`}
    >
      <Animated.View
        style={[styles.cardFace, styles.cardFront, { transform: [{ rotateY: frontRotate }] }]}
      >
        <Text style={styles.cardCueLabel}>CUE</Text>
        <Text style={styles.cardFrontText}>{front}</Text>
      </Animated.View>
      <Animated.View
        style={[styles.cardFace, styles.cardBack, { transform: [{ rotateY: backRotate }] }]}
      >
        <Text style={styles.cardAnswerLabel}>FROM YOUR RECORDS</Text>
        <Text style={styles.cardBackText}>{back}</Text>
      </Animated.View>
    </Pressable>
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
  deckContainer: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 14,
  },
  slideStage: {
    width: '100%',
    maxWidth: 340,
  },
  cardStage: {
    width: '100%',
    aspectRatio: 3 / 2,
  },
  cardFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backfaceVisibility: 'hidden',
    borderWidth: 1,
    ...cardShadow,
  },
  cardFront: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  cardBack: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
  },
  cardCueLabel: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  cardFrontText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardAnswerLabel: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    opacity: 0.8,
  },
  cardBackText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
  },
  flipHint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 14,
  },
  navRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
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
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  newDeckButton: {
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newDeckText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
});
