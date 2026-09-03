import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/states';
import { KeyboardPane } from '@/components/KeyboardPane';
import {
  CompanionRequestError,
  fetchCompanionMessages,
  openObservation,
  requestClubPrimer,
  requestObservations,
  requestSalonInsight,
  sendCompanionMessage,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { buildSalons, formatSalonDate } from '@/domains/companion/salons';
import { getLatestProgressBoundary } from '@/domains/entries/progress';
import { addEntry, listEntries } from '@/domains/entries/service';
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { cleanupTranscript } from '@/domains/voice/cleanup';
import { useDictation } from '@/domains/voice/useDictation';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

const MAX_MESSAGE_CHARS = 2000;

// When the notes are too thin for a grounded observation, the deck still
// opens with something the reader alone can answer (D-012: no plot facts).
const FALLBACK_QUESTION = 'What struck you most in what you last read?';

// The Socratic deck inside session salons (D-058): a returning reader lands
// on the orientation hub; the primer opens a first-ever or fresh discussion.
type DeckPhase = 'hub' | 'primer' | 'deck' | 'closing';

// After this many answers the deck offers - never forces - a wrap-up.
const WRAP_UP_NUDGE_AFTER = 3;

interface DeckCard {
  question: string;
  stems: string[];
  /** Convergence arc (D-059): the one-sentence validation above the question. */
  mirror: string | null;
  /** True when this is the synthesis card - the arc's gold "insight unlocked" close. */
  isConvergence: boolean;
}

export default function CompanionScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (validId) {
      trackAnalyticsEvent('companion_opened', {}, bookId);
    }
  }, [validId, bookId]);

  if (!validId) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Book Club' }} />
        <Text style={styles.stateText}>This book link is not valid.</Text>
      </View>
    );
  }
  if (entitlementQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Book Club' }} />
        <LoadingState label="Checking your companion access…" />
      </View>
    );
  }
  if (entitlementQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Book Club' }} />
        <ErrorState
          error={entitlementQuery.error}
          fallback="Could not check your companion access."
          onRetry={() => void entitlementQuery.refetch()}
        />
      </View>
    );
  }
  if (!entitlementQuery.data.entitled) {
    return <CompanionOffer />;
  }
  return <SocraticDeck bookId={bookId} />;
}

/**
 * The subscription-offer state (server said not entitled). Billing arrives
 * in Phase 3; until then this explains the companion without a buy button.
 */
