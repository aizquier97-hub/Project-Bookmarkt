import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addEntry } from '@/domains/entries/service';
import { computeComprehensionFactor, computeEffort } from '@/domains/fitness/activity';
import { playTimerBell } from '@/domains/fitness/bell';
import { countWords } from '@/domains/fitness/difficulty';
import { sessionPacePagesPerMinute } from '@/domains/fitness/fitness';
import type { BookFitness } from '@/domains/fitness/model';
import { createReadingSession } from '@/domains/fitness/service';
import {
  clearTimerAlarm,
  ensureTimerAlarmPermission,
  maybePromptForExactAlarms,
  rescheduleTimerAlarmIfNowExact,
  scheduleTimerAlarm,
  settleTimerAlarm,
  type TimerAlarmHandle,
} from '@/domains/fitness/timerAlarm';
import {
  computeTrophyProgress,
  newlyUnlockedSegments,
  trophyUnlockMessage,
  type TrophySegment,
} from '@/domains/fitness/trophies';
import { READING_MODEL_KEYS, useReadingModel } from '@/domains/fitness/useReadingModel';
import type { Book } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { useDictation } from '@/domains/voice/useDictation';
import { BookPickerRow } from '@/components/BookPickerRow';
import { CharacterSuggestions } from '@/components/CharacterSuggestions';
import { DictationPanel } from '@/components/DictationPanel';
import { KeyboardPane } from '@/components/KeyboardPane';
import { Sandglass } from '@/components/Sandglass';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { TrophyStrip } from '@/components/TrophyStrip';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold, radii, sizes, spacing } from '@/lib/theme';

const DURATION_CHOICES_MIN = [10, 15, 20, 25, 30, 45, 60] as const;
/** Custom sittings (D-077) accept anything from one minute to four hours. */
const CUSTOM_MIN_MINUTES = 1;
const CUSTOM_MAX_MINUTES = 240;
/** Sessions shorter than this are discarded rather than logged. */
const MIN_SESSION_SECONDS = 60;

/** Shown once per app run when notifications are refused (D-083). */
let bellPermissionToastShown = false;

type Phase = 'setup' | 'running' | 'wrapup' | 'saved';

interface SavedSummary {
  minutes: number;
  pages: number | null;
  effort: number | null;
  pacePagesPerMinute: number | null;
  unlocked: TrophySegment[];
  noteSaved: boolean;
  noteError: string | null;
  /** The note as saved, for the companion's character pass (D-077). */
  noteText: string;
  /** Page the reader stopped on, when they told us. */
  endPage: number | null;
}

/**
 * The Sandglass reading timer (D-062): pick a book and a sitting length,
 * turn the glass, and read. The phone shows nothing but the falling sand
 * and a single "Leave early" exit; when the sand runs out it buzzes and
 * asks where you stopped so the session feeds Reading Fitness, streaks, and
 * trophy pieces.
 */
