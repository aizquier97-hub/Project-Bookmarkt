import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
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
import {
  CompanionRequestError,
  openObservation,
  requestClubPrimer,
  requestObservations,
  sendCompanionMessage,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
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

// The Socratic deck (D-057): primer card -> question cards -> session close.
type DeckPhase = 'primer' | 'deck' | 'closing';

interface DeckCard {
  question: string;
  stems: string[];
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

  const [phase, setPhase] = useState<DeckPhase>('primer');
  const [card, setCard] = useState<DeckCard | null>(null);
  // The reader's own submitted answers this session (D-012: only these can
  // be saved to the journal - never the companion's questions).
  const [answers, setAnswers] = useState<string[]>([]);
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

  // The primer (D-057): a max-3-bullet orientation from the last few notes.
  // Transient - regenerated per visit, never persisted.
  const primerQuery = useQuery({
    queryKey: queryKeys.companionPrimer(bookId),
    queryFn: () => requestClubPrimer(bookId),
    staleTime: 10 * 60_000,
    retry: false,
  });
  // Observation cards (D-056): grounded openers, each now carrying stems.
  const observationsQuery = useQuery({
    queryKey: queryKeys.companionObservations(bookId),
    queryFn: () => requestObservations(bookId),
    staleTime: 10 * 60_000,
    retry: false,
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
    mutationFn: (prompt: string) => openObservation(bookId, prompt),
    onSuccess: () => {
      trackAnalyticsEvent('companion_tool_used', { tool: 'observation_open', status: 'succeeded' }, bookId);
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'observation_open', status }, bookId);
    },
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendCompanionMessage(bookId, message),
    onMutate: () => {
      setSendError(null);
      setQuotaNotice(null);
    },
    onSuccess: (result, message) => {
      setAnswers((prev) => [...prev, message]);
      setDraft('');
      setComposerOpen(false);
      if (result.boundaryLabel) {
        setLatestBoundary(result.boundaryLabel);
      }
      trackAnalyticsEvent('companion_message_sent', { status: 'succeeded' }, bookId);
      const mirror =
        result.reply.content ||
        result.messages.filter((m) => m.role === 'companion').at(-1)?.content ||
        FALLBACK_QUESTION;
      advance(() => setCard({ question: mirror, stems: result.stems }));
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

  const handleStart = () => {
    setSendError(null);
    const first = observations[0];
    if (first) {
      openMutation.mutate(first.prompt);
    }
    advance(() => {
      setPhase('deck');
      setCard(
        first
          ? { question: first.prompt, stems: first.stems }
          : { question: FALLBACK_QUESTION, stems: [] },
      );
    });
  };

  const handleEndSession = () => {
    if (sendMutation.isPending) {
      return;
    }
    advance(() => setPhase('closing'));
  };

  const canSend = draft.trim().length > 0 && !sendMutation.isPending;
  const handleSend = () => {
    const message = draft.trim();
    if (!message || sendMutation.isPending) {
      return;
    }
    sendMutation.mutate(message);
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
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
          {phase === 'primer' ? (
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
            <View style={styles.paperCard}>
              <Text style={styles.cardLabel}>The companion asks</Text>
              <Text style={styles.questionText}>{card.question}</Text>
            </View>
          ) : phase === 'closing' ? (
            <View style={styles.paperCard}>
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
          ) : (
            <View style={styles.answerArea}>
              {card && card.stems.length > 0 ? (
                <View style={styles.stemRow}>
                  {card.stems.map((stem) => (
                    <Pressable
                      key={stem}
                      style={styles.stemChip}
                      onPress={() => {
                        setDraft(`${stem} `);
                        setComposerOpen(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Start your answer with: ${stem}`}
                    >
                      <Text style={styles.stemChipText}>{stem}…</Text>
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

              {composerOpen || draft.length > 0 ? (
                <View style={styles.composerCard}>
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
    </KeyboardAvoidingView>
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
  cardBody: { fontFamily: fonts.serif, color: colors.text, fontSize: 14.5, lineHeight: 21 },
  cardLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLoadingText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    fontStyle: 'italic',
  },
  questionText: { fontFamily: fonts.serif, color: colors.text, fontSize: 17, lineHeight: 25 },

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

  composerCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    ...cardShadow,
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
