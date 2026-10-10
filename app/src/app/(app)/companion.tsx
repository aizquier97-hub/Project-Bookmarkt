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
import { openSubscription } from '@/domains/billing/paywallSource';
import {
  COMPANION_MESSAGE_WINDOW,
  CompanionRequestError,
  deleteSalonMessages,
  fetchCompanionMessages,
  openObservation,
  requestObservations,
  requestSalonInsight,
  sendCompanionMessage,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import {
  abandonedSalons,
  buildSalons,
  completedSalons,
  formatSalonDate,
  type Salon,
} from '@/domains/companion/salons';
import {
  createSalonTracker,
  endSalon,
  noteDraftChanged,
  noteDraftOrigin,
  recordAnswerSent,
  recordConvergence,
  recordPushFurther,
  type SalonEndReason,
  type SalonTracker,
} from '@/domains/companion/salonSignals';
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { cleanupTranscript } from '@/domains/voice/cleanup';
import { useDictation } from '@/domains/voice/useDictation';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold, radii, sizes, spacing } from '@/lib/theme';

const MAX_MESSAGE_CHARS = 2000;

// When the notes are too thin for a grounded observation, the deck still
// opens with something the reader alone can answer (D-012: no plot facts).
const FALLBACK_QUESTION = 'What struck you most in what you last read?';

// The Socratic deck inside session salons (D-058): a returning reader lands
// on the orientation hub; the primer opens a first-ever or fresh discussion.
type DeckPhase = 'hub' | 'primer' | 'deck' | 'closing';

// After this many answers the deck offers - never forces - a wrap-up.
const WRAP_UP_NUDGE_AFTER = 3;

// Salons whose insight is being written right now (D-098). Module-wide, not
// per screen instance: a reader can tap Done while "Distilling…" and re-open
// the Book Club before the row lands, and the new instance's purge must not
// mistake that salon for an abandoned one.
const insightsInFlight = new Set<string>();

// The purge leaves alone anything touched this recently: a salon that is
// mid-request on another instance, or one whose rows are still arriving.
const PURGE_SETTLE_MS = 60_000;

interface DeckCard {
  question: string;
  stems: string[];
  /** Convergence arc (D-059): the one-sentence validation above the question. */
  mirror: string | null;
  /** True when this is the synthesis card - the arc's gold "insight unlocked" close. */
  isConvergence: boolean;
  /** Overrides "The companion asks" - e.g. when the card is a past takeaway (D-098). */
  label?: string;
}