export default function ReadingTimerScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const preselectedId = Number(params.id);
  const modelQuery = useReadingModel();
  const [bookId, setBookId] = useState<number | null>(
    Number.isInteger(preselectedId) && preselectedId > 0 ? preselectedId : null,
  );

  const books = modelQuery.model?.books ?? [];
  const selected = bookId !== null ? books.find((item) => item.book.id === bookId) ?? null : null;

  if (modelQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Reading session' }} />
        <LoadingState label="Setting the glass…" />
      </View>
    );
  }
  if (modelQuery.isError || !modelQuery.model) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Reading session' }} />
        <ErrorState
          error={modelQuery.error}
          fallback="Could not load your books."
          onRetry={() => void modelQuery.refetch()}
        />
      </View>
    );
  }

  if (!selected) {
    const candidates = [...books]
      .filter((item) => !item.book.finished_at)
      .sort((a, b) => (b.lastActiveDay ?? '').localeCompare(a.lastActiveDay ?? ''));
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: 'Reading session' }} />
        <ScrollView contentContainerStyle={styles.pickerContent}>
          <Text style={styles.pickerTitle}>Which book are you sitting down with?</Text>
          {candidates.length === 0 ? (
            <EmptyState message="Add a book to your library to start a reading session." />
          ) : (
            candidates.map((item) => (
              <BookPickerRow
                key={item.book.id}
                book={item.book}
                onPress={() => setBookId(item.book.id)}
              />
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return <TimerFlow key={selected.book.id} fitness={selected} onChangeBook={() => setBookId(null)} />;
}

function TimerFlow({
  fitness,
  onChangeBook,
}: {
  fitness: BookFitness<Book>;
  onChangeBook: () => void;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const book = fitness.book;

  const [phase, setPhase] = useState<Phase>('setup');
  const [chipMinutes, setChipMinutes] = useState<number>(20);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [startPage, setStartPage] = useState(fitness.currentPage > 0 ? String(fitness.currentPage) : '');
  const [endPage, setEndPage] = useState('');
  const [note, setNote] = useState('');
  const [rawTranscripts, setRawTranscripts] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const finishedRef = useRef(false);
  const runningRef = useRef(false);
  // The background bell (D-083): a local notification queued for the planned end.
  const alarmRef = useRef<TimerAlarmHandle | null>(null);
  const dictation = useDictation();

  // A custom length (D-077) replaces the chip while its field is open; an
  // empty or out-of-range value simply disables "Turn the glass".
  const customValue = parseCustomMinutes(customMinutes);
  const plannedMinutes = customOpen ? customValue ?? 0 : chipMinutes;
  const canStart = plannedMinutes >= CUSTOM_MIN_MINUTES;

  const plannedSeconds = plannedMinutes * 60;
  const elapsedSeconds = startedAt
    ? Math.max(0, Math.floor(((endedAt ? endedAt.getTime() : now) - startedAt.getTime()) / 1000))
    : 0;
  const remainingSeconds = Math.max(0, plannedSeconds - elapsedSeconds);
  const progress = plannedSeconds > 0 ? Math.min(1, elapsedSeconds / plannedSeconds) : 0;

  // Tick once a second while running; time is derived from wall-clock so a
  // backgrounded app catches up the moment it returns.
  useEffect(() => {
    if (phase !== 'running') {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === 'running' && remainingSeconds === 0 && !finishedRef.current) {
      finishedRef.current = true;
      runningRef.current = false;
      const alarm = alarmRef.current;
      alarmRef.current = null;
      // If the notification already rang while the app was away, only buzz.
      void settleTimerAlarm(alarm).then((alreadyRang) => playTimerBell({ vibrateOnly: alreadyRang }));
      setEndedAt(new Date());
      setPhase('wrapup');
    }
  }, [phase, remainingSeconds]);

  // Coming back to the screen: catch the clock up at once and, if the reader
  // just enabled "Alarms & reminders", re-queue the bell as an exact alarm.
  useEffect(() => {
    if (phase !== 'running') {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      setNow(Date.now());
      void rescheduleTimerAlarmIfNowExact(alarmRef.current, {
        bookTitle: book.name,
        plannedMinutes,
      }).then((next) => {
        if (runningRef.current) {
          alarmRef.current = next;
        } else {
          void clearTimerAlarm(next);
        }
      });
    });
    return () => subscription.remove();
  }, [phase, book.name, plannedMinutes]);

  // Leaving the screen for any reason drops a pending bell.
  useEffect(
    () => () => {
      runningRef.current = false;
      void clearTimerAlarm(alarmRef.current);
      alarmRef.current = null;
    },
    [],
  );

  // Wrap-up abandonment (D-087): time was read but the sitting never saved -
  // the reader backed out of "Time's up". Refs let the unmount cleanup see
  // the final state (the snapshot is taken below, after saveMutation exists).
  const wrapupRef = useRef<{
    active: boolean;
    elapsedSeconds: number;
    plannedSeconds: number;
    hadNote: boolean;
    hadEndPage: boolean;
  }>({ active: false, elapsedSeconds: 0, plannedSeconds: 0, hadNote: false, hadEndPage: false });
  useEffect(
    () => () => {
      const state = wrapupRef.current;
      if (state.active) {
        trackAnalyticsEvent(
          'timer_wrapup_abandoned',
          {
            elapsedSeconds: state.elapsedSeconds,
            plannedSeconds: state.plannedSeconds,
            hadNote: state.hadNote,
            hadEndPage: state.hadEndPage,
          },
          book.id,
        );
      }
    },
    [book.id],
  );

  // While the glass runs, back navigation asks first (D-062: exit button only).
  useEffect(() => {
    if (phase !== 'running') {
      return;
    }
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      confirmLeaveEarly(() => navigation.dispatch(event.data.action));
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, phase, elapsedSeconds]);

  const start = async () => {
    // Ask for notifications first so the glass is turned the moment the
    // prompt closes; on runtimes without the module this resolves at once.
    const permission = await ensureTimerAlarmPermission();
    if (permission === 'denied' && !bellPermissionToastShown) {
      bellPermissionToastShown = true;
      showToast('Notifications are off, so the bell only rings while Bookmarkt is open.', 'info');
    }

    finishedRef.current = false;
    runningRef.current = true;
    const begun = new Date();
    setStartedAt(begun);
    setEndedAt(null);
    setNow(begun.getTime());
    setPhase('running');
    // Start of the funnel (D-087): completed/abandoned already exist; this
    // gives them a denominator and shows which lengths readers choose.
    trackAnalyticsEvent(
      'reading_session_started',
      {
        plannedMinutes,
        customLength: customOpen,
        hasStartPage: parseOptionalPage(startPage) !== null,
        bellPermission: permission,
      },
      book.id,
    );

    if (permission !== 'granted') {
      return;
    }
    const alarm = await scheduleTimerAlarm({
      endsAt: new Date(begun.getTime() + plannedSeconds * 1000),
      bookTitle: book.name,
      plannedMinutes,
    });
    if (!runningRef.current) {
      void clearTimerAlarm(alarm);
      return;
    }
    alarmRef.current = alarm;
    if (alarm && !alarm.exact) {
      void maybePromptForExactAlarms();
    }
  };

  const endEarly = () => {
    runningRef.current = false;
    void clearTimerAlarm(alarmRef.current);
    alarmRef.current = null;
    if (elapsedSeconds < MIN_SESSION_SECONDS) {
      trackAnalyticsEvent('reading_session_abandoned', { elapsedSeconds, plannedSeconds }, book.id);
      showToast('Session discarded - it was under a minute.', 'info');
      setPhase('setup');
      setStartedAt(null);
      return;
    }
    // Left early but long enough to count (D-087): the sitting goes to
    // wrap-up like a completed one, so the pair tells planned vs actual.
    trackAnalyticsEvent('reading_session_ended_early', { elapsedSeconds, plannedSeconds }, book.id);
    setEndedAt(new Date());
    setPhase('wrapup');
  };

  const confirmLeaveEarly = (onConfirm?: () => void) => {
    Alert.alert(
      'Leave the glass early?',
      elapsedSeconds >= MIN_SESSION_SECONDS
        ? `Your ${formatMinutes(elapsedSeconds)} so far still count toward your reading.`
        : 'Sessions under a minute are not logged.',
      [
        { text: 'Keep reading', style: 'cancel' },
        {
          text: 'End session',
          style: 'destructive',
          onPress: () => {
            endEarly();
            onConfirm?.();
          },
        },
      ],
    );
  };

  const saveMutation = useMutation({
    mutationFn: async (): Promise<SavedSummary> => {
      if (!startedAt || !endedAt) {
        throw new Error('The session has not finished yet.');
      }
      const startValue = parseOptionalPage(startPage);
      const endValue = parseOptionalPage(endPage);
      const session = await createReadingSession({
        bookId: book.id,
        startedAt,
        endedAt,
        plannedSeconds,
        startPage: startValue,
        endPage: endValue,
      });

      let noteSaved = false;
      let noteError: string | null = null;
      const trimmedNote = note.trim();
      if (trimmedNote && endValue !== null) {
        try {
          await addEntry(book.id, {
            text: trimmedNote,
            progressType: 'page',
            progressValue: endValue,
            rawTranscript: rawTranscripts.length > 0 ? rawTranscripts.join('\n') : null,
            source: 'timer',
          });
          noteSaved = true;
        } catch (err) {
          noteError = err instanceof Error ? err.message : 'Could not save the note.';
        }
      }

      const pages = session.pages_read;
      const comprehension = computeComprehensionFactor({
        entries: noteSaved ? 1 : 0,
        noteWords: noteSaved ? countWords(trimmedNote) : 0,
        hasImportant: false,
        hasQuoteReflection: false,
      });
      const effort = pages !== null ? computeEffort(pages, fitness.difficulty.score, comprehension) : null;
      const pacePagesPerMinute = sessionPacePagesPerMinute(pages, session.duration_seconds);

      const after = computeTrophyProgress({
        totalPages: book.total_pages,
        currentPage: Math.max(fitness.currentPage, endValue ?? 0),
        finished: Boolean(book.finished_at),
      });
      const unlocked = newlyUnlockedSegments(fitness.trophy, after);
      for (const piece of unlocked) {
        trackAnalyticsEvent('trophy_piece_unlocked', { piece: piece.index, source: 'timer' }, book.id);
      }

      return {
        minutes: Math.round(session.duration_seconds / 60),
        pages,
        effort,
        pacePagesPerMinute,
        unlocked,
        noteSaved,
        noteError,
        noteText: noteSaved ? trimmedNote : '',
        endPage: endValue,
      };
    },
    onSuccess: (summary) => {
      setSaved(summary);
      setPhase('saved');
      for (const key of READING_MODEL_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(book.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
      if (summary.unlocked.length > 0) {
        showToast(trophyUnlockMessage(book.name, summary.unlocked), 'success');
      }
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Could not save the session.', 'error');
    },
  });
  wrapupRef.current = {
    active: phase === 'wrapup' && !saveMutation.isPending,
    elapsedSeconds,
    plannedSeconds,
    hadNote: note.trim().length > 0,
    hadEndPage: parseOptionalPage(endPage) !== null,
  };

  const pagesPreview = useMemo(() => {
    const startValue = parseOptionalPage(startPage);
    const endValue = parseOptionalPage(endPage);
    if (startValue === null || endValue === null || endValue < startValue) {
      return null;
    }
    return endValue - startValue;
  }, [startPage, endPage]);

  if (phase === 'running') {
    return (
      <View style={[styles.focus, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Text style={styles.focusBook} numberOfLines={2}>
          {book.name}
        </Text>
        <Text style={styles.focusHint}>The glass is running. Read.</Text>
        <View style={styles.focusGlass}>
          <Sandglass progress={progress} size={190} running />
        </View>
        <Text style={styles.focusTime} accessibilityLiveRegion="polite">
          {formatClock(remainingSeconds)}
        </Text>
        <Text style={styles.focusPlanned}>of {plannedMinutes} min</Text>
        <Pressable
          style={({ pressed }) => [styles.leaveButton, pressed && styles.pressed]}
          onPress={() => confirmLeaveEarly()}
          accessibilityRole="button"
          accessibilityLabel="Leave early"
        >
          <Ionicons name="exit-outline" size={18} color={colors.onWalnutMuted} />
          <Text style={styles.leaveText}>Leave early</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'wrapup') {
    return (
      <KeyboardPane style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Stack.Screen options={{ title: 'Session complete', headerShown: true, gestureEnabled: true }} />
          <View style={styles.card}>
            <View style={styles.wrapHeader}>
              <Sandglass progress={1} size={56} />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Time’s up</Text>
                <Text style={styles.cardBody}>
                  {formatMinutes(elapsedSeconds)} with {book.name}.
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.label}>Page you stopped on</Text>
          <TextInput
            style={styles.input}
            value={endPage}
            onChangeText={setEndPage}
            keyboardType="number-pad"
            placeholder={startPage ? `after page ${startPage}` : 'e.g., 142'}
            placeholderTextColor={colors.muted}
            autoFocus
          />
          {pagesPreview !== null ? (
            <Text style={styles.hint}>
              {pagesPreview} {pagesPreview === 1 ? 'page' : 'pages'} this sitting
              {book.total_pages ? ` - ${Math.round((Number(endPage) / book.total_pages) * 100)}% of the book` : ''}
            </Text>
          ) : (
            <Text style={styles.hint}>
              Started on page {startPage || '?'}. Pages power your pace and trophy pieces.
            </Text>
          )}

          <Text style={styles.heading}>
            One line about where you are <Text style={styles.headingNote}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="A thought, a question, where the story left you…"
            placeholderTextColor={colors.muted}
          />
          <DictationPanel
            dictation={dictation}
            startLabel={note.trim() ? 'Add by voice' : 'Speak it instead'}
            listeningLabel="Listening - say where the story left you"
            confirmLabel="Use this"
            onConfirm={(raw, cleaned) => {
              setNote((current) => (current.trim() ? `${current.trimEnd()}\n${cleaned}` : cleaned));
              setRawTranscripts((current) => [...current, raw]);
            }}
          />
          <Text style={styles.hint}>
            Saved as a bookmark entry at the page above. Notes lift your comprehension score.
          </Text>

          <Pressable
            style={[styles.primaryButton, saveMutation.isPending && styles.disabled]}
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Save session"
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.primaryButtonText}>Save session</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardPane>
    );
  }

  if (phase === 'saved' && saved) {
    // Which door the reader takes after a sitting (D-087): the entry, the
    // book, or the profile - with whether a note was already written.
    const nextStep = (choice: 'write_entry' | 'open_book' | 'profile') =>
      trackAnalyticsEvent(
        'timer_next_step',
        { choice, noteSaved: saved.noteSaved, hasEndPage: saved.endPage !== null },
        book.id,
      );
    const openBook = () => {
      nextStep('open_book');
      router.replace({ pathname: '/book/[id]', params: { id: String(book.id) } });
    };
    // The sitting is logged; the next step is the entry (D-064). A sitting
    // without a note hands off straight into the entry composer (its own
    // screen since D-092) with the stopping page already filled in, before
    // the thought fades. Saving there returns to the book underneath.
    const writeEntry = () => {
      nextStep('write_entry');
      router.replace({
        pathname: '/compose-entry',
        params: {
          id: String(book.id),
          mode: 'write',
          source: 'timer_handoff',
          ...(saved.endPage !== null ? { page: String(saved.endPage) } : {}),
        },
      });
    };
    // After the note, the people in it (D-077): Book Club readers get the
    // companion's pass over the note; everyone gets a one-tap path into the
    // character composer, typed or spoken.
    const addCharacter = (mode: 'write' | 'speak') => {
      trackAnalyticsEvent('timer_character_prompt_used', { mode }, book.id);
      router.replace({
        pathname: '/book/[id]',
        params: { id: String(book.id), tab: 'characters', composeCharacter: mode },
      });
    };
    const firstNoted = saved.endPage !== null ? `page ${saved.endPage}` : '';
    return (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Stack.Screen options={{ title: 'Session saved', headerShown: true, gestureEnabled: true }} />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Logged</Text>
          <View style={styles.statRow}>
            <Stat label="Minutes" value={String(saved.minutes)} />
            <Stat label="Pages" value={saved.pages !== null ? String(saved.pages) : '-'} />
            <Stat
              label="Pace"
              value={saved.pacePagesPerMinute !== null ? `${saved.pacePagesPerMinute}/min` : '-'}
            />
            <Stat label="Effort" value={saved.effort !== null ? String(Math.round(saved.effort)) : '-'} />
          </View>
          <Text style={styles.cardBody}>
            Effort = pages x difficulty weight ({fitness.difficulty.score}/10 → x
            {(fitness.difficulty.score / 5).toFixed(2)}) x comprehension factor
            {saved.noteSaved ? ' (note written)' : ' (no note)'}.
          </Text>
          {saved.noteError ? (
            <Text style={styles.warning}>Session saved, but the note was not: {saved.noteError}</Text>
          ) : null}
        </View>

        {saved.unlocked.length > 0 ? (
          <View style={[styles.card, styles.celebration]}>
            <Ionicons name="trophy" size={28} color={gold.base} />
            <Text style={styles.celebrationText}>{trophyUnlockMessage(book.name, saved.unlocked)}</Text>
          </View>
        ) : null}

        {!saved.noteSaved ? (
          <View style={[styles.card, styles.promptCard]}>
            <View style={styles.wrapHeader}>
              <Ionicons name="create-outline" size={26} color={colors.accent} />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Now, one line about it</Text>
                <Text style={styles.cardBody}>
                  {saved.pages !== null && saved.pages > 0
                    ? `What happened in those ${saved.pages} pages? An entry lifts this sitting’s comprehension score and keeps the thread for later.`
                    : 'What happened while you read? An entry lifts this sitting’s comprehension score and keeps the thread for later.'}
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.primaryButton}
              onPress={writeEntry}
              accessibilityRole="button"
              accessibilityLabel="Write an entry about this session"
            >
              <Text style={styles.primaryButtonText}>Write an entry</Text>
            </Pressable>
          </View>
        ) : null}

        {saved.noteSaved ? (
          <View style={[styles.card, styles.promptCard]}>
            <View style={styles.wrapHeader}>
              <Ionicons name="people-outline" size={26} color={colors.accent} />
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Did you meet someone new?</Text>
                <Text style={styles.cardBody}>
                  Add them to the character map while the name is fresh.
                </Text>
              </View>
            </View>
            <CharacterSuggestions bookId={book.id} noteText={saved.noteText} firstNoted={firstNoted} />
            <View style={styles.buttonRow}>
              <Pressable
                style={[styles.secondaryButton, styles.flex, styles.rowButton]}
                onPress={() => addCharacter('write')}
                accessibilityRole="button"
                accessibilityLabel="Add a character by typing"
              >
                <Ionicons name="create-outline" size={18} color={colors.accent} />
                <Text style={styles.secondaryButtonText}>Add a character</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, styles.flex, styles.rowButton]}
                onPress={() => addCharacter('speak')}
                accessibilityRole="button"
                accessibilityLabel="Add a character by voice"
              >
                <Ionicons name="mic-outline" size={18} color={colors.accent} />
                <Text style={styles.secondaryButtonText}>Speak one</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{book.name}</Text>
          <TrophyStrip
            progress={computeTrophyProgress({
              totalPages: book.total_pages,
              currentPage: Math.max(fitness.currentPage, parseOptionalPage(endPage) ?? 0),
              finished: Boolean(book.finished_at),
            })}
          />
        </View>

        {saved.noteSaved ? (
          <Pressable style={styles.primaryButton} onPress={openBook} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Open the book</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={openBook} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Open the book without an entry</Text>
          </Pressable>
        )}
        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            nextStep('profile');
            router.replace('/');
          }}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>See my profile</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardPane style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ title: 'Reading session', headerShown: true, gestureEnabled: true }} />
        <View style={styles.card}>
          <View style={styles.wrapHeader}>
            <Sandglass progress={0} size={56} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {book.name}
              </Text>
              {book.author ? <Text style={styles.cardBody}>{book.author}</Text> : null}
              <Pressable onPress={onChangeBook} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>Choose a different book</Text>
              </Pressable>
            </View>
          </View>
          <TrophyStrip progress={fitness.trophy} compact />
        </View>

        <Text style={styles.heading}>How long is this sitting?</Text>
        <View style={styles.chipRow}>
          {DURATION_CHOICES_MIN.map((minutes) => {
            const active = !customOpen && chipMinutes === minutes;
            return (
              <Pressable
                key={minutes}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  setCustomOpen(false);
                  setChipMinutes(minutes);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${minutes} minutes`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{minutes} min</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.chip, customOpen && styles.chipActive]}
            onPress={() => setCustomOpen(true)}
            accessibilityRole="button"
            accessibilityState={{ selected: customOpen }}
            accessibilityLabel="Custom length"
          >
            <Text style={[styles.chipText, customOpen && styles.chipTextActive]}>Custom</Text>
          </Pressable>
        </View>
        {customOpen ? (
          <>
            <TextInput
              style={styles.input}
              value={customMinutes}
              onChangeText={setCustomMinutes}
              keyboardType="number-pad"
              placeholder="minutes, e.g., 35"
              placeholderTextColor={colors.muted}
              autoFocus
              accessibilityLabel="Custom length in minutes"
            />
            <Text style={styles.hint}>
              {customValue === null && customMinutes.trim()
                ? `Pick between ${CUSTOM_MIN_MINUTES} and ${CUSTOM_MAX_MINUTES} minutes.`
                : `Anything from ${CUSTOM_MIN_MINUTES} minute to ${CUSTOM_MAX_MINUTES / 60} hours.`}
            </Text>
          </>
        ) : null}

        <Text style={styles.label}>Page you are starting on</Text>
        <TextInput
          style={styles.input}
          value={startPage}
          onChangeText={setStartPage}
          keyboardType="number-pad"
          placeholder="e.g., 120"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.hint}>
          {fitness.currentPage > 0
            ? `Your last logged position was page ${fitness.currentPage}.`
            : 'Optional - with a start and end page the session counts toward pace and trophies.'}
        </Text>

        <Pressable
          style={[styles.primaryButton, !canStart && styles.disabled]}
          onPress={() => void start()}
          disabled={!canStart}
          accessibilityRole="button"
          accessibilityLabel="Turn the glass"
        >
          <Ionicons name="hourglass-outline" size={20} color={colors.onAccent} />
          <Text style={styles.primaryButtonText}>
            {canStart ? `Turn the glass · ${plannedMinutes} min` : 'Turn the glass'}
          </Text>
        </Pressable>
        <View style={styles.infoBox}>
          <Ionicons name="hourglass-outline" size={18} color={colors.accent} />
          <Text style={styles.infoText}>
            The screen stays on the glass until the sand runs out. One exit button, no feed.
          </Text>
        </View>
      </ScrollView>
    </KeyboardPane>
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

function parseOptionalPage(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
}

function parseCustomMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  if (parsed < CUSTOM_MIN_MINUTES || parsed > CUSTOM_MAX_MINUTES) {
    return null;
  }
  return parsed;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatMinutes(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pickerContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pickerTitle: {
    fontFamily: fonts.serif,
    fontSize: 25,
    lineHeight: 32,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
    ...cardShadow,
  },
  wrapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  },
  link: {
    fontFamily: fonts.sansMedium,
    color: colors.accent,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  heading: {
    fontFamily: fonts.serif,
    fontSize: 25,
    lineHeight: 32,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  headingNote: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
  },
  label: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  hint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  infoText: {
    flex: 1,
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  warning: {
    fontFamily: fonts.sans,
    color: colors.danger,
    fontSize: 13,
  },
  input: {
    fontFamily: fonts.sans,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.field,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: sizes.button,
    fontSize: 16,
    lineHeight: 22,
  },
  noteInput: {
    minHeight: 104,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexGrow: 1,
    flexBasis: '22%',
    minHeight: sizes.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radii.button,
    paddingHorizontal: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    color: colors.text,
    fontSize: 14,
  },
  chipTextActive: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.button,
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    ...buttonShadow,
  },
  primaryButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.button,
    minHeight: sizes.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.accent,
    fontSize: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rowButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
  },
  focus: {
    flex: 1,
    backgroundColor: colors.walnut,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  focusBook: {
    fontFamily: fonts.serif,
    color: colors.onWalnut,
    fontSize: 25,
    lineHeight: 32,
    textAlign: 'center',
  },
  focusHint: {
    fontFamily: fonts.serif,
    color: colors.onWalnutMuted,
    fontSize: 16,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  focusGlass: {
    flex: 1,
    justifyContent: 'center',
  },
  focusTime: {
    fontFamily: fonts.serif,
    color: colors.onWalnut,
    fontSize: 64,
    lineHeight: 72,
    fontVariant: ['tabular-nums'],
  },
  focusPlanned: {
    fontFamily: fonts.sans,
    color: colors.onWalnutMuted,
    fontSize: 13,
    marginBottom: spacing.lg,
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderColor: colors.walnutBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  leaveText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onWalnutMuted,
    fontSize: 14,
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
  },
  statLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  celebration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderColor: gold.base,
    backgroundColor: colors.riseSoft,
  },
  promptCard: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  celebrationText: {
    flex: 1,
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
});
