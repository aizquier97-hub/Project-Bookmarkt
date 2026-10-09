import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { KeyboardPane } from '@/components/KeyboardPane';
import { Button, SegmentedControl, StickyFooter } from '@/components/ui';
import { useToast } from '@/components/toast';
import { listCharacters } from '@/domains/characters/service';
import { formatFirstNoted } from '@/domains/characters/capture';
import { CompanionRequestError, requestStructureAid } from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { getCurrentPosition } from '@/domains/entries/display';
import { rememberLastSavedNote } from '@/domains/entries/lastSaved';
import type { EntryKind } from '@/domains/entries/markers';
import {
  applyMentionToText,
  filterNamesForMention,
  findActiveMentionQuery,
} from '@/domains/entries/mentions';
import { getLatestProgressBoundary, type ProgressType } from '@/domains/entries/progress';
import { addEntry, listEntries } from '@/domains/entries/service';
import { furthestPage } from '@/domains/fitness/model';
import {
  computeTrophyProgress,
  newlyUnlockedSegments,
  trophyUnlockMessage,
} from '@/domains/fitness/trophies';
import { READING_MODEL_KEYS } from '@/domains/fitness/useReadingModel';
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { cleanupTranscript } from '@/domains/voice/cleanup';
import { useDictation } from '@/domains/voice/useDictation';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, radii, spacing } from '@/lib/theme';

type ComposeMode = 'write' | 'speak';
type ComposeSource = 'capture_bar' | 'timer_handoff' | 'quotes_shelf';

const PROGRESS_OPTIONS = [
  { value: 'page', label: 'Page' },
  { value: 'chapter', label: 'Chapter' },
] as const;

/**
 * The entry composer on its own screen (D-092). Inline at the head of the
 * journal it fought the hero, the tab row and the keyboard for a few hundred
 * points; here the whole page is the page the reader is writing on: the
 * Page / Chapter selector, the boundary hint, a text area that grows with
 * the note, @mention chips, dictation, the companion's structuring aid, and
 * a Save action that stays above the keyboard.
 *
 * Reached from the book's capture bar (/compose-entry?id=&mode=write|speak),
 * the Sandglass hand-off (…&page=<n>, D-064) and the Quotes shelf's "+"
 * (…&kind=quote, D-089). Saving returns to wherever the reader came from.
 */
