import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as CoverImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  addCharacter,
  deleteCharacter,
  listCharacters,
  parseCharacterDescription,
  updateCharacter,
  type Character,
  type CharacterDetails,
} from '@/domains/characters/service';
import {
  formatBoundaryPosition,
  getCurrentPosition,
  splitEntryText,
} from '@/domains/entries/display';
import { getLatestProgressBoundary, type ProgressType } from '@/domains/entries/progress';
import { groupEntriesByDay } from '@/domains/entries/timeline';
import {
  addEntry,
  deleteEntry,
  listEntries,
  updateEntry,
  type Entry,
} from '@/domains/entries/service';
import {
  deleteBookImage,
  listBookImages,
  updateBookImageCaption,
  uploadBookImage,
  type BookImage,
} from '@/domains/library/images';
import { getBook, setBookFinished } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { cleanupTranscript } from '@/domains/voice/cleanup';
import { useDictation } from '@/domains/voice/useDictation';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { formatRelativeTime } from '@/lib/relativeTime';
import { cardShadow, colors, fonts, gold } from '@/lib/theme';

// Capture composer states: closed (bar only), opened for typing, or opened
// with dictation auto-started (J6: voice as prominent as typing).
type ComposerMode = 'write' | 'speak' | null;

// The entries list renders day headings between cards (Day One-style
// timeline): a flattened FlatList keeps scroll behavior simple.
type EntryListItem =
  | { kind: 'heading'; key: string; heading: string }
  | { kind: 'entry'; entry: Entry };

// Matches the PWA rule: only flag "(edited)" when updated_at trails created_at
// by more than a second.
function formatRecordTimestamp(record: { created_at: string | null; updated_at: string | null }) {
  if (!record.created_at) {
    return 'No date';
  }
  const created = new Date(record.created_at);
  if (Number.isNaN(created.getTime())) {
    return 'Invalid date';
  }
  const label = created.toLocaleString();
  if (!record.updated_at) {
    return label;
  }
  const updatedMs = new Date(record.updated_at).getTime();
  const edited = Number.isFinite(updatedMs) && updatedMs - created.getTime() > 1000;
  return edited ? `${label} (edited)` : label;
}

