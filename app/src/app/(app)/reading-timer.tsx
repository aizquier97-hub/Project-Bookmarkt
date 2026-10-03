import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addEntry } from '@/domains/entries/service';
import { computeComprehensionFactor, computeEffort } from '@/domains/fitness/activity';
import { countWords } from '@/domains/fitness/difficulty';
import { sessionPacePagesPerMinute } from '@/domains/fitness/fitness';
import type { BookFitness } from '@/domains/fitness/model';
import { createReadingSession } from '@/domains/fitness/service';
import {
  computeTrophyProgress,
  newlyUnlockedSegments,
  trophyUnlockMessage,
  type TrophySegment,
} from '@/domains/fitness/trophies';
import { READING_MODEL_KEYS, useReadingModel } from '@/domains/fitness/useReadingModel';
import type { Book } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { BookPickerRow } from '@/components/BookPickerRow';
import { KeyboardPane } from '@/components/KeyboardPane';
import { Sandglass } from '@/components/Sandglass';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { TrophyStrip } from '@/components/TrophyStrip';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

const DURATION_CHOICES_MIN = [10, 15, 20, 25, 30, 45, 60] as const;
/** Sessions shorter than this are discarded rather than logged. */
const MIN_SESSION_SECONDS = 60;

type Phase = 'setup' | 'running' | 'wrapup' | 'saved';

interface SavedSummary {
  minutes: number;
  pages: number | null;
  effort: number | null;
  pacePagesPerMinute: number | null;
  unlocked: TrophySegment[];
  noteSaved: boolean;
  noteError: string | null;
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
  const [plannedMinutes, setPlannedMinutes] = useState<number>(20);
  const [startPage, setStartPage] = useState(fitness.currentPage > 0 ? String(fitness.currentPage) : '');
  const [endPage, setEndPage] = useState('');
  const [note, setNote] = useState('');
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [endedAt, setEndedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const finishedRef = useRef(false);

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
      Vibration.vibrate([0, 350, 150, 350]);
      setEndedAt(new Date());
      setPhase('wrapup');
    }
  }, [phase, remainingSeconds]);

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

  const start = () => {
    finishedRef.current = false;
    const begun = new Date();
    setStartedAt(begun);
    setEndedAt(null);
    setNow(begun.getTime());
    setPhase('running');
  };

  const endEarly = () => {
    if (elapsedSeconds < MIN_SESSION_SECONDS) {
      trackAnalyticsEvent('reading_session_abandoned', { elapsedSeconds, plannedSeconds }, book.id);
      showToast('Session discarded - it was under a minute.', 'info');
      setPhase('setup');
      setStartedAt(null);
      return;
    }
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

          <Text style={styles.label}>One line about where you are (optional)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="A thought, a question, where the story left you…"
            placeholderTextColor={colors.muted}
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
              <ActivityIndicator color={gold.onFill} />
            ) : (
              <Text style={styles.primaryButtonText}>Save session</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardPane>
    );
  }

  if (phase === 'saved' && saved) {
    const openBook = () =>
      router.replace({ pathname: '/book/[id]', params: { id: String(book.id) } });
    // The sitting is logged; the next step is the entry (D-064). A sitting
    // without a note hands off straight into the book's composer with the
    // stopping page already filled in, before the thought fades.
    const writeEntry = () =>
      router.replace({
        pathname: '/book/[id]',
        params: {
          id: String(book.id),
          compose: 'write',
          ...(saved.endPage !== null ? { page: String(saved.endPage) } : {}),
        },
      });
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
          onPress={() => router.replace('/')}
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

        <Text style={styles.label}>How long is this sitting?</Text>
        <View style={styles.chipRow}>
          {DURATION_CHOICES_MIN.map((minutes) => {
            const active = plannedMinutes === minutes;
            return (
              <Pressable
                key={minutes}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setPlannedMinutes(minutes)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${minutes} minutes`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{minutes} min</Text>
              </Pressable>
            );
          })}
        </View>

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
          style={styles.primaryButton}
          onPress={start}
          accessibilityRole="button"
          accessibilityLabel="Turn the glass"
        >
          <Ionicons name="hourglass-outline" size={20} color={gold.onFill} />
          <Text style={styles.primaryButtonText}>Turn the glass</Text>
        </Pressable>
        <Text style={styles.footnote}>
          The screen stays on the glass until the sand runs out. One exit button, no feed.
        </Text>
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
    padding: 16,
  },
  pickerContent: {
    padding: 16,
    gap: 10,
  },
  pickerTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 10,
    ...cardShadow,
  },
  wrapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  cardBody: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  link: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  label: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  hint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  footnote: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    textAlign: 'center',
  },
  warning: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 13,
  },
  input: {
    fontFamily: fonts.serif,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  noteInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  chipText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextActive: {
    color: gold.onFill,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 22,
    ...buttonShadow,
  },
  primaryButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryButtonText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '600',
    fontSize: 15,
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
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  focusHint: {
    fontFamily: fonts.serif,
    color: colors.onWalnutMuted,
    fontSize: 14,
    marginTop: 6,
  },
  focusGlass: {
    flex: 1,
    justifyContent: 'center',
  },
  focusTime: {
    fontFamily: fonts.serif,
    color: colors.onWalnut,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 2,
  },
  focusPlanned: {
    fontFamily: fonts.serif,
    color: colors.onWalnutMuted,
    fontSize: 14,
    marginBottom: 24,
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
    fontFamily: fonts.serif,
    color: colors.onWalnutMuted,
    fontSize: 14,
    fontWeight: '600',
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
    fontFamily: fonts.serif,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    fontWeight: '600',
  },
});