export default function ComposeEntryScreen() {
  const params = useLocalSearchParams<{
    id: string;
    mode?: string;
    kind?: string;
    page?: string;
    source?: string;
  }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const mode: ComposeMode = params.mode === 'speak' ? 'speak' : 'write';
  const entryKind: EntryKind = params.kind === 'quote' ? 'quote' : 'note';
  const source: ComposeSource =
    params.source === 'timer_handoff' || params.source === 'quotes_shelf'
      ? params.source
      : 'capture_bar';

  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [progressType, setProgressType] = useState<ProgressType>('page');
  const [progressValue, setProgressValue] = useState(() => {
    const parsed = Number(params.page);
    return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : '';
  });
  const [text, setText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [rawTranscripts, setRawTranscripts] = useState<string[]>([]);
  const dictation = useDictation();

  // Entry points compared against one another (D-087): the bar, the
  // Sandglass hand-off, the Quotes shelf.
  useEffect(() => {
    if (validId) {
      trackAnalyticsEvent('composer_opened', { target: 'entry', mode, source }, bookId);
    }
    // Mount-only: the params describe how this screen was entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validId, bookId]);

  // "Speak" arrives with dictation already running - one tap from thought to
  // capture. The ref stops re-triggering as status changes.
  const speakStartedRef = useRef(false);
  useEffect(() => {
    if (mode === 'speak' && dictation.status === 'idle' && !speakStartedRef.current) {
      speakStartedRef.current = true;
      void dictation.start();
    }
  }, [mode, dictation.status, dictation]);

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
    enabled: validId,
    staleTime: 5 * 60 * 1000,
  });
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
    enabled: validId,
  });
  const charactersQuery = useQuery({
    queryKey: queryKeys.characters(bookId),
    queryFn: () => listCharacters(bookId),
    enabled: validId,
  });
  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });
  const companionEntitled = entitlementQuery.data?.entitled === true;

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const latestBoundary = useMemo(
    () => getLatestProgressBoundary(entries, progressType),
    [entries, progressType],
  );
  const mentionNames = useMemo(
    () => (charactersQuery.data ?? []).map((c) => c.name),
    [charactersQuery.data],
  );
  // An "@..." being typed at the end surfaces matching character names as
  // one-tap chips (D-045).
  const mentionQuery = findActiveMentionQuery(text);
  const mentionMatches =
    mentionQuery !== null ? filterNamesForMention(mentionNames, mentionQuery) : [];

  // Abandonment signal (D-086): how much was typed, never what. Fires on the
  // header's back arrow and the system back alike; a save clears the draft
  // first so it never counts.
  const draftRef = useRef({ text: '', transcripts: 0 });
  draftRef.current = { text, transcripts: rawTranscripts.length };
  useEffect(() => {
    return navigation.addListener('beforeRemove', () => {
      const draft = draftRef.current;
      if (draft.text.trim() && validId) {
        trackAnalyticsEvent(
          'entry_draft_discarded',
          {
            chars: draft.text.trim().length,
            hadTranscript: draft.transcripts > 0,
            composerMode: mode,
            kind: entryKind,
          },
          bookId,
        );
      }
    });
  }, [navigation, validId, bookId, mode, entryKind]);

  const addEntryMutation = useMutation({
    mutationFn: () =>
      addEntry(bookId, {
        text,
        progressType,
        progressValue,
        rawTranscript: rawTranscripts.length > 0 ? rawTranscripts.join('\n') : null,
        kind: entryKind,
      }),
    onSuccess: (created) => {
      draftRef.current = { text: '', transcripts: 0 };
      setFormError(null);
      // Book Club readers get the companion's pass over the fresh note for
      // people to add to the map (D-077); the journal shows it on return.
      rememberLastSavedNote(
        queryClient,
        bookId,
        created.text.trim().length > 0
          ? {
              id: created.id,
              text: created.text,
              firstNoted: formatFirstNoted(getCurrentPosition([created, ...entries])),
            }
          : null,
      );
      // Segment trophies (D-062): compare the furthest page before and after
      // this entry; a crossed quarter earns a piece and a moment of praise.
      const book = bookQuery.data;
      const unlocked = book
        ? newlyUnlockedSegments(
            computeTrophyProgress({
              totalPages: book.total_pages,
              currentPage: furthestPage(entries, []),
              finished: Boolean(book.finished_at),
            }),
            computeTrophyProgress({
              totalPages: book.total_pages,
              currentPage: furthestPage([created, ...entries], []),
              finished: Boolean(book.finished_at),
            }),
          )
        : [];
      if (book && unlocked.length > 0) {
        for (const piece of unlocked) {
          trackAnalyticsEvent('trophy_piece_unlocked', { piece: piece.index, source: 'entry' }, bookId);
        }
        showToast(trophyUnlockMessage(book.name, unlocked), 'success');
      } else {
        showToast(entryKind === 'quote' ? 'Quote saved.' : 'Entry saved.', 'success');
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes });
      for (const key of READING_MODEL_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      // Home is the journal: from the bar it sits one screen below; after a
      // Sandglass hand-off it may not be on the stack at all, so dismissTo
      // pops back to it when it is there and stands it up when it is not.
      if (source === 'timer_handoff') {
        router.dismissTo({ pathname: '/book/[id]', params: { id: String(bookId) } });
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({ pathname: '/book/[id]', params: { id: String(bookId) } });
      }
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not save the entry.');
    },
  });

  // Capture structuring aid (D-039, premium): transient - the reader authors
  // and confirms every saved word (D-012).
  const [structureSuggestion, setStructureSuggestion] = useState<string | null>(null);
  const [structureError, setStructureError] = useState<string | null>(null);
  const structureMutation = useMutation({
    mutationFn: () => requestStructureAid(bookId, text),
    onMutate: () => {
      setStructureError(null);
      setStructureSuggestion(null);
    },
    onSuccess: (result) => {
      setStructureSuggestion(result.reply.content || null);
      trackAnalyticsEvent('companion_tool_used', { tool: 'structure_aid', status: 'succeeded' }, bookId);
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'structure_aid', status }, bookId);
      setStructureError(
        err instanceof CompanionRequestError
          ? err.message
          : 'The companion could not help just now.',
      );
    },
  });

  const screenTitle = (
    <Stack.Screen options={{ title: entryKind === 'quote' ? 'Save a quote' : 'Save an entry' }} />
  );

  if (!validId) {
    return (
      <View style={styles.container}>
        {screenTitle}
        <Text style={styles.error}>This book link is not valid.</Text>
      </View>
    );
  }

  const saveDisabled = addEntryMutation.isPending || text.trim().length === 0;

  return (
    <KeyboardPane style={styles.flex}>
      {screenTitle}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={styles.eyebrow}>
          {[bookQuery.data?.name, 'Your journal'].filter(Boolean).join(' · ')}
        </Text>

        {/* Note / Quote / Important chips were removed by design (D-089):
            quotes arrive from the Quotes shelf's "+" with kind=quote, and
            important moments come from the companion's suggestions. */}
        <View style={styles.segmentRow}>
          <SegmentedControl
            options={PROGRESS_OPTIONS}
            value={progressType}
            onChange={setProgressType}
            style={styles.segmentTrack}
          />
          <TextInput
            style={[styles.input, styles.progressInput]}
            placeholder={progressType === 'page' ? 'e.g., 12' : 'e.g., 3'}
            placeholderTextColor={colors.muted}
            value={progressValue}
            onChangeText={setProgressValue}
            keyboardType="number-pad"
            accessibilityLabel={progressType === 'page' ? 'Page number' : 'Chapter number'}
          />
        </View>
        <Text style={styles.boundaryHint}>
          {latestBoundary
            ? `Reading boundary: ${latestBoundary.progressType} ${latestBoundary.upper}. New entries start after it.`
            : `Set your current ${progressType} to track your reading boundary.`}
        </Text>

        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={
            entryKind === 'quote'
              ? "Copy the line just as it's written - your quote log keeps it."
              : mentionNames.length > 0
                ? 'One line is plenty - type @ to mention a character.'
                : 'One line is plenty - what just happened?'
          }
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          scrollEnabled={false}
          autoFocus={mode === 'write'}
          accessibilityLabel={entryKind === 'quote' ? 'Quote text' : 'Entry text'}
        />

        {mentionMatches.length > 0 ? (
          <View style={styles.mentionRow}>
            {mentionMatches.map((mentionName) => (
              <Pressable
                key={mentionName}
                style={styles.suggestionChip}
                onPress={() => setText((prev) => applyMentionToText(prev, mentionName))}
                accessibilityRole="button"
                accessibilityLabel={`Mention ${mentionName}`}
              >
                <Text style={styles.suggestionChipText}>@{mentionName}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {dictation.status === 'idle' ? (
          <Pressable
            style={styles.dictateButton}
            onPress={() => void dictation.start()}
            accessibilityRole="button"
            accessibilityLabel="Add to the entry by voice"
          >
            <Ionicons name="mic" size={15} color={colors.text} />
            <Text style={styles.dictateButtonText}>Add by voice</Text>
          </Pressable>
        ) : null}

        {dictation.status === 'recording' ? (
          <View style={styles.dictationCard}>
            <Text style={styles.dictationLabel}>Listening… speak your entry.</Text>
            {dictation.partial ? (
              <Text style={styles.dictationPartial}>{dictation.partial}</Text>
            ) : null}
            <Pressable
              style={styles.stopButton}
              onPress={dictation.stop}
              accessibilityRole="button"
              accessibilityLabel="Stop dictation"
            >
              <Ionicons name="stop" size={14} color={colors.danger} />
              <Text style={styles.stopButtonText}>Stop dictation</Text>
            </Pressable>
          </View>
        ) : null}

        {dictation.status === 'review' ? (
          <View style={styles.dictationCard}>
            <Text style={styles.dictationLabel}>Review your dictation</Text>
            <Text style={styles.dictationPreview}>{cleanupTranscript(dictation.raw)}</Text>
            <Text style={styles.dictationRawNote}>Raw transcript: “{dictation.raw}”</Text>
            <Text style={styles.dictationHint}>
              Only punctuation and capitalization were adjusted — your words are untouched. The
              raw transcript is kept with your entry.
            </Text>
            <View style={styles.cardActions}>
              <Pressable
                style={styles.smallButton}
                onPress={() => {
                  const raw = dictation.confirm();
                  if (!raw) {
                    return;
                  }
                  const cleaned = cleanupTranscript(raw);
                  setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${cleaned}` : cleaned));
                  setRawTranscripts((prev) => [...prev, raw]);
                }}
                accessibilityRole="button"
                accessibilityLabel="Add the dictation to the entry"
              >
                <Text style={styles.smallButtonText}>Add to entry</Text>
              </Pressable>
              <Pressable
                style={styles.smallButtonGhost}
                onPress={dictation.discard}
                accessibilityRole="button"
                accessibilityLabel="Discard the dictation"
              >
                <Text style={styles.smallButtonGhostText}>Discard</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {dictation.error ? <Text style={styles.error}>{dictation.error}</Text> : null}

        {companionEntitled && text.trim().length >= 20 ? (
          <View>
            {structureMutation.isPending ? (
              <View style={styles.aidPendingRow}>
                <ActivityIndicator size="small" color={colors.muted} />
                <Text style={styles.aidPendingText}>Arranging your words…</Text>
              </View>
            ) : structureSuggestion === null ? (
              <Pressable
                style={styles.dictateButton}
                onPress={() => structureMutation.mutate()}
                accessibilityRole="button"
                accessibilityLabel="Ask the companion to suggest a structure for this note"
              >
                <Ionicons name="color-wand-outline" size={15} color={colors.text} />
                <Text style={styles.dictateButtonText}>Suggest a structure</Text>
              </Pressable>
            ) : (
              <View style={styles.aidCard}>
                <Text style={styles.aidLabel}>A suggested arrangement — yours to edit</Text>
                <Text style={styles.aidSuggestion}>{structureSuggestion}</Text>
                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.smallButton}
                    onPress={() => {
                      setText(structureSuggestion);
                      setStructureSuggestion(null);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Use the suggested arrangement"
                  >
                    <Text style={styles.smallButtonText}>Use it</Text>
                  </Pressable>
                  <Pressable
                    style={styles.smallButtonGhost}
                    onPress={() => setStructureSuggestion(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Keep my own wording"
                  >
                    <Text style={styles.smallButtonGhostText}>Keep mine</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {structureError ? <Text style={styles.error}>{structureError}</Text> : null}
          </View>
        ) : null}

        {formError ? <Text style={styles.error}>{formError}</Text> : null}
      </ScrollView>

      <StickyFooter>
        <Button
          label={entryKind === 'quote' ? 'Save quote' : 'Save entry'}
          onPress={() => addEntryMutation.mutate()}
          loading={addEntryMutation.isPending}
          disabled={saveDisabled}
        />
      </StickyFooter>
    </KeyboardPane>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  segmentTrack: {
    flex: 2,
  },
  input: {
    fontFamily: fonts.sans,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.field,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
  },
  progressInput: {
    flex: 1,
    minHeight: 42,
  },
  boundaryHint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  textArea: {
    fontFamily: fonts.serif,
    fontSize: 18,
    lineHeight: 28,
    minHeight: 200,
    paddingVertical: 14,
    textAlignVertical: 'top',
    marginTop: spacing.sm,
  },
  mentionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  suggestionChip: {
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...buttonShadow,
  },
  suggestionChipText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.accent,
    fontSize: 13,
  },
  dictateButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radii.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: spacing.xs,
    ...buttonShadow,
  },
  dictateButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.accent,
    fontSize: 13,
  },
  dictationCard: {
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.xs,
    ...cardShadow,
  },
  dictationLabel: {
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
    fontSize: 13,
    marginBottom: 6,
  },
  dictationPartial: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 14,
    marginBottom: 8,
  },
  dictationPreview: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  dictationRawNote: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  dictationHint: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  stopButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: radii.button,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...buttonShadow,
  },
  stopButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.danger,
    fontSize: 13,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 10,
  },
  smallButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...buttonShadow,
  },
  smallButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 13,
  },
  smallButtonGhost: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...buttonShadow,
  },
  smallButtonGhostText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
    fontSize: 13,
  },
  aidPendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  aidPendingText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13 },
  aidCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.sm,
    ...cardShadow,
  },
  aidLabel: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  aidSuggestion: { fontFamily: fonts.sans, color: colors.text, fontSize: 14, lineHeight: 21 },
  error: {
    fontFamily: fonts.sans,
    color: colors.danger,
    fontSize: 13,
  },
});