function confirmDestructive(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function BookScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const [tab, setTab] = useState<'entries' | 'characters' | 'photos'>('entries');
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [characterMode, setCharacterMode] = useState<ComposerMode>(null);
  const addPhotosRef = useRef<(() => void) | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Return-to-book journey signal (Stage 3 entry gate); ids only, no content.
  useEffect(() => {
    if (validId) {
      trackAnalyticsEvent('book_opened', {}, bookId);
    }
  }, [validId, bookId]);

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
    enabled: validId,
  });
  const charactersQuery = useQuery({
    queryKey: queryKeys.characters(bookId),
    queryFn: () => listCharacters(bookId),
    enabled: validId,
  });
  // Shares the entries cache key with the entries tab; powers the glanceable
  // position line in the header (J5).
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
    enabled: validId,
  });

  // Finishing a book is the roadmap's primary outcome - celebrate it, and
  // let an accidental tap be undone without ceremony.
  const finishMutation = useMutation({
    mutationFn: (finished: boolean) => setBookFinished(bookId, finished),
    onSuccess: (updated, finished) => {
      queryClient.setQueryData(queryKeys.book(bookId), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.books });
      if (finished) {
        showToast('🎉 Book finished! It now shines in gold on your shelf.');
      }
    },
  });

  if (!validId) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>This book link is not valid.</Text>
      </View>
    );
  }

  const book = bookQuery.data;
  const metaParts = [
    book?.publisher ? String(book.publisher) : null,
    book?.publication_year ? String(book.publication_year) : null,
    book?.total_pages ? `${book.total_pages} pages` : null,
  ].filter(Boolean);

  const headerEntries = entriesQuery.data ?? [];
  const currentPosition = getCurrentPosition(headerEntries);
  const lastEntryRelative = formatRelativeTime(headerEntries[0]?.created_at);

  const openComposer = (mode: Exclude<ComposerMode, null>) => {
    setTab('entries');
    setComposerMode(mode);
  };
  // The bar hides while the active tab's composer is open; on Photos it
  // stays (the picker is a modal, not an inline form).
  const captureBarVisible =
    tab === 'photos'
      ? true
      : tab === 'entries'
        ? composerMode === null
        : characterMode === null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        {/* Edit lives in the nav bar (platform convention); the status
            control below follows Goodreads/StoryGraph/Bookly: one prominent
            reading-status button right under the title block. */}
        <Stack.Screen
          options={{
            title: book?.name ?? 'Book',
            headerRight: () => (
              <Link
                href={{ pathname: '/edit-book', params: { id: String(bookId) } }}
                asChild
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit book details"
                  hitSlop={10}
                >
                  <Text style={styles.headerEditText}>Edit</Text>
                </Pressable>
              </Link>
            ),
          }}
        />

        <View style={styles.headerRow}>
          {book?.cover_url ? (
            <CoverImage
              source={{ uri: book.cover_url }}
              style={styles.headerCover}
              contentFit="cover"
              accessibilityLabel={`Cover of ${book.name}`}
            />
          ) : null}
          <View style={styles.headerInfo}>
            {book?.author ? <Text style={styles.author}>by {book.author}</Text> : null}
            {metaParts.length ? <Text style={styles.meta}>{metaParts.join(' · ')}</Text> : null}

            {currentPosition ? (
              <View style={styles.positionRow}>
                <View style={styles.positionChip}>
                  <Text style={styles.positionChipText}>
                    {formatBoundaryPosition(currentPosition)}
                  </Text>
                </View>
                {lastEntryRelative ? (
                  <Text style={styles.positionMeta}>last entry {lastEntryRelative}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.detailsRow}>
          {book ? (
            book.finished_at ? (
              <Pressable
                style={[styles.finishButton, styles.finishButtonDone]}
                onPress={() => finishMutation.mutate(false)}
                disabled={finishMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Finished. Tap to mark as still reading"
              >
                <Ionicons name="trophy" size={14} color="#fffdf6" />
                <Text style={styles.finishTextDone}>
                  Finished {new Date(book.finished_at).toLocaleDateString()} · undo
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.finishButton}
                onPress={() => finishMutation.mutate(true)}
                disabled={finishMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Mark this book as finished"
              >
                <Ionicons name="flag" size={14} color={gold.deep} />
                <Text style={styles.finishText}>Mark as finished</Text>
              </Pressable>
            )
          ) : null}
        </View>
        {finishMutation.isError ? (
          <Text style={styles.error}>
            {finishMutation.error instanceof Error
              ? finishMutation.error.message
              : 'Could not update the book.'}
          </Text>
        ) : null}

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabButton, tab === 'entries' && styles.tabButtonActive]}
            onPress={() => setTab('entries')}
          >
            <Text style={[styles.tabText, tab === 'entries' && styles.tabTextActive]}>
              Entries{entriesQuery.data ? ` (${entriesQuery.data.length})` : ''}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, tab === 'characters' && styles.tabButtonActive]}
            onPress={() => setTab('characters')}
          >
            <Text style={[styles.tabText, tab === 'characters' && styles.tabTextActive]}>
              Characters ({charactersQuery.data?.length ?? 0})
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, tab === 'photos' && styles.tabButtonActive]}
            onPress={() => setTab('photos')}
          >
            <Text style={[styles.tabText, tab === 'photos' && styles.tabTextActive]}>
              Photos
            </Text>
          </Pressable>
        </View>

        {/* All panes stay mounted so drafts and searches survive tab peeks
            (capture-without-friction: leaving must never cost the reader). */}
        <View style={[styles.tabPane, tab !== 'entries' && styles.tabPaneHidden]}>
          <EntriesTab
            bookId={bookId}
            composerMode={composerMode}
            onComposerModeChange={setComposerMode}
          />
        </View>
        <View style={[styles.tabPane, tab !== 'characters' && styles.tabPaneHidden]}>
          <CharactersTab
            bookId={bookId}
            composerMode={characterMode}
            onComposerModeChange={setCharacterMode}
          />
        </View>
        <View style={[styles.tabPane, tab !== 'photos' && styles.tabPaneHidden]}>
          <PhotosTab bookId={bookId} addPhotosRef={addPhotosRef} />
        </View>

        {/* One-tap capture from anywhere in the book; voice and typing carry
            equal weight (J6). The actions follow the active tab (Material
            FAB-per-context): Entries saves an entry, Characters adds a
            character, Photos opens the picker. */}
        {captureBarVisible ? (
          <View style={styles.captureBar}>
            {tab === 'photos' ? (
              <Pressable
                style={styles.captureAction}
                onPress={() => addPhotosRef.current?.()}
                accessibilityRole="button"
                accessibilityLabel="Add photos"
              >
                <Ionicons name="images-outline" size={16} color={colors.accent} />
                <Text style={styles.captureActionText}>Add photos</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={styles.captureAction}
                  onPress={() =>
                    tab === 'characters' ? setCharacterMode('write') : openComposer('write')
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    tab === 'characters' ? 'Add a character' : 'Write an entry'
                  }
                >
                  <Ionicons name="create-outline" size={16} color={colors.accent} />
                  <Text style={styles.captureActionText}>
                    {tab === 'characters' ? 'Add character' : 'Write'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.captureAction}
                  onPress={() =>
                    tab === 'characters' ? setCharacterMode('speak') : openComposer('speak')
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    tab === 'characters' ? 'Speak a character' : 'Speak an entry'
                  }
                >
                  <Ionicons name="mic-outline" size={16} color={colors.accent} />
                  <Text style={styles.captureActionText}>
                    {tab === 'characters' ? 'Speak character' : 'Speak'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function EntriesTab({
  bookId,
  composerMode,
  onComposerModeChange,
}: {
  bookId: number;
  composerMode: ComposerMode;
  onComposerModeChange: (mode: ComposerMode) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [progressType, setProgressType] = useState<ProgressType>('page');
  const [progressValue, setProgressValue] = useState('');
  const [text, setText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [rawTranscripts, setRawTranscripts] = useState<string[]>([]);
  const dictation = useDictation();

  // "Speak" opens the composer with dictation already running - one tap from
  // thought to capture. The ref stops re-triggering as status changes.
  const speakStartedRef = useRef(false);
  useEffect(() => {
    if (composerMode === 'speak' && dictation.status === 'idle' && !speakStartedRef.current) {
      speakStartedRef.current = true;
      void dictation.start();
    }
    if (composerMode !== 'speak') {
      speakStartedRef.current = false;
    }
  }, [composerMode, dictation.status, dictation]);

  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
  });

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const latestBoundary = useMemo(
    () => getLatestProgressBoundary(entries, progressType),
    [entries, progressType],
  );

  // Search plus day-grouped timeline keep a long journal scannable
  // (Day One / Journey / Apple Journal pattern).
  const [entrySearch, setEntrySearch] = useState('');
  const visibleEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();
    if (!query) {
      return entries;
    }
    return entries.filter((entry) => {
      const parts = splitEntryText(entry.text);
      return `${parts.boundaryLabel ?? ''} ${parts.body}`.toLowerCase().includes(query);
    });
  }, [entries, entrySearch]);
  const listItems = useMemo(() => {
    const items: EntryListItem[] = [];
    for (const group of groupEntriesByDay(visibleEntries)) {
      items.push({ kind: 'heading', key: group.key, heading: group.heading });
      for (const entry of group.entries) {
        items.push({ kind: 'entry', entry });
      }
    }
    return items;
  }, [visibleEntries]);

  const addEntryMutation = useMutation({
    mutationFn: () =>
      addEntry(bookId, {
        text,
        progressType,
        progressValue,
        rawTranscript: rawTranscripts.length > 0 ? rawTranscripts.join('\n') : null,
      }),
    onSuccess: () => {
      setText('');
      setRawTranscripts([]);
      setFormError(null);
      onComposerModeChange(null);
      showToast('Entry saved.', 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not save the entry.');
    },
  });

  // "Where you left off" (working name, D-022): a paid Companion feature -
  // an AI-written recap of the reader's entries up to their latest one,
  // story or bullets at a reader-chosen level of detail. Until the
  // Companion ships, this is a locked teaser; taps are counted as a
  // buying-interest signal (ids and counts only, never content).
  const [teaserOpen, setTeaserOpen] = useState(false);
  const latestEntry = entries[0] ?? null;
  const latestRelative = latestEntry ? formatRelativeTime(latestEntry.created_at) : null;

  const toggleTeaser = () => {
    const opening = !teaserOpen;
    setTeaserOpen(opening);
    if (opening) {
      trackAnalyticsEvent('recap_teaser_tapped', { entryCount: entries.length }, bookId);
    }
  };

  const recapTeaser = latestEntry ? (
    <View>
      <Pressable
        style={styles.teaserRow}
        onPress={toggleTeaser}
        accessibilityRole="button"
        accessibilityLabel="Where you left off, coming with the Companion"
      >
        <View style={styles.teaserTitleRow}>
          <Ionicons name="lock-closed" size={13} color={gold.deep} />
          <Text style={styles.teaserTitle}>Where you left off</Text>
        </View>
        <View style={styles.teaserPill}>
          <Text style={styles.teaserPillText}>{teaserOpen ? '✕' : 'Companion'}</Text>
        </View>
      </Pressable>
      {teaserOpen ? (
        <View style={styles.teaserCard}>
          <Text style={styles.teaserBody}>
            A Companion feature in the works: it will retell the story so far from your own
            entries — a short story or quick bullets, your choice — and it never reads past
            your latest entry{latestRelative ? ` (${latestRelative})` : ''}.
          </Text>
        </View>
      ) : null}
    </View>
  ) : null;

  const composer =
    composerMode !== null ? (
      <View style={styles.captureCard}>
        <View style={styles.composerHeader}>
          <Text style={styles.captureTitle}>Save an entry</Text>
          <Pressable
            style={styles.composerClose}
            onPress={() => onComposerModeChange(null)}
            accessibilityRole="button"
            accessibilityLabel="Close the entry composer"
          >
            <Text style={styles.composerCloseText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.segmentRow}>
          {(['page', 'chapter'] as const).map((type) => (
            <Pressable
              key={type}
              style={[styles.segment, progressType === type && styles.segmentActive]}
              onPress={() => setProgressType(type)}
            >
              <Text
                style={[styles.segmentText, progressType === type && styles.segmentTextActive]}
              >
                {type === 'page' ? 'Page' : 'Chapter'}
              </Text>
            </Pressable>
          ))}
          <TextInput
            style={[styles.input, styles.progressInput]}
            placeholder={progressType === 'page' ? 'e.g., 12' : 'e.g., 3'}
            placeholderTextColor={colors.muted}
            value={progressValue}
            onChangeText={setProgressValue}
            keyboardType="number-pad"
          />
        </View>

        <Text style={styles.boundaryHint}>
          {latestBoundary
            ? `Reading boundary: ${latestBoundary.progressType} ${latestBoundary.upper}. New entries start after it.`
            : `Set your current ${progressType} to track your reading boundary.`}
        </Text>

        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="One line is plenty - what just happened?"
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus={composerMode === 'write'}
        />

        {dictation.status === 'idle' ? (
          <Pressable style={styles.dictateButton} onPress={() => void dictation.start()}>
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
          <Pressable style={styles.stopButton} onPress={dictation.stop}>
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
            >
              <Text style={styles.smallButtonText}>Add to entry</Text>
            </Pressable>
            <Pressable style={styles.smallButtonGhost} onPress={dictation.discard}>
              <Text style={styles.smallButtonGhostText}>Discard</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {dictation.error ? <Text style={styles.error}>{dictation.error}</Text> : null}

      {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <Pressable
          style={styles.primaryButton}
          onPress={() => addEntryMutation.mutate()}
          disabled={addEntryMutation.isPending}
        >
          {addEntryMutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>Save entry</Text>
          )}
        </Pressable>
      </View>
    ) : null;

  return (
    <FlatList
      data={listItems}
      keyExtractor={(item) => (item.kind === 'heading' ? `day-${item.key}` : String(item.entry.id))}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {composer}
          {recapTeaser}
          {entries.length >= 6 ? (
            <TextInput
              style={[styles.input, styles.searchInput]}
              placeholder="Search your entries..."
              placeholderTextColor={colors.muted}
              value={entrySearch}
              onChangeText={setEntrySearch}
            />
          ) : null}
          {entriesQuery.isPending ? (
            <LoadingState label="Loading entries…" />
          ) : entriesQuery.isError ? (
            <ErrorState
              error={entriesQuery.error}
              fallback="Could not load entries."
              onRetry={() => void entriesQuery.refetch()}
            />
          ) : entries.length === 0 ? (
            <EmptyState message="No entries yet. One line about where you are is a perfect start." />
          ) : visibleEntries.length === 0 ? (
            <EmptyState message="No entries match your search." />
          ) : null}
        </View>
      }
      renderItem={({ item }) =>
        item.kind === 'heading' ? (
          <Text style={styles.dayHeading}>{item.heading}</Text>
        ) : (
          <EntryCard entry={item.entry} bookId={bookId} />
        )
      }
    />
  );
}

function EntryCard({ entry, bookId }: { entry: Entry; bookId: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const [error, setError] = useState<string | null>(null);
  const parts = splitEntryText(entry.text);

  const updateMutation = useMutation({
    mutationFn: () => updateEntry(entry.id, bookId, draft),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the entry.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntry(entry.id, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not delete the entry.');
    },
  });

  return (
    <View style={styles.card}>
      {editing ? (
        <>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.cardActions}>
            <Pressable
              style={styles.smallButton}
              onPress={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              <Text style={styles.smallButtonText}>
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.smallButtonGhost}
              onPress={() => {
                setEditing(false);
                setDraft(entry.text);
                setError(null);
              }}
            >
              <Text style={styles.smallButtonGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {parts.boundaryLabel ? (
            <View style={styles.entryChip}>
              <Text style={styles.entryChipText}>{parts.boundaryLabel}</Text>
            </View>
          ) : null}
          <Text style={styles.cardText}>{parts.body || entry.text}</Text>
          <Text style={styles.cardDate}>{formatRecordTimestamp(entry)}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.cardActions}>
            <Pressable style={styles.smallButtonGhost} onPress={() => setEditing(true)}>
              <Text style={styles.smallButtonGhostText}>Edit</Text>
            </Pressable>
            <Pressable
              style={styles.smallButtonDanger}
              onPress={() =>
                confirmDestructive('Delete entry', 'Delete this entry?', () =>
                  deleteMutation.mutate(),
                )
              }
              disabled={deleteMutation.isPending}
            >
              <Text style={styles.smallButtonDangerText}>
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function CharactersTab({
  bookId,
  composerMode,
  onComposerModeChange,
}: {
  bookId: number;
  composerMode: ComposerMode;
  onComposerModeChange: (mode: ComposerMode) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [relationships, setRelationships] = useState('');
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const dictation = useDictation();

  // "Speak character" opens the form with dictation already running -
  // the spoken notes land in the description field for review.
  const speakStartedRef = useRef(false);
  useEffect(() => {
    if (composerMode === 'speak' && dictation.status === 'idle' && !speakStartedRef.current) {
      speakStartedRef.current = true;
      void dictation.start();
    }
    if (composerMode !== 'speak') {
      speakStartedRef.current = false;
    }
  }, [composerMode, dictation.status, dictation]);

  const charactersQuery = useQuery({
    queryKey: queryKeys.characters(bookId),
    queryFn: () => listCharacters(bookId),
  });

  const characters = useMemo(() => charactersQuery.data ?? [], [charactersQuery.data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return characters;
    }
    return characters.filter((character) => {
      const details = parseCharacterDescription(character.description);
      const haystack =
        `${character.name} ${details.role} ${details.description} ${details.relationships}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [characters, search]);

  const addMutation = useMutation({
    mutationFn: () => addCharacter(bookId, name, { role, description, relationships }),
    onSuccess: () => {
      setName('');
      setRole('');
      setDescription('');
      setRelationships('');
      setFormError(null);
      onComposerModeChange(null);
      showToast('Character added.', 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.characters(bookId) });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not add the character.');
    },
  });

  // Progressive disclosure: the four-field form only appears when the
  // capture bar asks for it, so the tab stays a readable character list.
  const addForm =
    composerMode !== null ? (
      <View style={styles.captureCard}>
        <View style={styles.composerHeader}>
          <Text style={styles.captureTitle}>Add a character</Text>
          <Pressable
            style={styles.composerClose}
            onPress={() => onComposerModeChange(null)}
            accessibilityRole="button"
            accessibilityLabel="Close the character form"
          >
            <Text style={styles.composerCloseText}>✕</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Name, e.g., Frodo Baggins"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
          autoFocus={composerMode === 'write'}
        />
        <TextInput
          style={[styles.input, styles.stackedInput]}
          placeholder="Role, e.g., Main protagonist"
          placeholderTextColor={colors.muted}
          value={role}
          onChangeText={setRole}
        />
        <TextInput
          style={[styles.input, styles.stackedInput, styles.textAreaSmall]}
          placeholder="Traits and notes..."
          placeholderTextColor={colors.muted}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <TextInput
          style={[styles.input, styles.stackedInput, styles.textAreaSmall]}
          placeholder="Relationships, e.g., Sam (best friend)"
          placeholderTextColor={colors.muted}
          value={relationships}
          onChangeText={setRelationships}
          multiline
        />

        {dictation.status === 'idle' ? (
          <Pressable style={styles.dictateButton} onPress={() => void dictation.start()}>
            <Ionicons name="mic" size={15} color={colors.text} />
            <Text style={styles.dictateButtonText}>Describe by voice</Text>
          </Pressable>
        ) : null}

        {dictation.status === 'recording' ? (
          <View style={styles.dictationCard}>
            <Text style={styles.dictationLabel}>Listening… describe the character.</Text>
            {dictation.partial ? (
              <Text style={styles.dictationPartial}>{dictation.partial}</Text>
            ) : null}
            <Pressable style={styles.stopButton} onPress={dictation.stop}>
              <Ionicons name="stop" size={14} color={colors.danger} />
              <Text style={styles.stopButtonText}>Stop dictation</Text>
            </Pressable>
          </View>
        ) : null}

        {dictation.status === 'review' ? (
          <View style={styles.dictationCard}>
            <Text style={styles.dictationLabel}>Review your dictation</Text>
            <Text style={styles.dictationPreview}>{cleanupTranscript(dictation.raw)}</Text>
            <Text style={styles.dictationHint}>
              Only punctuation and capitalization were adjusted — your words are untouched.
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
                  setDescription((prev) =>
                    prev.trim() ? `${prev.trimEnd()} ${cleaned}` : cleaned,
                  );
                }}
              >
                <Text style={styles.smallButtonText}>Add to notes</Text>
              </Pressable>
              <Pressable style={styles.smallButtonGhost} onPress={dictation.discard}>
                <Text style={styles.smallButtonGhostText}>Discard</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {dictation.error ? <Text style={styles.error}>{dictation.error}</Text> : null}
        {formError ? <Text style={styles.error}>{formError}</Text> : null}
        <Pressable
          style={styles.primaryButton}
          onPress={() => addMutation.mutate()}
          disabled={addMutation.isPending}
        >
          {addMutation.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>Add character</Text>
          )}
        </Pressable>
      </View>
    ) : null;

  return (
    <FlatList
      data={filtered}
      keyExtractor={(character) => String(character.id)}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {addForm}
          {characters.length > 0 ? (
            <TextInput
              style={[styles.input, styles.searchInput]}
              placeholder="Search by name, role, or relationship..."
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
            />
          ) : null}
          {charactersQuery.isPending ? (
            <LoadingState label="Loading characters…" />
          ) : charactersQuery.isError ? (
            <ErrorState
              error={charactersQuery.error}
              fallback="Could not load characters."
              onRetry={() => void charactersQuery.refetch()}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              message={
                characters.length === 0
                  ? 'No characters mapped yet. Tap "Add character" below to start your map.'
                  : 'No characters match your search.'
              }
            />
          ) : null}
        </View>
      }
      renderItem={({ item }) => <CharacterCard character={item} bookId={bookId} />}
    />
  );
}

function CharacterCard({ character, bookId }: { character: Character; bookId: number }) {
  const queryClient = useQueryClient();
  const details = parseCharacterDescription(character.description);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CharacterDetails & { name: string }>({
    name: character.name,
    ...details,
  });
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateCharacter(character.id, bookId, draft.name, {
        role: draft.role,
        description: draft.description,
        relationships: draft.relationships,
      }),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.characters(bookId) });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the character.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCharacter(character.id, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.characters(bookId) });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not delete the character.');
    },
  });

  return (
    <View style={styles.card}>
      {editing ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Name"
            placeholderTextColor={colors.muted}
            value={draft.name}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
            autoFocus
          />
          <TextInput
            style={[styles.input, styles.stackedInput]}
            placeholder="Role"
            placeholderTextColor={colors.muted}
            value={draft.role}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, role: value }))}
          />
          <TextInput
            style={[styles.input, styles.stackedInput, styles.textAreaSmall]}
            placeholder="Traits and notes..."
            placeholderTextColor={colors.muted}
            value={draft.description}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, description: value }))}
            multiline
          />
          <TextInput
            style={[styles.input, styles.stackedInput, styles.textAreaSmall]}
            placeholder="Relationships"
            placeholderTextColor={colors.muted}
            value={draft.relationships}
            onChangeText={(value) => setDraft((prev) => ({ ...prev, relationships: value }))}
            multiline
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.cardActions}>
            <Pressable
              style={styles.smallButton}
              onPress={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              <Text style={styles.smallButtonText}>
                {updateMutation.isPending ? 'Saving...' : 'Save'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.smallButtonGhost}
              onPress={() => {
                setEditing(false);
                setDraft({
                  name: character.name,
                  ...parseCharacterDescription(character.description),
                });
                setError(null);
              }}
            >
              <Text style={styles.smallButtonGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.characterName}>{character.name}</Text>
          {details.role ? (
            <View style={styles.characterSection}>
              <Text style={styles.characterLabel}>Role</Text>
              <Text style={styles.cardText}>{details.role}</Text>
            </View>
          ) : null}
          {details.description ? (
            <View style={styles.characterSection}>
              <Text style={styles.characterLabel}>Description</Text>
              <Text style={styles.cardText}>{details.description}</Text>
            </View>
          ) : null}
          {details.relationships ? (
            <View style={styles.characterSection}>
              <Text style={styles.characterLabel}>Relationships</Text>
              <Text style={styles.cardText}>{details.relationships}</Text>
            </View>
          ) : null}
          <Text style={styles.cardDate}>{formatRecordTimestamp(character)}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.cardActions}>
            <Pressable
              style={styles.smallButtonGhost}
              onPress={() => {
                setDraft({
                  name: character.name,
                  ...parseCharacterDescription(character.description),
                });
                setEditing(true);
              }}
            >
              <Text style={styles.smallButtonGhostText}>Edit</Text>
            </Pressable>
            <Pressable
              style={styles.smallButtonDanger}
              onPress={() =>
                confirmDestructive('Delete character', 'Delete this character map entry?', () =>
                  deleteMutation.mutate(),
                )
              }
              disabled={deleteMutation.isPending}
            >
              <Text style={styles.smallButtonDangerText}>
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function PhotosTab({
  bookId,
  addPhotosRef,
}: {
  bookId: number;
  addPhotosRef: MutableRefObject<(() => void) | null>;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [caption, setCaption] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const imagesQuery = useQuery({
    queryKey: queryKeys.bookImages(bookId),
    queryFn: () => listBookImages(bookId),
  });

  const pickAndUpload = async () => {
    if (uploading) {
      return;
    }
    setStatus(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (picked.canceled || !picked.assets.length) {
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < picked.assets.length; i += 1) {
        setStatus(`Uploading image ${i + 1} of ${picked.assets.length}...`);
        await uploadBookImage(bookId, picked.assets[i], caption);
      }
      setCaption('');
      setStatus(null);
      showToast(
        picked.assets.length === 1 ? 'Photo uploaded.' : 'Photos uploaded.',
        'success',
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookImages(bookId) });
    } catch (err) {
      setStatus(err instanceof Error ? `Upload error: ${err.message}` : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const images = imagesQuery.data ?? [];

  // The capture bar's "Add photos" triggers the same picker as this tab's
  // own button (one action, two thumb-reachable entry points).
  useEffect(() => {
    addPhotosRef.current = () => void pickAndUpload();
    return () => {
      addPhotosRef.current = null;
    };
  });

  return (
    <FlatList
      data={images}
      keyExtractor={(image) => String(image.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.captureCard}>
          <Text style={styles.captureTitle}>Add photos</Text>
          <Text style={styles.captureHint}>
            Keep covers, favorite passages, or margin notes with this book. Photos stay private
            to your account.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Optional caption for the next upload"
            placeholderTextColor={colors.muted}
            value={caption}
            onChangeText={setCaption}
          />
          {status ? <Text style={styles.photoStatus}>{status}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={pickAndUpload} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.primaryButtonText}>Choose photos</Text>
            )}
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        imagesQuery.isPending ? (
          <LoadingState label="Loading photos…" />
        ) : imagesQuery.isError ? (
          <ErrorState
            error={imagesQuery.error}
            fallback="Could not load photos."
            onRetry={() => void imagesQuery.refetch()}
          />
        ) : (
          <EmptyState message="No photos yet for this book." />
        )
      }
      renderItem={({ item }) => <PhotoCard image={item} bookId={bookId} />}
    />
  );
}

function PhotoCard({ image, bookId }: { image: BookImage; bookId: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(image.caption ?? '');
  const [cardError, setCardError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookImages(bookId) });
  };

  const captionMutation = useMutation({
    mutationFn: () => updateBookImageCaption(image.id, bookId, caption),
    onSuccess: () => {
      setEditing(false);
      setCardError(null);
      invalidate();
    },
    onError: (err) => {
      setCardError(err instanceof Error ? err.message : 'Could not save the caption.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBookImage(image),
    onSuccess: invalidate,
    onError: (err) => {
      setCardError(err instanceof Error ? err.message : 'Could not delete the photo.');
    },
  });

  return (
    <View style={styles.photoCard}>
      {image.signed_url ? (
        <Image source={{ uri: image.signed_url }} style={styles.photoImage} resizeMode="cover" />
      ) : (
        <View style={[styles.photoImage, styles.photoMissing]}>
          <Text style={styles.empty}>Image unavailable</Text>
        </View>
      )}
      {editing ? (
        <View style={styles.photoBody}>
          <TextInput
            style={styles.input}
            placeholder="Caption"
            placeholderTextColor={colors.muted}
            value={caption}
            onChangeText={setCaption}
          />
          <View style={styles.cardActions}>
            <Pressable
              style={styles.smallButton}
              onPress={() => captionMutation.mutate()}
              disabled={captionMutation.isPending}
            >
              <Text style={styles.smallButtonText}>
                {captionMutation.isPending ? 'Saving...' : 'Save caption'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.smallButtonGhost}
              onPress={() => {
                setEditing(false);
                setCaption(image.caption ?? '');
              }}
            >
              <Text style={styles.smallButtonGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.photoBody}>
          {image.caption ? <Text style={styles.photoCaption}>{image.caption}</Text> : null}
          <Text style={styles.cardDate}>{formatRecordTimestamp(image)}</Text>
          <View style={styles.cardActions}>
            <Pressable style={styles.smallButtonGhost} onPress={() => setEditing(true)}>
              <Text style={styles.smallButtonGhostText}>
                {image.caption ? 'Edit caption' : 'Add caption'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.smallButtonDanger}
              onPress={() =>
                confirmDestructive('Delete photo', 'Delete this image?', () =>
                  deleteMutation.mutate(),
                )
              }
              disabled={deleteMutation.isPending}
            >
              <Text style={styles.smallButtonDangerText}>
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      {cardError ? <Text style={styles.error}>{cardError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerCover: {
    width: 56,
    height: 84,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  headerInfo: {
    flex: 1,
  },
  author: {
    color: colors.muted,
    fontSize: 16,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  headerEditText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 15,
  },
  // Status pill styled like Bookly's bold finish control: soft gold fill
  // with a firm gold border so it reads as a milestone, not body text.
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: gold.glowSoft,
    borderColor: gold.base,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  finishButtonDone: {
    backgroundColor: gold.base,
    borderColor: gold.base,
  },
  finishText: {
    color: gold.deep,
    fontWeight: '700',
    fontSize: 14,
  },
  finishTextDone: {
    color: '#fffdf6',
    fontWeight: '700',
    fontSize: 14,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 14,
    marginBottom: 12,
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.card,
    ...cardShadow,
  },
  tabText: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  tabPane: {
    flex: 1,
  },
  tabPaneHidden: {
    display: 'none',
  },
  dayHeading: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  positionChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  positionChipText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 12,
  },
  positionMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  captureBar: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
  },
  captureAction: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  captureActionText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 15,
  },
  composerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  composerClose: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  composerCloseText: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 13,
  },
  // The paid recap teaser dresses differently from entry cards on purpose:
  // warm gold tint, accent frame, serif title - a Companion-branded surface.
  teaserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    ...cardShadow,
  },
  teaserTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teaserTitle: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontWeight: '700',
    fontSize: 15,
  },
  teaserPill: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  teaserPillText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  teaserCard: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginTop: -8,
    marginBottom: 14,
  },
  teaserBody: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  entryChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  entryChipText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 11,
  },
  captureCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    ...cardShadow,
  },
  captureTitle: {
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.serif,
    fontWeight: '700',
    marginBottom: 6,
  },
  captureHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  segment: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  segmentActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  segmentText: {
    color: colors.muted,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.background,
  },
  progressInput: {
    flex: 1,
  },
  boundaryHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
  },
  dictateButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  dictateButtonText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
  },
  dictationCard: {
    backgroundColor: colors.background,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  dictationLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 6,
  },
  dictationPartial: {
    color: colors.muted,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  dictationPreview: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
  dictationRawNote: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  dictationHint: {
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
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stopButtonText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  stackedInput: {
    marginTop: 8,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
    marginTop: 10,
  },
  textAreaSmall: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  searchInput: {
    marginTop: 14,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 15,
  },
  loader: {
    marginVertical: 16,
  },
  error: {
    color: colors.danger,
    marginTop: 8,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  list: {
    gap: 10,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    ...cardShadow,
  },
  cardText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  cardDate: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  smallButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 13,
  },
  smallButtonGhost: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonGhostText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  smallButtonDanger: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonDangerText: {
    color: colors.danger,
    fontWeight: '600',
    fontSize: 13,
  },
  characterName: {
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.serif,
    fontWeight: '700',
  },
  characterSection: {
    marginTop: 8,
  },
  characterLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  photoStatus: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 8,
  },
  photoCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    ...cardShadow,
  },
  photoImage: {
    width: '100%',
    height: 220,
    backgroundColor: colors.border,
  },
  photoMissing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBody: {
    padding: 12,
  },
  photoCaption: {
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.serif,
    lineHeight: 21,
  },
});