export default function CompanionScreen() {
  // `salon` (D-098): continue a completed discussion from its replay screen.
  const params = useLocalSearchParams<{ id: string; salon?: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const continueSalonId = typeof params.salon === 'string' && params.salon ? params.salon : null;

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
  return <SocraticDeck bookId={bookId} continueSalonId={continueSalonId} />;
}

/**
 * The subscription-offer state (server said not entitled): explains the
 * companion and routes to the subscription screen (Stage 4 Phase 3).
 */
function CompanionOffer() {
  const router = useRouter();
  // The lock itself is the funnel's top (D-086); the tap below is its next step.
  useEffect(() => {
    trackAnalyticsEvent('paywall_hit', { feature: 'companion', reason: 'locked' });
  }, []);
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
          The Book Club is the paid part of Bookmarkt, with a free trial once you have a few entries
          down. Your notes and character maps stay free forever.
        </Text>
        <Pressable
          style={styles.offerButton}
          onPress={() => openSubscription(router, 'club_lock')}
          accessibilityRole="button"
          accessibilityLabel="View plans and free trial"
        >
          <Text style={styles.offerButtonText}>View plans</Text>
        </Pressable>
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
function SocraticDeck({
  bookId,
  continueSalonId,
}: {
  bookId: number;
  continueSalonId: string | null;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [phase, setPhase] = useState<DeckPhase | null>(null);
  const [card, setCard] = useState<DeckCard | null>(null);
  // The active salon (D-058): a client-minted uuid grouping this bounded
  // discussion's messages, so history and the archive stay per-session.
  const [salonId, setSalonId] = useState<string | null>(null);
  const [takeaway, setTakeaway] = useState<string | null>(null);
  // The reader's own submitted answers this session - the closing card's
  // "your thinking" list. The takeaway itself lives in the Book Club (D-098).
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

  // Only completed discussions are kept (D-098). The active salon is a
  // candidate for discarding until its insight is stored; leaving the deck
  // before that - or ending with nothing said - removes its rows. A salon
  // whose insight is still being written is never discarded.
  const activeSalonRef = useRef<{ id: string; keep: boolean } | null>(null);
  const discardSalon = (id: string, reason: 'left' | 'empty' | 'stale') => {
    if (insightsInFlight.has(id)) {
      return;
    }
    trackAnalyticsEvent('salon_discarded', { reason }, bookId);
    void deleteSalonMessages(bookId, id)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.companionMessages(bookId) }))
      .catch(() => {
        // Hidden from the log regardless; the next hub visit retries the purge.
      });
  };
  const beginSalon = (id: string, keep: boolean) => {
    const previous = activeSalonRef.current;
    if (previous && !previous.keep && previous.id !== id) {
      discardSalon(previous.id, 'left');
    }
    activeSalonRef.current = { id, keep };
  };

  // Salon telemetry (D-087): one tally per discussion - answers, how they
  // were seeded, convergences, duration - emitted when the salon ends,
  // including when the reader simply leaves the screen mid-deck.
  const trackerRef = useRef<SalonTracker | null>(null);
  const finishSalon = (reason: SalonEndReason) => {
    const tracker = trackerRef.current;
    if (!tracker) {
      return;
    }
    const summary = endSalon(tracker, reason);
    if (summary) {
      trackAnalyticsEvent('salon_ended', summary, bookId);
    }
  };
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const tracker = trackerRef.current;
      if (tracker) {
        const summary = endSalon(tracker, 'left');
        if (summary) {
          trackAnalyticsEvent('salon_ended', summary, bookId);
        }
      }
      const active = activeSalonRef.current;
      if (active && !active.keep && !insightsInFlight.has(active.id)) {
        trackAnalyticsEvent('salon_discarded', { reason: 'left' }, bookId);
        void deleteSalonMessages(bookId, active.id).catch(() => {});
      }
    };
  }, [bookId]);

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

  // The stored conversation, grouped into salons. Only completed ones -
  // those that reached their insight - feed the hub and the log (D-098).
  const messagesQuery = useQuery({
    queryKey: queryKeys.companionMessages(bookId),
    queryFn: () => fetchCompanionMessages(bookId),
  });
  const allSalons = useMemo(() => buildSalons(messagesQuery.data ?? []), [messagesQuery.data]);
  const salons = useMemo(() => completedSalons(allSalons), [allSalons]);
  const latestSalon = salons[0] ?? null;

  // Land returning readers on the hub; first-timers go straight to the
  // primer; a `salon` param re-opens that completed discussion (D-098).
  useEffect(() => {
    if (phase !== null || messagesQuery.isPending) {
      return;
    }
    const toContinue = continueSalonId
      ? (salons.find((salon) => salon.id === continueSalonId) ?? null)
      : null;
    if (toContinue) {
      handleContinue(toContinue);
      return;
    }
    if (salons.length > 0) {
      trackAnalyticsEvent(
        'salon_hub_viewed',
        { salons: salons.length, discarded: abandonedSalons(allSalons).length },
        bookId,
      );
    }
    setPhase(salons.length > 0 ? 'hub' : 'primer');
    // handleContinue is recreated every render; the phase guard makes this
    // a single fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, messagesQuery.isPending, salons, continueSalonId, bookId]);

  // Discussions that never reached their insight are purged once per visit
  // (D-098) - from a fetch made for the purpose, never the cache, which may
  // predate an insight stored seconds ago. Left alone: this visit's own
  // salon, anything mid-insight, anything touched in the last minute, and
  // everything when the window is full (older rows may hold the insight).
  const purgedRef = useRef(false);
  useEffect(() => {
    if (purgedRef.current || messagesQuery.isPending) {
      return;
    }
    purgedRef.current = true;
    const protectedAtStart = new Set(insightsInFlight);
    void queryClient
      .fetchQuery({
        queryKey: queryKeys.companionMessages(bookId),
        queryFn: () => fetchCompanionMessages(bookId),
        staleTime: 0,
      })
      .then((fresh) => {
        if (!mountedRef.current || fresh.length >= COMPANION_MESSAGE_WINDOW) {
          return;
        }
        const settledBefore = Date.now() - PURGE_SETTLE_MS;
        const active = activeSalonRef.current?.id ?? null;
        for (const stale of abandonedSalons(buildSalons(fresh))) {
          if (
            stale.id === active ||
            stale.id === continueSalonId ||
            protectedAtStart.has(stale.id) ||
            new Date(stale.lastAt).getTime() > settledBefore
          ) {
            continue;
          }
          discardSalon(stale.id, 'stale');
        }
      })
      .catch(() => {
        // Nothing to purge from; the next visit tries again.
      });
    // discardSalon is recreated every render; purgedRef makes this one fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesQuery.isPending, bookId, continueSalonId, queryClient]);

  // Observation cards (D-056): grounded openers, each now carrying stems.
  // Only fetched when the reader is opening a fresh discussion (it spends
  // quota). The D-057 primer call that used to run beside it is gone (D-090):
  // its bullets are no longer shown, so the deck opens one call sooner.
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
  const observationsError = observationsQuery.error;
  useEffect(() => {
    if (observationsError instanceof CompanionRequestError && observationsError.subscriptionRequired) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companionEntitlement });
    }
  }, [observationsError, queryClient]);

  const boundaryLabel = latestBoundary ?? observationsQuery.data?.boundaryLabel ?? null;

  // Straight into the dialogue (D-090): the "Where you stand" card was a
  // stop the owner judged redundant. Once the openers arrive the discussion
  // starts itself; the card remains only as the loading face and for the
  // NO_ENTRIES / error explanations that still need a sentence.
  const autoStartedRef = useRef(false);
  const observationsReady = observationsQuery.isSuccess;
  const noEntries = observationsQuery.data?.code === 'NO_ENTRIES';
  useEffect(() => {
    if (phase !== 'primer' || autoStartedRef.current || !observationsReady || noEntries) {
      return;
    }
    autoStartedRef.current = true;
    handleStart();
    // handleStart is recreated every render; the ref guards the single fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, observationsReady, noEntries]);

  // Opener outcome (D-087, was the primer's): did the openers land, come
  // back empty (NO_ENTRIES), or fail - once per visit.
  const openersTrackedRef = useRef(false);
  const observationsData = observationsQuery.data;
  useEffect(() => {
    if (
      phase !== 'primer' ||
      openersTrackedRef.current ||
      (!observationsData && !observationsError)
    ) {
      return;
    }
    openersTrackedRef.current = true;
    const status = observationsError
      ? observationsError instanceof CompanionRequestError
        ? observationsError.code
        : 'error'
      : noEntries
        ? 'NO_ENTRIES'
        : 'succeeded';
    trackAnalyticsEvent('companion_tool_used', { tool: 'observations', status }, bookId);
  }, [phase, observationsData, observationsError, noEntries, bookId]);

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
      if (trackerRef.current) {
        noteDraftOrigin(trackerRef.current, 'voice');
      }
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
      // The synthesis card (D-059): no chips, no probe - a fork instead.
      const isConvergence =
        result.isConvergence && Boolean(result.mirror || result.probe || result.insight);
      // Answer depth and method (D-087): which card this was, how the reader
      // seeded it, and how long it ran - never the words.
      const tracker = trackerRef.current;
      const sent = tracker ? recordAnswerSent(tracker, input.message.length) : null;
      trackAnalyticsEvent(
        'companion_message_sent',
        {
          status: 'succeeded',
          turn: input.turn,
          ...(sent ?? { chars: input.message.length }),
          convergence: isConvergence,
        },
        bookId,
      );
      if (isConvergence && tracker) {
        trackAnalyticsEvent('salon_convergence_reached', recordConvergence(tracker), bookId);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.companionMessages(bookId) });
      const question =
        result.probe ||
        result.reply.content ||
        result.messages.filter((m) => m.role === 'companion').at(-1)?.content ||
        FALLBACK_QUESTION;
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
          trackAnalyticsEvent('paywall_hit', { feature: 'companion', reason: 'subscription' }, bookId);
          void queryClient.invalidateQueries({ queryKey: queryKeys.companionEntitlement });
          return;
        }
        if (err.quotaExceeded) {
          trackAnalyticsEvent('paywall_hit', { feature: 'companion', reason: 'quota' }, bookId);
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

  // Closing a salon (D-058): distill the reader's answers into a takeaway,
  // stored on the salon - that stored row is what makes the discussion a
  // kept one (D-098). While it is being written the salon is shielded from
  // every discard path; once it lands the salon is kept for good.
  const insightMutation = useMutation({
    mutationFn: (insightText?: string) => {
      if (!salonId) {
        throw new Error('No active salon.');
      }
      // With a crystallized synthesis (D-059) the takeaway saves verbatim;
      // otherwise the companion distills the session's answers (D-058).
      return requestSalonInsight(bookId, salonId, insightText);
    },
    onMutate: () => {
      if (salonId) {
        insightsInFlight.add(salonId);
      }
    },
    onSuccess: (result) => {
      if (activeSalonRef.current) {
        activeSalonRef.current = { ...activeSalonRef.current, keep: true };
      }
      setTakeaway(result.reply.content || null);
      trackAnalyticsEvent('companion_tool_used', { tool: 'insight', status: 'succeeded' }, bookId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.companionMessages(bookId) });
    },
    onError: (err) => {
      // The closing card still shows the reader's answers; the takeaway is a
      // bonus, not a gate. A fresh salon left without one is discarded on
      // the way out, like any other unfinished discussion.
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'insight', status }, bookId);
    },
    onSettled: () => {
      if (salonId) {
        insightsInFlight.delete(salonId);
      }
    },
  });

  const handleStart = () => {
    setSendError(null);
    // A fresh salon for a fresh discussion: minted client-side so every
    // message in this session lands under one id.
    const newSalonId = Crypto.randomUUID();
    setSalonId(newSalonId);
    beginSalon(newSalonId, false);
    setAnswers([]);
    setArcAnswers(0);
    setPendingInsight(null);
    setTakeaway(null);
    const first = observations[0];
    finishSalon('left');
    trackerRef.current = createSalonTracker('new');
    trackAnalyticsEvent(
      'salon_started',
      { mode: 'new', hasObservation: Boolean(first), priorSalons: salons.length },
      bookId,
    );
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

  // Continue a completed discussion (D-098), reached from its replay screen:
  // the active card is the takeaway the reader landed on, and they react to
  // it with the push-further arc (one wedge, then a fresh synthesis, which
  // becomes the salon's insight). The takeaway is persisted as the salon's
  // new opener so the companion's history - and the replay - carry the
  // reaction as an answer to it. The salon already has an insight, so it is
  // kept whatever happens next.
  const handleContinue = (salon: Salon) => {
    if (!salon.insight) {
      return;
    }
    setSendError(null);
    setSalonId(salon.id);
    beginSalon(salon.id, true);
    setAnswers([]);
    setArcAnswers(0);
    setPendingInsight(null);
    setTakeaway(null);
    finishSalon('left');
    trackerRef.current = createSalonTracker('resumed');
    trackAnalyticsEvent(
      'salon_started',
      { mode: 'resumed', hasObservation: false, priorSalons: salons.length },
      bookId,
    );
    openMutation.mutate({ prompt: salon.insight, salonId: salon.id });
    setPhase('deck');
    setCard({
      question: salon.insight,
      stems: [],
      mirror: null,
      isConvergence: false,
      label: 'Where you landed last time',
    });
    setComposerOpen(true);
  };

  const handleNewDiscussion = () => {
    setSendError(null);
    autoStartedRef.current = false;
    advance(() => setPhase('primer'));
  };

  // Both the ghost "End session" button and the post-nudge "Wrap up" land
  // here; the reason tells them apart in the salon summary (D-087). A
  // session with nothing said is discarded, not logged (D-098).
  const handleEndSession = (reason: Extract<SalonEndReason, 'end_session' | 'wrap_up'>) => {
    if (sendMutation.isPending) {
      return;
    }
    if (salonId && answers.length > 0) {
      insightMutation.mutate(pendingInsight ?? undefined);
    } else if (salonId && activeSalonRef.current && !activeSalonRef.current.keep) {
      activeSalonRef.current = null;
      discardSalon(salonId, 'empty');
    }
    finishSalon(reason);
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
    trackAnalyticsEvent('salon_fork', { choice: 'save_finish', answers: answers.length }, bookId);
    finishSalon('save_finish');
    advance(() => setPhase('closing'));
  };

  const handlePushFurther = () => {
    if (!card) {
      return;
    }
    if (trackerRef.current) {
      recordPushFurther(trackerRef.current);
    }
    trackAnalyticsEvent('salon_fork', { choice: 'push_further', answers: answers.length }, bookId);
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

  // The dictation controls (D-016), shared by the pinned answer footer and
  // the composer bar (D-098) so speaking is never more than one tap away.
  const recording = dictationStatus === 'recording';
  const micButton =
    dictationStatus !== 'unavailable' ? (
      <Pressable
        style={[styles.micButton, recording && styles.micButtonActive]}
        onPress={() => {
          if (recording) {
            stopDictation();
          } else {
            void startDictation();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Finish dictating' : 'Speak your answer'}
      >
        <Ionicons
          name={recording ? 'stop' : 'mic'}
          size={18}
          color={recording ? colors.onAccent : colors.text}
        />
      </Pressable>
    ) : null;
  const listeningRow = recording ? (
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
  ) : null;

  return (
    <KeyboardPane style={styles.flex} keyboardVerticalOffset={88}>
      <Stack.Screen options={{ title: 'Book Club' }} />
      {bookName ? (
        <View style={styles.contextBar}>
          <Text style={styles.contextBook} numberOfLines={1}>
            {bookName}
          </Text>
          <View style={styles.boundaryChip}>
            <Ionicons name="shield-checkmark-outline" size={12} color={gold.deep} />
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
          ) : phase === 'hub' && latestSalon?.insight ? (
            <View style={styles.hubStack}>
              <View style={styles.paperCard}>
                <Text style={styles.cardLabel}>Last time, your takeaway</Text>
                <View style={styles.takeawayBlock}>
                  <Text style={styles.takeawayText}>{latestSalon.insight}</Text>
                </View>
                <Pressable
                  style={styles.goldButton}
                  onPress={handleNewDiscussion}
                  accessibilityRole="button"
                  accessibilityLabel="Start a new discussion"
                >
                  <Ionicons name="add" size={15} color={colors.onAccent} />
                  <Text style={styles.goldButtonText}>Start a new discussion</Text>
                </Pressable>
              </View>

              {/* The log (D-098): each completed discussion as its key insight;
                  the card opens the replay, where the full exchange lives. */}
              <View style={styles.archiveSection}>
                <Text style={styles.archiveHeading}>Past discussions</Text>
                {salons.map((salon, index) => (
                  <Pressable
                    key={salon.id}
                    style={({ pressed }) => [styles.archiveCard, pressed && styles.archiveCardPressed]}
                    onPress={() => {
                      trackAnalyticsEvent(
                        'salon_archive_opened',
                        { index, total: salons.length, pairs: salon.pairs.length },
                        bookId,
                      );
                      router.push({
                        pathname: '/salon-replay',
                        params: { id: String(bookId), salon: salon.id },
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Relive the discussion from ${formatSalonDate(salon.startedAt)}`}
                  >
                    <View style={styles.archiveHeader}>
                      <Text style={styles.archiveDate}>{formatSalonDate(salon.startedAt)}</Text>
                      <Text style={styles.archiveHint}>Relive</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.muted} />
                    </View>
                    <View style={styles.takeawayBlock}>
                      <Text style={styles.takeawayText}>{salon.insight}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : phase === 'primer' ? (
            <View style={styles.paperCard}>
              {observationsQuery.isError ? (
                <>
                  <Text style={styles.cardLabel}>Before we begin</Text>
                  <Text style={styles.cardBody}>
                    {observationsError instanceof CompanionRequestError &&
                    observationsError.quotaExceeded
                      ? observationsError.message
                      : 'I could not read your notes just now — we can still talk.'}
                  </Text>
                  <Pressable
                    style={styles.goldButton}
                    onPress={handleStart}
                    accessibilityRole="button"
                    accessibilityLabel="Start the discussion"
                  >
                    <Ionicons name="chatbubble-ellipses" size={15} color={colors.onAccent} />
                    <Text style={styles.goldButtonText}>Start discussion</Text>
                  </Pressable>
                </>
              ) : noEntries ? (
                <>
                  <Text style={styles.cardLabel}>Before we begin</Text>
                  <Text style={styles.cardBody}>{observationsQuery.data?.reply.content}</Text>
                </>
              ) : (
                <View style={styles.cardLoadingRow}>
                  <ActivityIndicator size="small" color={colors.muted} />
                  <Text style={styles.cardLoadingText}>Reading your recent notes…</Text>
                </View>
              )}
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
                    {card.isConvergence ? 'Insight unlocked' : (card.label ?? 'The companion asks')}
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
                  {/* The insight is the Book Club's own record (D-098): kept
                      under Past discussions, never filed as a journal entry. */}
                  <View style={styles.savedRow}>
                    <Ionicons name="checkmark-circle" size={15} color={gold.deep} />
                    <Text style={styles.savedText}>Kept in your Book Club.</Text>
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
                  You kept your counsel this session — nothing to keep yet.
                </Text>
              )}
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
                <Ionicons name="bookmark" size={15} color={colors.onAccent} />
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
                        if (trackerRef.current) {
                          noteDraftOrigin(trackerRef.current, 'chip');
                        }
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

              {answers.length >= WRAP_UP_NUDGE_AFTER ? (
                <View style={styles.nudgeRow}>
                  <Text style={styles.nudgeText}>A natural stopping point, if you want one.</Text>
                  <Pressable
                    style={styles.nudgeButton}
                    onPress={() => handleEndSession('wrap_up')}
                    accessibilityRole="button"
                    accessibilityLabel="Wrap up this session"
                  >
                    <Text style={styles.nudgeButtonText}>Wrap up</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                style={styles.ghostButton}
                onPress={() => handleEndSession('end_session')}
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

      {phase === 'deck' && !sendMutation.isPending && !card?.isConvergence ? (
        composerOpen || draft.length > 0 ? (
          // Anchored below the scroll area (D-054 pattern) so Android's
          // window-resize keeps it visible right above the keyboard. The mic
          // rides along (D-098) so dictation stays one tap away while typing.
          <View style={[styles.composerBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            {listeningRow}
            <View style={styles.composerRow}>
              {micButton}
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={(text) => {
                  if (trackerRef.current) {
                    noteDraftChanged(trackerRef.current, text.length);
                  }
                  setDraft(text);
                }}
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
                <Ionicons name="arrow-up" size={18} color={colors.onAccent} />
              </Pressable>
            </View>
          </View>
        ) : (
          // The ways to answer sit above the system bar as their own footer
          // (D-098): the stems scroll with the card, this row never does.
          <View style={[styles.answerFooter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            {listeningRow}
            <View style={styles.answerActionsRow}>
              {micButton}
              <Pressable
                style={styles.typeButton}
                onPress={() => {
                  if (trackerRef.current) {
                    noteDraftOrigin(trackerRef.current, 'typed');
                  }
                  setComposerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Type your own thought"
              >
                <Ionicons name="pencil" size={14} color={colors.text} />
                <Text style={styles.typeButtonText}>Type my own thought</Text>
              </Pressable>
            </View>
          </View>
        )
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
  boundaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.chip,
    backgroundColor: gold.glowSoft,
  },
  boundaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: gold.deep,
  },

  deckContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
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

  // The orientation hub (D-058): last takeaway, a fresh start, and the log.
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
    fontSize: 18,
    lineHeight: 26,
  },

  // The log (D-098): one card per completed discussion, insight only.
  archiveSection: { gap: 8, marginTop: 2 },
  archiveHeading: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  archiveCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 14,
    gap: 10,
    ...cardShadow,
  },
  archiveCardPressed: { opacity: 0.85 },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  archiveDate: {
    fontFamily: fonts.sansSemiBold,
    flex: 1,
    fontSize: 13,
    color: colors.accent,
  },
  archiveHint: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: colors.muted,
  },

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
  nudgeText: { fontFamily: fonts.sans, flex: 1, fontSize: 13, color: colors.text },
  nudgeButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  nudgeButtonText: { fontFamily: fonts.sansSemiBold, color: colors.onAccent, fontSize: 12.5 },

  // The deck's cards: paper inserts resting on the desk (D-054).
  paperCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...cardShadow,
  },
  cardLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The in-deck breadcrumb (D-058): a quiet count instead of a scroll trail.
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
  cardBody: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  cardLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLoadingText: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 14,
  },
  questionText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 25,
    lineHeight: 33,
  },
  // The wedge card's one-sentence validation (D-059), quiet above the probe.
  mirrorText: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 14.5,
    lineHeight: 21,
  },
  // The synthesis card's second line: how the realization reframes the book.
  affirmationText: {
    fontFamily: fonts.sans,
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
  primerBullet: { fontFamily: fonts.sans, color: gold.deep, fontSize: 14.5, lineHeight: 21 },
  primerLineText: {
    fontFamily: fonts.sans,
    flex: 1,
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 21,
  },


  goldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: sizes.button,
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    ...buttonShadow,
  },
  goldButtonDisabled: { opacity: 0.5 },
  goldButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 15,
  },

  ghostButton: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  ghostButtonText: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 14,
  },

  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedText: { fontFamily: fonts.sansSemiBold, color: gold.deep, fontSize: 13.5 },

  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  thinkingText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14 },

  answerArea: { gap: 10 },

  // The pinned ways-to-answer row (D-098): parchment over the system bar.
  answerFooter: {
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },

  // Perspective stems (D-056/D-057): answer starters under the question.
  stemRow: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  stemChip: {
    minHeight: sizes.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  stemChipText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.accent,
    fontSize: 14,
    textAlign: 'center',
  },

  answerActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  micButton: {
    width: sizes.button,
    height: sizes.button,
    borderRadius: radii.field,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: sizes.button,
    paddingHorizontal: spacing.md,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  typeButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.accent,
    fontSize: 14,
  },

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
    fontFamily: fonts.sans,
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  listeningStop: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  listeningStopText: { fontFamily: fonts.sansSemiBold, color: colors.onAccent, fontSize: 12 },

  composerBar: {
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
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    fontFamily: fonts.sans,
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
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderColor: colors.accent,
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
  noticeText: { fontFamily: fonts.sans, flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 },
  errorBanner: { borderColor: colors.danger },
  errorText: { fontFamily: fonts.sans, color: colors.danger },

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
    color: colors.text,
  },
  offerBody: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14.5, lineHeight: 22 },
  offerButton: {
    marginTop: 4,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    ...buttonShadow,
  },
  offerButtonText: { fontFamily: fonts.sansSemiBold, color: colors.onAccent, fontSize: 15 },
});