function CompanionOffer() {
  return (
    <View style={styles.offerContainer}>
      <Stack.Screen options={{ title: 'Book Club' }} />
      <View style={styles.offerCard}>
        <View style={styles.offerLockBadge}>
          <Ionicons name="lock-closed" size={18} color={gold.deep} />
        </View>
        <Text style={styles.offerTitle}>The Book Club</Text>
        <Text style={styles.offerBody}>
          A book club of two: talk any book on your shelf over, properly. The companion reads only
          your own notes, never spoils past your latest entry, and always shows whether an answer
          came from your notes or its general knowledge.
        </Text>
        <Text style={styles.offerBody}>
          The Book Club is part of the paid plan. Subscriptions are coming soon — your notes and
          character maps stay free forever.
        </Text>
        <View style={styles.offerPill}>
          <Text style={styles.offerPillText}>Coming soon</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The Book Club as a Socratic card deck (D-057): a primer card orients the
 * reader in seconds, then one question card at a time - answered by chip,
 * voice, or typing - with the companion mirroring each answer back as the
 * next card. No scrolling transcript, no date picker.
 */
function SocraticDeck({ bookId }: { bookId: number }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [phase, setPhase] = useState<DeckPhase | null>(null);
  const [card, setCard] = useState<DeckCard | null>(null);
  // The active salon (D-058): a client-minted uuid grouping this bounded
  // discussion's messages, so history and the archive stay per-session.
  const [salonId, setSalonId] = useState<string | null>(null);
  const [takeaway, setTakeaway] = useState<string | null>(null);
  const [expandedSalonId, setExpandedSalonId] = useState<string | null>(null);
  // The reader's own submitted answers this session (D-012: only these can
  // be saved to the journal - never the companion's questions).
  const [answers, setAnswers] = useState<string[]>([]);
  // Convergence arc (D-059): answers within the current mini-arc (resets on
  // "Push further") and the synthesis card's takeaway awaiting save.
  const [arcAnswers, setArcAnswers] = useState(0);
  const [pendingInsight, setPendingInsight] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const [latestBoundary, setLatestBoundary] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Card slide (PR #97 pattern): the old card exits left, the next springs
  // in from the right - the deck should feel like paper being dealt.
  const slide = useRef(new Animated.Value(0)).current;
  const sliding = useRef(false);
  const advance = (apply: () => void) => {
    if (sliding.current) {
      return;
    }
    sliding.current = true;
    Animated.timing(slide, {
      toValue: -1,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      apply();
      slide.setValue(1);
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

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
  });
  // Entries back the save-to-journal position (the reader's latest logged
  // boundary); usually already cached from the book screen.
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
  });

  // The stored conversation, grouped into salons for the hub and archive.
  const messagesQuery = useQuery({
    queryKey: queryKeys.companionMessages(bookId),
    queryFn: () => fetchCompanionMessages(bookId),
  });
  const salons = useMemo(() => buildSalons(messagesQuery.data ?? []), [messagesQuery.data]);
  const latestSalon = salons[0] ?? null;

  // Land returning readers on the hub; first-timers go straight to the primer.
  useEffect(() => {
    if (phase !== null || messagesQuery.isPending) {
      return;
    }
    setPhase(salons.length > 0 ? 'hub' : 'primer');
  }, [phase, messagesQuery.isPending, salons]);

  // The primer (D-057): a max-3-bullet orientation from the last few notes.
  // Transient - regenerated per visit, never persisted. Only fetched when the
  // reader is actually opening a fresh discussion (it spends quota).
  const primerQuery = useQuery({
    queryKey: queryKeys.companionPrimer(bookId),
    queryFn: () => requestClubPrimer(bookId),
    staleTime: 10 * 60_000,
    retry: false,
    enabled: phase === 'primer',
  });
  // Observation cards (D-056): grounded openers, each now carrying stems.
  const observationsQuery = useQuery({
    queryKey: queryKeys.companionObservations(bookId),
    queryFn: () => requestObservations(bookId),
    staleTime: 10 * 60_000,
    retry: false,
    enabled: phase === 'primer',
  });
  const observations = observationsQuery.data?.observations ?? [];

  // If the server gate disagrees with our cached entitlement, re-render as
  // the offer instead of failing quietly.
  const primerError = primerQuery.error;
  const observationsError = observationsQuery.error;
  useEffect(() => {
    const err = primerError ?? observationsError;
    if (err instanceof CompanionRequestError && err.subscriptionRequired) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companionEntitlement });
    }
  }, [primerError, observationsError, queryClient]);

  const boundaryLabel = latestBoundary ?? primerQuery.data?.boundaryLabel ?? null;

  // Composer dictation (D-016): spoken words land in the draft verbatim,
  // with only casing/punctuation cleanup. The reader still edits and sends.
  const {
    status: dictationStatus,
    partial: dictationPartial,
    error: dictationError,
    start: startDictation,
    stop: stopDictation,
    confirm: confirmDictation,
  } = useDictation();
  useEffect(() => {
    if (dictationStatus !== 'review') {
      return;
    }
    const spoken = cleanupTranscript(confirmDictation());
    if (spoken) {
      setDraft((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
      setComposerOpen(true);
    }
  }, [dictationStatus, confirmDictation]);

  // Tapping "Start discussion" persists the opener server-side so the
  // Socratic thread starts from the card itself. Fire-and-forget: the deck
  // works even if this write fails.
  const openMutation = useMutation({
    mutationFn: (input: { prompt: string; salonId: string }) =>
      openObservation(bookId, input.prompt, input.salonId),
    onSuccess: () => {
      trackAnalyticsEvent('companion_tool_used', { tool: 'observation_open', status: 'succeeded' }, bookId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.companionMessages(bookId) });
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'observation_open', status }, bookId);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (input: { message: string; turn: number }) =>
      sendCompanionMessage(bookId, input.message, salonId ?? undefined, input.turn),
    onMutate: () => {
      setSendError(null);
      setQuotaNotice(null);
    },
    onSuccess: (result, input) => {
      setAnswers((prev) => [...prev, input.message]);
      setArcAnswers((prev) => prev + 1);
      setDraft('');
      setComposerOpen(false);
      if (result.boundaryLabel) {
        setLatestBoundary(result.boundaryLabel);
      }
      trackAnalyticsEvent('companion_message_sent', { status: 'succeeded' }, bookId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.companionMessages(bookId) });
      const question =
        result.probe ||
        result.reply.content ||
        result.messages.filter((m) => m.role === 'companion').at(-1)?.content ||
        FALLBACK_QUESTION;
      // The synthesis card (D-059): no chips, no probe - a fork instead.
      const isConvergence =
        result.isConvergence && Boolean(result.mirror || result.probe || result.insight);
      if (isConvergence) {
        setPendingInsight(result.insight || result.reply.content || null);
      }
      advance(() =>
        setCard({
          question,
          stems: isConvergence ? [] : result.stems,
          mirror: result.mirror || null,
          isConvergence,
        }),
      );
    },
    onError: (err) => {
      if (err instanceof CompanionRequestError) {
        trackAnalyticsEvent('companion_message_sent', { status: err.code }, bookId);
        if (err.subscriptionRequired) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.companionEntitlement });
          return;
        }
        if (err.quotaExceeded) {
          setQuotaNotice(err.message);
          return;
        }
        setSendError(err.message);
        return;
      }
      trackAnalyticsEvent('companion_message_sent', { status: 'error' }, bookId);
      setSendError('The companion could not respond. Please try again.');
    },
  });

  // End-of-session save (D-012): the entry is the reader's own answers,
  // verbatim, filed at their latest logged position.
  const entries = entriesQuery.data ?? [];
  const journalBoundary =
    getLatestProgressBoundary(entries, 'page') ?? getLatestProgressBoundary(entries, 'chapter');
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!journalBoundary) {
        throw new Error('No progress boundary to file the entry at.');
      }
      return addEntry(bookId, {
        text: answers.join('\n\n'),
        progressType: journalBoundary.progressType,
        progressValue: journalBoundary.upper,
      });
    },
    onSuccess: () => {
      setSaved(true);
      setSendError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
    },
    onError: () => {
      setSendError('Could not save to your journal. Please try again.');
    },
  });

  // Closing a salon (D-058): distill the reader's answers into a takeaway,
  // stored on the salon so the hub can re-orient them next visit.
  const insightMutation = useMutation({
    mutationFn: (insightText?: string) => {
      if (!salonId) {
        throw new Error('No active salon.');
      }
      // With a crystallized synthesis (D-059) the takeaway saves verbatim;
      // otherwise the companion distills the session's answers (D-058).
      return requestSalonInsight(bookId, salonId, insightText);
    },
    onSuccess: (result) => {
      setTakeaway(result.reply.content || null);
      trackAnalyticsEvent('companion_tool_used', { tool: 'insight', status: 'succeeded' }, bookId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.companionMessages(bookId) });
    },
    onError: (err) => {
      // The closing card still shows the reader's answers; the takeaway is a
      // bonus, not a gate.
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'insight', status }, bookId);
    },
  });

  const handleStart = () => {
    setSendError(null);
    // A fresh salon for a fresh discussion: minted client-side so every
    // message in this session lands under one id.
    const newSalonId = Crypto.randomUUID();
    setSalonId(newSalonId);
    setAnswers([]);
    setArcAnswers(0);
    setPendingInsight(null);
    setTakeaway(null);
    setSaved(false);
    const first = observations[0];
    if (first) {
      openMutation.mutate({ prompt: first.prompt, salonId: newSalonId });
    }
    advance(() => {
      setPhase('deck');
      setCard(
        first
          ? { question: first.prompt, stems: first.stems, mirror: null, isConvergence: false }
          : { question: FALLBACK_QUESTION, stems: [], mirror: null, isConvergence: false },
      );
    });
  };

  // Re-open the latest salon: the active card is its last unanswered probe;
  // the server already holds the salon's history for the mirror's context.
  const handleResume = () => {
    const probe = latestSalon?.lastProbe;
    if (!latestSalon || !probe) {
      return;
    }
    setSendError(null);
    setSalonId(latestSalon.id);
    setAnswers([]);
    // A resumed probe stands in for the wedge (D-059): one answer away from
    // the synthesis, so returning readers still converge quickly.
    setArcAnswers(1);
    setPendingInsight(null);
    setTakeaway(null);
    setSaved(false);
    advance(() => {
      setPhase('deck');
      setCard({ question: probe, stems: [], mirror: null, isConvergence: false });
    });
  };

  const handleNewDiscussion = () => {
    setSendError(null);
    advance(() => setPhase('primer'));
  };

  const handleEndSession = () => {
    if (sendMutation.isPending) {
      return;
    }
    if (salonId && answers.length > 0) {
      insightMutation.mutate(pendingInsight ?? undefined);
    }
    advance(() => setPhase('closing'));
  };

  // The convergence fork (D-059): file the crystallized insight verbatim and
  // close, or push one more bounded probe-and-converge loop.
  const handleSaveInsightFinish = () => {
    if (sendMutation.isPending) {
      return;
    }
    if (salonId && (pendingInsight || answers.length > 0)) {
      insightMutation.mutate(pendingInsight ?? undefined);
    }
    advance(() => setPhase('closing'));
  };

  const handlePushFurther = () => {
    if (!card) {
      return;
    }
    // A fresh mini-arc: the reader reacts to the synthesis, the companion
    // wedges once more, then converges again - 1-2 extra cards, never a drift.
    setArcAnswers(0);
    setPendingInsight(null);
    setCard({ ...card, isConvergence: false, stems: [] });
    setComposerOpen(true);
  };

  const canSend = draft.trim().length > 0 && !sendMutation.isPending;
  const handleSend = () => {
    const message = draft.trim();
    if (!message || sendMutation.isPending) {
      return;
    }
    // Arc position (D-059): the first answer draws the wedge, the second the synthesis.
    sendMutation.mutate({ message, turn: Math.min(arcAnswers + 2, 3) });
  };

  const bookName = bookQuery.data?.name ?? null;
  const primer = primerQuery.data ?? null;
  const noEntries = primer?.code === 'NO_ENTRIES';
  const primerLines = (primer?.reply.content ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 3);

  const slideX = slide.interpolate({ inputRange: [-1, 1], outputRange: [-380, 380] });
  const slideRotate = slide.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] });
  const slideOpacity = slide.interpolate({
    inputRange: [-1, -0.4, 0, 0.4, 1],
    outputRange: [0, 1, 1, 1, 0],
  });
  const slideStyle = {
    opacity: slideOpacity,
    transform: [{ translateX: slideX }, { rotate: slideRotate }],
  };

  return (
    <KeyboardPane style={styles.flex} keyboardVerticalOffset={88}>
      <Stack.Screen options={{ title: 'Book Club' }} />
      {bookName ? (
        <View style={styles.contextBar}>
          <Text style={styles.contextBook} numberOfLines={1}>
            {bookName}
          </Text>
          <View style={styles.boundaryChip}>
            <Ionicons name="shield-checkmark-outline" size={12} color={colors.muted} />
            <Text style={styles.boundaryText}>
              {boundaryLabel ? `Nothing past ${boundaryLabel}` : 'No spoilers past your notes'}
            </Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.deckContent, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.slideStage, slideStyle]}>
          {phase === null ? (
            <View style={styles.paperCard}>
              <View style={styles.cardLoadingRow}>
                <ActivityIndicator size="small" color={colors.muted} />
                <Text style={styles.cardLoadingText}>Opening the club room…</Text>
              </View>
            </View>
          ) : phase === 'hub' && latestSalon ? (
            <View style={styles.hubStack}>
              <View style={styles.paperCard}>
                <Text style={styles.cardLabel}>
                  {latestSalon.insight ? 'Last time, your takeaway' : 'Where you left off'}
                </Text>
                {latestSalon.insight ? (
                  <View style={styles.takeawayBlock}>
                    <Text style={styles.takeawayText}>{latestSalon.insight}</Text>
                  </View>
                ) : latestSalon.lastProbe ? (
                  <Text style={styles.cardBody}>
                    A question is still on the table: “{latestSalon.lastProbe}”
                  </Text>
                ) : (
                  <Text style={styles.cardBody}>
                    Your last discussion is here when you want it.
                  </Text>
                )}
                {latestSalon.lastProbe ? (
                  <Pressable
                    style={styles.goldButton}
                    onPress={handleResume}
                    accessibilityRole="button"
                    accessibilityLabel="Continue your last discussion"
                  >
                    <Ionicons name="chatbubble-ellipses" size={15} color={gold.onFill} />
                    <Text style={styles.goldButtonText}>Continue discussion</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={latestSalon.lastProbe ? styles.plainButton : styles.goldButton}
                  onPress={handleNewDiscussion}
                  accessibilityRole="button"
                  accessibilityLabel="Start a new discussion"
                >
                  <Ionicons
                    name="add"
                    size={15}
                    color={latestSalon.lastProbe ? colors.text : gold.onFill}
                  />
                  <Text
                    style={latestSalon.lastProbe ? styles.plainButtonText : styles.goldButtonText}
                  >
                    Start a new discussion
                  </Text>
                </Pressable>
              </View>

              <View style={styles.archiveSection}>
                <Text style={styles.archiveHeading}>Past discussions</Text>
                {salons.map((salon) => {
                  const expanded = expandedSalonId === salon.id;
                  return (
                    <View key={salon.id} style={styles.archiveCard}>
                      <Pressable
                        style={styles.archiveHeader}
                        onPress={() => setExpandedSalonId(expanded ? null : salon.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Discussion from ${formatSalonDate(salon.startedAt)}`}
                      >
                        <Text style={styles.archiveDate}>{formatSalonDate(salon.startedAt)}</Text>
                        <Text style={styles.archivePreview} numberOfLines={1}>
                          {salon.insight ?? salon.pairs[0]?.question ?? 'A quiet session.'}
                        </Text>
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={colors.muted}
                        />
                      </Pressable>
                      {expanded ? (
                        <View style={styles.archiveBody}>
                          {salon.pairs.map((pair, index) => (
                            <View key={`${salon.id}-${index}`} style={styles.archivePair}>
                              {pair.question ? (
                                <Text style={styles.archiveQuestion}>{pair.question}</Text>
                              ) : null}
                              {pair.answer ? (
                                <Text style={styles.archiveAnswer}>{pair.answer}</Text>
                              ) : null}
                            </View>
                          ))}
                          {salon.insight ? (
                            <View style={styles.takeawayBlock}>
                              <Text style={styles.takeawayText}>{salon.insight}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : phase === 'primer' ? (
            <View style={styles.paperCard}>
              <Text style={styles.cardLabel}>Where you stand</Text>
              {primerQuery.isPending ? (
                <View style={styles.cardLoadingRow}>
                  <ActivityIndicator size="small" color={colors.muted} />
                  <Text style={styles.cardLoadingText}>Reading your recent notes…</Text>
                </View>
              ) : primerQuery.isError ? (
                <Text style={styles.cardBody}>
                  {primerError instanceof CompanionRequestError && primerError.quotaExceeded
                    ? primerError.message
                    : 'I could not prepare your primer just now — we can still talk.'}
                </Text>
              ) : noEntries ? (
                <Text style={styles.cardBody}>{primer?.reply.content}</Text>
              ) : (
                <View style={styles.primerList}>
                  {primerLines.map((line) => (
                    <View key={line} style={styles.primerLineRow}>
                      <Text style={styles.primerBullet}>•</Text>
                      <Text style={styles.primerLineText}>{line}</Text>
                    </View>
                  ))}
                </View>
              )}
              {!primerQuery.isPending && !noEntries ? (
                <Pressable
                  style={[styles.goldButton, observationsQuery.isPending && styles.goldButtonDisabled]}
                  onPress={handleStart}
                  disabled={observationsQuery.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Start the discussion"
                >
                  {observationsQuery.isPending ? (
                    <ActivityIndicator size="small" color={gold.onFill} />
                  ) : (
                    <>
                      <Ionicons name="chatbubble-ellipses" size={15} color={gold.onFill} />
                      <Text style={styles.goldButtonText}>Start discussion</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>
          ) : phase === 'deck' && card ? (
            <View style={styles.deckStack}>
              {answers.length > 1 ? (
                <View style={[styles.stackLayer, styles.stackLayerDeep]} />
              ) : null}
              {answers.length > 0 ? (
                <View style={[styles.stackLayer, styles.stackLayerNear]} />
              ) : null}
              <View style={[styles.paperCard, card.isConvergence && styles.convergenceCard]}>
                <View style={styles.cardLabelRow}>
                  <Text style={[styles.cardLabel, card.isConvergence && styles.convergenceLabel]}>
                    {card.isConvergence ? 'Insight unlocked' : 'The companion asks'}
                  </Text>
                  <Text style={styles.cardCount}>Card {answers.length + 1}</Text>
                </View>
                {card.mirror && !card.isConvergence ? (
                  <Text style={styles.mirrorText}>{card.mirror}</Text>
                ) : null}
                <Text style={styles.questionText}>
                  {card.isConvergence && card.mirror ? card.mirror : card.question}
                </Text>
                {card.isConvergence && card.mirror && card.question !== card.mirror ? (
                  <Text style={styles.affirmationText}>{card.question}</Text>
                ) : null}
              </View>
            </View>
          ) : phase === 'closing' ? (
            <View style={styles.paperCard}>
              {insightMutation.isPending ? (
                <View style={styles.cardLoadingRow}>
                  <ActivityIndicator size="small" color={colors.muted} />
                  <Text style={styles.cardLoadingText}>Distilling your session…</Text>
                </View>
              ) : takeaway ? (
                <>
                  <Text style={styles.cardLabel}>The takeaway</Text>
                  <View style={styles.takeawayBlock}>
                    <Text style={styles.takeawayText}>{takeaway}</Text>
                  </View>
                </>
              ) : null}
              <Text style={styles.cardLabel}>Your thinking, this session</Text>
              {answers.length > 0 ? (
                <View style={styles.primerList}>
                  {answers.map((answer, index) => (
                    <View key={`${index}-${answer.slice(0, 24)}`} style={styles.primerLineRow}>
                      <Text style={styles.primerBullet}>•</Text>
                      <Text style={styles.primerLineText}>{answer}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.cardBody}>
                  You kept your counsel this session — nothing to save yet.
                </Text>
              )}
              {saved ? (
                <View style={styles.savedRow}>
                  <Ionicons name="checkmark-circle" size={15} color={gold.deep} />
                  <Text style={styles.savedText}>Saved to your journal.</Text>
                </View>
              ) : null}
              {answers.length > 0 && journalBoundary && !saved ? (
                <Pressable
                  style={[styles.goldButton, saveMutation.isPending && styles.goldButtonDisabled]}
                  onPress={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Save your answers to the journal"
                >
                  {saveMutation.isPending ? (
                    <ActivityIndicator size="small" color={gold.onFill} />
                  ) : (
                    <>
                      <Ionicons name="bookmark" size={15} color={gold.onFill} />
                      <Text style={styles.goldButtonText}>Save to journal</Text>
                    </>
                  )}
                </Pressable>
              ) : null}
              <Pressable
                style={styles.ghostButton}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Close the Book Club"
              >
                <Text style={styles.ghostButtonText}>Done</Text>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>

        {phase === 'deck' ? (
          sendMutation.isPending ? (
            <View style={styles.thinkingRow}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={styles.thinkingText}>Consulting your notes…</Text>
            </View>
          ) : card?.isConvergence ? (
            // The fork (D-059): the arc has landed - save it, or dig once more.
            <View style={styles.answerArea}>
              <Pressable
                style={styles.goldButton}
                onPress={handleSaveInsightFinish}
                accessibilityRole="button"
                accessibilityLabel="Save this insight and finish the session"
              >
                <Ionicons name="bookmark" size={15} color={gold.onFill} />
                <Text style={styles.goldButtonText}>Save insight &amp; finish</Text>
              </Pressable>
              <Pressable
                style={styles.ghostButton}
                onPress={handlePushFurther}
                accessibilityRole="button"
                accessibilityLabel="Keep exploring this thought"
              >
                <Text style={styles.ghostButtonText}>Push further</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.answerArea}>
              {card && card.stems.length > 0 ? (
                <View style={styles.stemRow}>
                  {card.stems.map((stem) => (
                    <Pressable
                      key={stem}
                      style={styles.stemChip}
                      onPress={() => {
                        // Seed an argument, not just grammar: the chip is an
                        // interpretive position, "because" invites the reader
                        // to reason it out in their own words.
                        setDraft(`${stem} because `);
                        setComposerOpen(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Take this position: ${stem}`}
                    >
                      <Text style={styles.stemChipText}>{stem}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.answerActionsRow}>
                {dictationStatus !== 'unavailable' ? (
                  <Pressable
                    style={[
                      styles.micButton,
                      dictationStatus === 'recording' && styles.micButtonActive,
                    ]}
                    onPress={() => {
                      if (dictationStatus === 'recording') {
                        stopDictation();
                      } else {
                        void startDictation();
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      dictationStatus === 'recording' ? 'Finish dictating' : 'Speak your answer'
                    }
                  >
                    <Ionicons
                      name={dictationStatus === 'recording' ? 'stop' : 'mic'}
                      size={18}
                      color={dictationStatus === 'recording' ? gold.onFill : colors.text}
                    />
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.typeButton}
                  onPress={() => setComposerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Type your own thought"
                >
                  <Ionicons name="pencil" size={14} color={colors.text} />
                  <Text style={styles.typeButtonText}>Type my own thought</Text>
                </Pressable>
              </View>

              {dictationStatus === 'recording' ? (
                <View style={styles.listeningRow}>
                  <Ionicons name="mic" size={14} color={gold.deep} />
                  <Text style={styles.listeningText} numberOfLines={1}>
                    {dictationPartial || 'Listening…'}
                  </Text>
                  <Pressable
                    style={styles.listeningStop}
                    onPress={stopDictation}
                    accessibilityRole="button"
                    accessibilityLabel="Finish dictating"
                    hitSlop={8}
                  >
                    <Text style={styles.listeningStopText}>Done</Text>
                  </Pressable>
                </View>
              ) : null}

              {answers.length >= WRAP_UP_NUDGE_AFTER ? (
                <View style={styles.nudgeRow}>
                  <Text style={styles.nudgeText}>A natural stopping point, if you want one.</Text>
                  <Pressable
                    style={styles.nudgeButton}
                    onPress={handleEndSession}
                    accessibilityRole="button"
                    accessibilityLabel="Wrap up this session"
                  >
                    <Text style={styles.nudgeButtonText}>Wrap up</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                style={styles.ghostButton}
                onPress={handleEndSession}
                accessibilityRole="button"
                accessibilityLabel="End this discussion session"
              >
                <Text style={styles.ghostButtonText}>End session</Text>
              </Pressable>
            </View>
          )
        ) : null}

        {quotaNotice ? (
          <View style={styles.noticeBanner}>
            <Ionicons name="hourglass-outline" size={14} color={colors.muted} />
            <Text style={styles.noticeText}>{quotaNotice}</Text>
          </View>
        ) : null}
        {sendError ? (
          <View style={[styles.noticeBanner, styles.errorBanner]}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
            <Text style={[styles.noticeText, styles.errorText]}>{sendError}</Text>
          </View>
        ) : null}
        {dictationError ? (
          <View style={[styles.noticeBanner, styles.errorBanner]}>
            <Ionicons name="mic-off-outline" size={14} color={colors.danger} />
            <Text style={[styles.noticeText, styles.errorText]}>{dictationError}</Text>
          </View>
        ) : null}
      </ScrollView>

      {phase === 'deck' && !sendMutation.isPending && !card?.isConvergence && (composerOpen || draft.length > 0) ? (
        // Anchored below the scroll area (D-054 pattern) so Android's
        // window-resize keeps it visible right above the keyboard.
        <View style={[styles.composerBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Your answer, in your own words…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={MAX_MESSAGE_CHARS}
            autoFocus
          />
          <Pressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send your answer"
          >
            <Ionicons name="arrow-up" size={18} color={gold.onFill} />
          </Pressable>
        </View>
      ) : null}
    </KeyboardPane>
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
  stateText: { fontFamily: fonts.serif, color: colors.muted, fontSize: 15 },

  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  contextBook: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  boundaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  boundaryText: { fontFamily: fonts.serif, fontSize: 11, color: colors.muted },

  deckContent: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  slideStage: { width: '100%' },

  // Answered cards collect behind the active one (D-058): paper on paper.
  deckStack: { width: '100%' },
  stackLayer: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 8,
    bottom: -5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stackLayerNear: { transform: [{ rotate: '-1.2deg' }] },
  stackLayerDeep: { transform: [{ rotate: '1.4deg' }], top: 12, bottom: -9, opacity: 0.7 },

  // The orientation hub (D-058): last takeaway, two forks, and the archive.
  hubStack: { gap: 14 },
  takeawayBlock: {
    borderLeftWidth: 3,
    borderLeftColor: gold.base,
    backgroundColor: gold.glowSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  takeawayText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  plainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    ...buttonShadow,
  },
  plainButtonText: { fontFamily: fonts.serif, color: colors.text, fontSize: 14, fontWeight: '700' },

  archiveSection: { gap: 8, marginTop: 2 },
  archiveHeading: {
    fontFamily: fonts.serif,
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 2,
  },
  archiveCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  archiveDate: { fontFamily: fonts.serif, fontSize: 12.5, fontWeight: '700', color: gold.deep },
  archivePreview: { fontFamily: fonts.serif, flex: 1, fontSize: 13, color: colors.muted },
  archiveBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  archivePair: { gap: 4 },
  archiveQuestion: {
    fontFamily: fonts.serif,
    fontSize: 13.5,
    color: colors.muted,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  archiveAnswer: { fontFamily: fonts.serif, fontSize: 14, color: colors.text, lineHeight: 20 },

  // The wrap-up nudge (D-058): offered after a few turns, never forced.
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: gold.glowSoft,
    borderWidth: 1,
    borderColor: gold.base,
  },
  nudgeText: { fontFamily: fonts.serif, flex: 1, fontSize: 13, color: colors.text, fontStyle: 'italic' },
  nudgeButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: gold.fill,
    borderWidth: 1,
    borderColor: gold.deep,
  },
  nudgeButtonText: { fontFamily: fonts.serif, color: gold.onFill, fontSize: 12.5, fontWeight: '700' },

  // The deck's cards: paper inserts resting on the desk (D-054).
  paperCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
    ...cardShadow,
  },
  cardLabel: {
    fontFamily: fonts.serif,
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The in-deck breadcrumb (D-058): a quiet count instead of a scroll trail.
  cardCount: {
    fontFamily: fonts.serif,
    fontSize: 12,
    fontWeight: '700',
    color: gold.deep,
    letterSpacing: 0.4,
  },
  cardBody: { fontFamily: fonts.serif, color: colors.text, fontSize: 14.5, lineHeight: 21 },
  cardLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLoadingText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    fontStyle: 'italic',
  },
  questionText: { fontFamily: fonts.serif, color: colors.text, fontSize: 17, lineHeight: 25 },
  // The wedge card's one-sentence validation (D-059), quiet above the probe.
  mirrorText: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.muted,
    fontSize: 14.5,
    lineHeight: 21,
  },
  // The synthesis card's second line: how the realization reframes the book.
  affirmationText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  // The gold-tinted archival treatment for the convergence card (D-059).
  convergenceCard: {
    backgroundColor: gold.glowSoft,
    borderColor: gold.base,
    borderWidth: 1.5,
  },
  convergenceLabel: { color: gold.deep },

  primerList: { gap: 8 },
  primerLineRow: { flexDirection: 'row', gap: 8 },
  primerBullet: { fontFamily: fonts.serif, color: gold.deep, fontSize: 14.5, lineHeight: 21 },
  primerLineText: {
    fontFamily: fonts.serif,
    flex: 1,
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 21,
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
    paddingVertical: 10,
    marginTop: 4,
    ...buttonShadow,
  },
  goldButtonDisabled: { opacity: 0.5 },
  goldButtonText: { fontFamily: fonts.serif, color: gold.onFill, fontSize: 14, fontWeight: '700' },

  ghostButton: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  ghostButtonText: { fontFamily: fonts.serif, color: colors.muted, fontSize: 13, fontWeight: '600' },

  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedText: { fontFamily: fonts.serif, color: gold.deep, fontSize: 13.5, fontWeight: '700' },

  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  thinkingText: { fontFamily: fonts.serif, color: colors.muted, fontSize: 14, fontStyle: 'italic' },

  answerArea: { gap: 10 },

  // Perspective stems (D-056/D-057): answer starters under the question.
  stemRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stemChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...buttonShadow,
  },
  stemChipText: { fontFamily: fonts.serif, color: colors.text, fontSize: 13, fontWeight: '600' },

  answerActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  micButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...buttonShadow,
  },
  micButtonActive: { backgroundColor: gold.fill, borderColor: gold.deep },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...buttonShadow,
  },
  typeButtonText: { fontFamily: fonts.serif, color: colors.text, fontSize: 13, fontWeight: '600' },

  listeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: gold.glowSoft,
    borderWidth: 1,
    borderColor: gold.base,
  },
  listeningText: {
    fontFamily: fonts.serif,
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontStyle: 'italic',
  },
  listeningStop: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: gold.fill,
    borderWidth: 1,
    borderColor: gold.deep,
  },
  listeningStopText: { fontFamily: fonts.serif, color: gold.onFill, fontSize: 12, fontWeight: '700' },

  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    elevation: 8,
    shadowColor: '#2a1c11',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
  },
  input: {
    fontFamily: fonts.serif,
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 11 : 8,
    paddingBottom: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 15,
    color: colors.text,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...buttonShadow,
  },
  sendButtonDisabled: { opacity: 0.35 },

  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: { fontFamily: fonts.serif, flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 },
  errorBanner: { borderColor: colors.danger },
  errorText: { fontFamily: fonts.serif, color: colors.danger },

  offerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    justifyContent: 'center',
  },
  offerCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 12,
    alignItems: 'flex-start',
    ...cardShadow,
  },
  offerLockBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: gold.glowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  offerBody: { fontFamily: fonts.serif, color: colors.muted, fontSize: 14.5, lineHeight: 22 },
  offerPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: gold.glowSoft,
    borderWidth: 1,
    borderColor: gold.base,
  },
  offerPillText: { fontFamily: fonts.serif, color: gold.deep, fontSize: 12.5, fontWeight: '700' },
});
