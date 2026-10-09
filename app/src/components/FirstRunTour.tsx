import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dismissOnboarding, useOnboardingVisible } from '@/domains/onboarding/firstRun';
import { ONBOARDING_SLIDES, type OnboardingSlide } from '@/domains/onboarding/slides';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

/**
 * The first-run welcome tour (D-084): a swipeable carousel shown once per
 * device after sign-in, and again on request from Settings. It sits in a
 * modal over the tab navigator rather than being a route, so the reader's
 * destination - including a bookmark deep link - is already loaded
 * underneath and nothing has to be re-navigated when the tour closes. Skip
 * is always available; the hardware back button counts as Skip.
 */
export function FirstRunTour() {
  const visible = useOnboardingVisible();
  if (!visible) {
    return null;
  }
  return <TourModal />;
}

function TourModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const [index, setIndex] = useState(0);
  const finishedRef = useRef(false);

  const last = ONBOARDING_SLIDES.length - 1;
  const onLast = index === last;

  const finish = useCallback(
    (outcome: 'completed' | 'skipped', then?: () => void) => {
      if (finishedRef.current) {
        return;
      }
      finishedRef.current = true;
      trackAnalyticsEvent('onboarding_finished', {
        outcome,
        slides_seen: index + 1,
        slides_total: ONBOARDING_SLIDES.length,
      });
      void dismissOnboarding();
      then?.();
    },
    [index],
  );

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(last, next));
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
    setIndex(clamped);
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) {
      setIndex(Math.max(0, Math.min(last, next)));
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => finish('skipped')}
      accessibilityViewIsModal
    >
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.wordmark}>Bookmarkt</Text>
          {onLast ? null : (
            <Pressable
              onPress={() => finish('skipped')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Skip the tour"
            >
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          ref={listRef}
          data={ONBOARDING_SLIDES}
          keyExtractor={(slide) => slide.id}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMomentumEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item }) => (
            <Slide
              slide={item}
              width={width}
              onSeePlans={() => finish('completed', () => router.push('/subscription'))}
            />
          )}
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.dots} accessibilityRole="progressbar">
            {ONBOARDING_SLIDES.map((slide, i) => (
              <View key={slide.id} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <View style={styles.actions}>
            {index > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
                onPress={() => goTo(index - 1)}
                accessibilityRole="button"
                accessibilityLabel="Previous card"
              >
                <Ionicons name="chevron-back" size={20} color={colors.text} />
              </Pressable>
            ) : (
              <View style={[styles.backButton, styles.hidden]} />
            )}
            <Pressable
              style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]}
              onPress={() => (onLast ? finish('completed') : goTo(index + 1))}
              accessibilityRole="button"
              accessibilityLabel={onLast ? 'Start reading' : 'Next card'}
            >
              <Text style={styles.nextText}>{onLast ? 'Start reading' : 'Next'}</Text>
              {onLast ? null : <Ionicons name="arrow-forward" size={18} color={gold.onFill} />}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Slide({
  slide,
  width,
  onSeePlans,
}: {
  slide: OnboardingSlide;
  width: number;
  onSeePlans: () => void;
}) {
  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={styles.slide}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.card, slide.premium && styles.cardPremium]}>
        <View style={[styles.iconBadge, slide.premium && styles.iconBadgePremium]}>
          <Ionicons
            name={slide.premium ? 'lock-closed' : slide.icon}
            size={30}
            color={slide.premium ? gold.deep : colors.accent}
          />
        </View>
        <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
        <View style={styles.points}>
          {slide.points.map((point) => (
            <View key={point} style={styles.pointRow}>
              <Ionicons
                name={slide.premium ? 'sparkles' : 'checkmark-circle'}
                size={16}
                color={gold.deep}
                style={styles.pointIcon}
              />
              <Text style={styles.pointText}>{point}</Text>
            </View>
          ))}
        </View>
        {slide.premium ? (
          <>
            <Text style={styles.premiumNote}>
              Try it free from the store. Your notes, maps, and bookmarks stay free forever,
              subscription or not.
            </Text>
            <Pressable
              style={styles.pill}
              onPress={onSeePlans}
              accessibilityRole="button"
              accessibilityLabel="See plans and the free trial"
            >
              <Text style={styles.pillText}>See plans</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.walnut,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.walnutBorder,
  },
  wordmark: {
    fontFamily: fonts.serif,
    color: colors.onWalnut,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  skip: {
    fontFamily: fonts.serif,
    color: colors.onWalnutMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  slide: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 24,
    gap: 10,
    ...cardShadow,
  },
  cardPremium: {
    borderWidth: 1.5,
    borderColor: gold.base,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  iconBadgePremium: {
    backgroundColor: gold.glow,
  },
  eyebrow: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  body: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  points: {
    marginTop: 6,
    gap: 8,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  pointIcon: {
    marginTop: 2,
  },
  pointText: {
    flex: 1,
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  premiumNote: {
    marginTop: 6,
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: gold.fill,
    borderWidth: 1,
    borderColor: gold.deep,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pillText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 22,
    backgroundColor: gold.base,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    ...buttonShadow,
  },
  nextText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  hidden: {
    opacity: 0,
  },
});
