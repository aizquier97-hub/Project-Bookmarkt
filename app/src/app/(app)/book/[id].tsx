import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as CoverImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { KeyboardPane } from '@/components/KeyboardPane';
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
  formatFirstNoted,
  formatFirstNotedLabel,
  sortCharactersByAppearance,
  suggestCharacterNames,
} from '@/domains/characters/capture';
import {
  applyMentionToText,
  filterNamesForMention,
  findActiveMentionQuery,
} from '@/domains/entries/mentions';
import {
  buildBookmarkLabel,
  entrySummaryIsStale,
  formatBookmarkCaption,
  formatBoundaryPosition,
  getCurrentPosition,
  splitEntryText,
} from '@/domains/entries/display';
import {
  CompanionRequestError,
  refreshEntrySummaries,
  requestFlagSuggestions,
  requestStructureAid,
  searchEntriesByMeaning,
  type CompanionFlagSuggestion,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { getLatestProgressBoundary, type ProgressType } from '@/domains/entries/progress';
import {
  flagEntryTextImportant,
  parseEntryKind,
  type EntryKind,
} from '@/domains/entries/markers';
import {
  addEntry,
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
import { EntryBookmark } from '@/components/EntryBookmark';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { formatRelativeTime } from '@/lib/relativeTime';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

// Capture composer states: closed (bar only), opened for typing, or opened
// with dictation auto-started (J6: voice as prominent as typing).
type ComposerMode = 'write' | 'speak' | null;

// One-time "search by meaning" explainer flag (D-052).
const MEANING_INTRO_KEY = 'semantic_search_intro_seen';

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
  const params = useLocalSearchParams<{ id: string; tab?: string; character?: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  // Deep-link groundwork (D-045): /book/[id]?tab=characters&character=<id>
  // opens the Characters tab focused on that card.
  const [tab, setTab] = useState<'entries' | 'characters' | 'photos'>(
    params.tab === 'characters' || params.tab === 'photos' ? params.tab : 'entries',
  );
  const [focusCharacterId, setFocusCharacterId] = useState<number | null>(() => {
    const parsed = Number(params.character);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [characterMode, setCharacterMode] = useState<ComposerMode>(null);
  const addPhotosRef = useRef<(() => void) | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // Android is edge-to-edge (SDK 54): without this, the capture bar and
  // composer buttons render under the system navigation buttons.
  const insets = useSafeAreaInsets();

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
  // Publisher/year retired from display (D-032): pages is the one metadata
  // detail a reader actually uses here.
  const metaParts = [book?.total_pages ? `${book.total_pages} pages` : null].filter(Boolean);

  const headerEntries = entriesQuery.data ?? [];
  const currentPosition = getCurrentPosition(headerEntries);
  const lastEntryRelative = formatRelativeTime(headerEntries[0]?.created_at);

  const openComposer = (mode: Exclude<ComposerMode, null>) => {
    setTab('entries');
    setComposerMode(mode);
  };
  // A tapped @mention anywhere in the book jumps to that character's card.
  const openCharacter = (characterId: number) => {
    setFocusCharacterId(characterId);
    setTab('characters');
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
    <KeyboardPane style={styles.flex}>
      <View style={[styles.container, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
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
            onOpenCharacter={openCharacter}
          />
        </View>
        <View style={[styles.tabPane, tab !== 'characters' && styles.tabPaneHidden]}>
          <CharactersTab
            bookId={bookId}
            composerMode={characterMode}
            onComposerModeChange={setCharacterMode}
            focusCharacterId={tab === 'characters' ? focusCharacterId : null}
            onFocusHandled={() => setFocusCharacterId(null)}
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
          <View
            style={[
              styles.captureBar,
              // Cancel the container's safe-area padding so the bar anchors
              // to the true screen edge, then re-pad inside it.
              {
                marginBottom: -Math.max(16, insets.bottom + 8),
                paddingBottom: Math.max(14, insets.bottom + 10),
              },
            ]}
          >
            {tab === 'photos' ? (
              <Pressable
                style={styles.captureAction}
                onPress={() => addPhotosRef.current?.()}
                accessibilityRole="button"
                accessibilityLabel="Add photos"
              >
                <Ionicons name="images-outline" size={16} color={gold.onFill} />
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
                  <Ionicons name="create-outline" size={16} color={gold.onFill} />
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
                  <Ionicons name="mic-outline" size={16} color={gold.onFill} />
                  <Text style={styles.captureActionText}>
                    {tab === 'characters' ? 'Speak character' : 'Speak'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </View>
    </KeyboardPane>
  );
}

function EntriesTab({
  bookId,
  composerMode,
  onComposerModeChange,
  onOpenCharacter,
}: {
  bookId: number;
  composerMode: ComposerMode;
  onComposerModeChange: (mode: ComposerMode) => void;
  onOpenCharacter: (characterId: number) => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const [progressType, setProgressType] = useState<ProgressType>('page');
  const [progressValue, setProgressValue] = useState('');
  const [text, setText] = useState('');
  const [entryKind, setEntryKind] = useState<EntryKind>('note');
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
  // Shares the characters cache key with the Characters tab; powers inline
  // @mention suggestions and tappable mentions in entry cards (D-045).
  const charactersQuery = useQuery({
    queryKey: queryKeys.characters(bookId),
    queryFn: () => listCharacters(bookId),
  });
  const mentionTargets = useMemo(
    () => (charactersQuery.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    [charactersQuery.data],
  );

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const latestBoundary = useMemo(
    () => getLatestProgressBoundary(entries, progressType),
    [entries, progressType],
  );

  // Search plus day-grouped timeline keep a long journal scannable
  // (Day One / Journey / Apple Journal pattern). Quote Logs and important
  // events (D-039) add a kind filter once any marked entries exist.
  const [entrySearch, setEntrySearch] = useState('');
  const [entryFilter, setEntryFilter] = useState<'all' | 'quote' | 'important'>('all');
  // Search by meaning (D-052): premium semantic search over the reader's own
  // notes. Matches replace the substring filter until cleared or retyped.
  const [meaningMatches, setMeaningMatches] = useState<{ query: string; ids: number[] } | null>(
    null,
  );
  const hasMarkedEntries = useMemo(
    () => entries.some((entry) => parseEntryKind(splitEntryText(entry.text).body).kind !== 'note'),
    [entries],
  );
  const visibleEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();
    const filter = hasMarkedEntries ? entryFilter : 'all';
    const meaningIds = meaningMatches ? new Set(meaningMatches.ids) : null;
    return entries.filter((entry) => {
      const parts = splitEntryText(entry.text);
      const marked = parseEntryKind(parts.body);
      if (filter !== 'all' && marked.kind !== filter) {
        return false;
      }
      if (meaningIds) {
        return meaningIds.has(entry.id);
      }
      if (!query) {
        return true;
      }
      return `${parts.boundaryLabel ?? ''} ${marked.body}`.toLowerCase().includes(query);
    });
  }, [entries, entrySearch, entryFilter, hasMarkedEntries, meaningMatches]);

  const addEntryMutation = useMutation({    mutationFn: () =>
      addEntry(bookId, {
        text,
        progressType,
        progressValue,
        rawTranscript: rawTranscripts.length > 0 ? rawTranscripts.join('\n') : null,
        kind: entryKind,
      }),
    onSuccess: () => {
      setText('');
      setRawTranscripts([]);
      setEntryKind('note');
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

  // Companion aids on this tab (D-039, premium): the capture structuring aid
  // in the composer and AI-suggested important flags over the timeline. Both
  // are transient - the reader authors and confirms every saved word (D-012).
  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });
  const companionEntitled = entitlementQuery.data?.entitled === true;

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

  const [flagSuggestions, setFlagSuggestions] = useState<CompanionFlagSuggestion[] | null>(null);
  const [flagsIntro, setFlagsIntro] = useState<string | null>(null);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const flagsMutation = useMutation({
    mutationFn: () => requestFlagSuggestions(bookId),
    onMutate: () => {
      setFlagsError(null);
      setFlagSuggestions(null);
      setFlagsIntro(null);
    },
    onSuccess: (result) => {
      setFlagSuggestions(result.suggestions);
      setFlagsIntro(result.reply.content || null);
      trackAnalyticsEvent('companion_tool_used', { tool: 'suggest_flags', status: 'succeeded' }, bookId);
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'suggest_flags', status }, bookId);
      setFlagsError(
        err instanceof CompanionRequestError
          ? err.message
          : 'The companion could not help just now.',
      );
    },
  });
  const applyFlagMutation = useMutation({
    mutationFn: (entry: Entry) => updateEntry(entry.id, bookId, flagEntryTextImportant(entry.text)),
    onSuccess: (_data, entry) => {
      setFlagSuggestions((prev) => (prev ?? []).filter((s) => s.entryId !== entry.id));
      trackAnalyticsEvent('entry_flag_applied', { source: 'suggestion' }, bookId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
    },
    onError: () => {
      setFlagsError('The flag could not be saved. Please try again.');
    },
  });

  // Search by meaning (D-052). First use shows a one-time explainer so the
  // reader knows what the companion does with the query (nothing is kept).
  const [showMeaningIntro, setShowMeaningIntro] = useState(false);
  const [meaningError, setMeaningError] = useState<string | null>(null);
  const meaningMutation = useMutation({
    mutationFn: (query: string) => searchEntriesByMeaning(bookId, query),
    onMutate: () => {
      setMeaningError(null);
      setMeaningMatches(null);
    },
    onSuccess: (result, query) => {
      setMeaningMatches({ query, ids: result.results.map((r) => r.entryId) });
      trackAnalyticsEvent(
        'semantic_search_used',
        { status: 'succeeded', matches: result.results.length },
        bookId,
      );
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('semantic_search_used', { status }, bookId);
      setMeaningError(
        err instanceof CompanionRequestError
          ? err.message
          : 'The search could not run just now. Please try again.',
      );
    },
  });
  const startMeaningSearch = async () => {
    const query = entrySearch.trim();
    if (query.length < 3 || meaningMutation.isPending) {
      return;
    }
    const seen = await AsyncStorage.getItem(MEANING_INTRO_KEY).catch(() => null);
    if (!seen) {
      setShowMeaningIntro(true);
      return;
    }
    meaningMutation.mutate(query);
  };
  const confirmMeaningIntro = () => {
    setShowMeaningIntro(false);
    void AsyncStorage.setItem(MEANING_INTRO_KEY, 'seen').catch(() => undefined);
    meaningMutation.mutate(entrySearch.trim());
  };

  // Bookmark-ribbon summaries (Interface v2.0): when entitled and any ribbon
  // label is missing or stale, one batched companion call refreshes them.
  // Fire-and-forget - ribbons fall back to the reader's own first words.
  const summariesRequestedRef = useRef(false);
  useEffect(() => {
    if (!companionEntitled || summariesRequestedRef.current || entries.length === 0) {
      return;
    }
    if (!entries.some((entry) => entrySummaryIsStale(entry))) {
      return;
    }
    summariesRequestedRef.current = true;
    refreshEntrySummaries(bookId)
      .then((result) => {
        if (result.summaries.length > 0) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
        }
      })
      .catch(() => undefined);
  }, [companionEntitled, entries, bookId, queryClient]);

  // An "@..." being typed at the end of the composer surfaces matching
  // character names as one-tap chips (D-045).
  const mentionQuery = findActiveMentionQuery(text);
  const mentionMatches =
    mentionQuery !== null
      ? filterNamesForMention(
          mentionTargets.map((target) => target.name),
          mentionQuery,
        )
      : [];

  // The gold bookmark (Interface v2.0): the premium ribbon pinned above the
  // reader's own bookmarks. It opens the story-so-far screen, where any
  // stretch of bookmarks becomes a story at the chosen level of detail.
  const goldBookmark =
    entries.length > 0 ? (
      <Pressable
        style={({ pressed }) => [styles.goldBookmark, pressed && styles.goldBookmarkPressed]}
        onPress={() => router.push({ pathname: '/book-summary', params: { id: String(bookId) } })}
        accessibilityRole="button"
        accessibilityLabel="The story so far - have any stretch of your bookmarks retold"
      >
        <Ionicons name="bookmark" size={18} color={gold.onFill} />
        <View style={styles.goldBookmarkBody}>
          <Text style={styles.goldBookmarkTitle}>The story so far</Text>
          <Text style={styles.goldBookmarkSub} numberOfLines={1}>
            Any stretch of your bookmarks, retold your way
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={gold.onFill} />
        <View style={styles.goldBookmarkNotch} pointerEvents="none" />
      </Pressable>
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

        {/* One choice per entry: plain note, quote log, or important moment
            (D-039 free feeders — never paywalled per D-012). */}
        <View style={styles.kindRow}>
          {(
            [
              ['note', 'Note'],
              ['quote', 'Quote'],
              ['important', 'Important'],
            ] as const
          ).map(([kind, label]) => (
            <Pressable
              key={kind}
              style={[styles.kindChip, entryKind === kind && styles.kindChipActive]}
              onPress={() => setEntryKind(kind)}
              accessibilityRole="button"
              accessibilityState={{ selected: entryKind === kind }}
              accessibilityLabel={`Save this entry as a ${label.toLowerCase()}`}
            >
              <Text style={[styles.kindChipText, entryKind === kind && styles.kindChipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
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
          placeholder={
            entryKind === 'quote'
              ? "Copy the line just as it's written - your quote log keeps it."
              : entryKind === 'important'
                ? 'What happened that matters? One line is plenty.'
                : mentionTargets.length > 0
                  ? 'One line is plenty - type @ to mention a character.'
                  : 'One line is plenty - what just happened?'
          }
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
          autoFocus={composerMode === 'write'}
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
                >
                  <Text style={styles.smallButtonText}>Use it</Text>
                </Pressable>
                <Pressable
                  style={styles.smallButtonGhost}
                  onPress={() => setStructureSuggestion(null)}
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
      data={visibleEntries}
      keyExtractor={(entry) => String(entry.id)}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {composer}
          {goldBookmark}
          {entries.length >= 6 ? (
            <TextInput
              style={[styles.input, styles.searchInput]}
              placeholder="Search your entries..."
              placeholderTextColor={colors.muted}
              value={entrySearch}
              onChangeText={(value) => {
                setEntrySearch(value);
                setMeaningMatches(null);
                setShowMeaningIntro(false);
              }}
            />
          ) : null}
          {companionEntitled && entries.length >= 6 && entrySearch.trim().length >= 3 ? (
            <View style={styles.meaningBlock}>
              {showMeaningIntro ? (
                <View style={styles.aidCard}>
                  <Text style={styles.aidLabel}>Search by meaning</Text>
                  <Text style={styles.aidSuggestion}>
                    The companion compares what your notes mean, not just the words they use —
                    “betrayal” can find the note where you wrote “he sold them out.” It only reads
                    the notes you already saved, and nothing about the search is kept.
                  </Text>
                  <View style={styles.cardActions}>
                    <Pressable
                      style={styles.smallButton}
                      onPress={confirmMeaningIntro}
                      accessibilityRole="button"
                      accessibilityLabel="Run the search by meaning"
                    >
                      <Text style={styles.smallButtonText}>Got it — search</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallButtonGhost}
                      onPress={() => setShowMeaningIntro(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss the explainer"
                    >
                      <Text style={styles.smallButtonGhostText}>Not now</Text>
                    </Pressable>
                  </View>
                </View>
              ) : meaningMutation.isPending ? (
                <View style={styles.aidPendingRow}>
                  <ActivityIndicator size="small" color={colors.muted} />
                  <Text style={styles.aidPendingText}>Reading your notes…</Text>
                </View>
              ) : meaningMatches ? (
                <View style={styles.meaningResultRow}>
                  <Text style={styles.meaningResultText}>
                    {meaningMatches.ids.length === 0
                      ? 'Nothing in your notes reads close to that.'
                      : `${meaningMatches.ids.length} ${
                          meaningMatches.ids.length === 1 ? 'note reads' : 'notes read'
                        } close to “${meaningMatches.query}”`}
                  </Text>
                  <Pressable
                    onPress={() => setMeaningMatches(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Clear the meaning search"
                  >
                    <Text style={styles.meaningClearText}>Clear</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.flagsRow}
                  onPress={() => void startMeaningSearch()}
                  accessibilityRole="button"
                  accessibilityLabel="Search your notes by meaning"
                >
                  <Ionicons name="sparkles-outline" size={14} color={colors.accent} />
                  <Text style={styles.flagsRowText}>Search by meaning</Text>
                </Pressable>
              )}
              {meaningError ? <Text style={styles.error}>{meaningError}</Text> : null}
            </View>
          ) : null}
          {hasMarkedEntries ? (
            <View style={styles.filterRow}>
              {(
                [
                  ['all', 'All'],
                  ['quote', 'Quotes'],
                  ['important', 'Important'],
                ] as const
              ).map(([filter, label]) => (
                <Pressable
                  key={filter}
                  style={[styles.filterChip, entryFilter === filter && styles.filterChipActive]}
                  onPress={() => setEntryFilter(filter)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: entryFilter === filter }}
                  accessibilityLabel={`Show ${label.toLowerCase()} entries`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      entryFilter === filter && styles.filterChipTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {companionEntitled && entries.length >= 3 ? (
            <View>
              {flagsMutation.isPending ? (
                <View style={styles.aidPendingRow}>
                  <ActivityIndicator size="small" color={colors.muted} />
                  <Text style={styles.aidPendingText}>Reading your notes…</Text>
                </View>
              ) : flagSuggestions === null ? (
                <Pressable
                  style={styles.flagsRow}
                  onPress={() => flagsMutation.mutate()}
                  accessibilityRole="button"
                  accessibilityLabel="Ask the companion which moments look important"
                >
                  <Ionicons name="flag-outline" size={14} color={colors.accent} />
                  <Text style={styles.flagsRowText}>Which moments look important?</Text>
                </Pressable>
              ) : (
                <View style={styles.aidCard}>
                  <View style={styles.flagsHeader}>
                    <Text style={styles.aidLabel}>
                      {flagsIntro ?? 'Moments that read like turning points'}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setFlagSuggestions(null);
                        setFlagsIntro(null);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Close the suggestions"
                      style={styles.composerClose}
                    >
                      <Text style={styles.composerCloseText}>✕</Text>
                    </Pressable>
                  </View>
                  {flagSuggestions.length === 0 ? (
                    <Text style={styles.aidSuggestion}>
                      Nothing stands out as a turning point yet. You decide, of course.
                    </Text>
                  ) : (
                    flagSuggestions.map((suggestion) => {
                      const entry = entries.find((e) => e.id === suggestion.entryId);
                      if (!entry) {
                        return null;
                      }
                      const preview = parseEntryKind(splitEntryText(entry.text).body).body;
                      return (
                        <View key={suggestion.entryId} style={styles.flagSuggestion}>
                          <Text style={styles.flagPreview} numberOfLines={2}>
                            “{preview}”
                          </Text>
                          <Text style={styles.flagReason}>{suggestion.reason}</Text>
                          <View style={styles.cardActions}>
                            <Pressable
                              style={styles.smallButton}
                              onPress={() => applyFlagMutation.mutate(entry)}
                              disabled={applyFlagMutation.isPending}
                            >
                              <Text style={styles.smallButtonText}>Flag as important</Text>
                            </Pressable>
                            <Pressable
                              style={styles.smallButtonGhost}
                              onPress={() =>
                                setFlagSuggestions(
                                  (prev) =>
                                    (prev ?? []).filter((s) => s.entryId !== suggestion.entryId),
                                )
                              }
                            >
                              <Text style={styles.smallButtonGhostText}>Skip</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              )}
              {flagsError ? <Text style={styles.error}>{flagsError}</Text> : null}
            </View>
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
            <EmptyState
              message={
                entrySearch.trim()
                  ? 'No entries match your search.'
                  : entryFilter === 'quote'
                    ? 'No quotes logged yet.'
                    : 'No important moments flagged yet.'
              }
            />
          ) : null}
        </View>
      }
      renderItem={({ item: entry }) => {
        const kind = parseEntryKind(splitEntryText(entry.text).body).kind;
        return (
          <EntryBookmark
            label={buildBookmarkLabel(entry).text}
            caption={formatBookmarkCaption(entry)}
            kind={kind}
            important={kind === 'important'}
            onPress={() =>
              router.push({
                pathname: '/entry/[entryId]',
                params: { entryId: String(entry.id), book: String(bookId) },
              })
            }
          />
        );
      }}
    />
  );
}


function CharactersTab({
  bookId,
  composerMode,
  onComposerModeChange,
  focusCharacterId,
  onFocusHandled,
}: {
  bookId: number;
  composerMode: ComposerMode;
  onComposerModeChange: (mode: ComposerMode) => void;
  focusCharacterId: number | null;
  onFocusHandled: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [relationships, setRelationships] = useState('');
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // Name-first quick add (D-045): details fields hide behind a toggle so a
  // name alone is a complete, zero-friction capture.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dictation = useDictation();

  // "Speak character" opens the form with dictation already running -
  // the spoken notes land in the description field for review.
  const speakStartedRef = useRef(false);
  useEffect(() => {
    if (composerMode === 'speak' && dictation.status === 'idle' && !speakStartedRef.current) {
      speakStartedRef.current = true;
      setDetailsOpen(true);
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
  // Shared entries cache: powers the reading-position stamp and the
  // name-suggestion chips (D-045).
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
  });
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const currentPosition = useMemo(() => getCurrentPosition(entries), [entries]);
  const stampLabel = currentPosition ? formatBoundaryPosition(currentPosition) : null;

  const characters = useMemo(() => charactersQuery.data ?? [], [charactersQuery.data]);
  const suggestions = useMemo(
    () =>
      suggestCharacterNames(
        entries.map((entry) => parseEntryKind(splitEntryText(entry.text).body).body || entry.text),
        characters.map((character) => character.name),
      ),
    [entries, characters],
  );
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
  // Order of appearance: stamped characters sort by first-noted position.
  const sorted = useMemo(() => sortCharactersByAppearance(filtered), [filtered]);

  const addMutation = useMutation({
    mutationFn: (input: {
      name: string;
      details: CharacterDetails;
      via: 'form' | 'quick' | 'suggestion';
    }) => addCharacter(bookId, input.name, input.details, input.via),
    onSuccess: (_created, input) => {
      setFormError(null);
      showToast(
        input.via === 'suggestion' ? `${input.name} added to your map.` : 'Character added.',
        'success',
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.characters(bookId) });
      if (input.via !== 'suggestion') {
        setName('');
        setRole('');
        setDescription('');
        setRelationships('');
        setDetailsOpen(false);
        onComposerModeChange(null);
      }
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not add the character.');
    },
  });

  // Every add carries the reader's current position so the map can later be
  // sorted (and spoiler-guarded) by when each character appeared.
  const submitForm = () => {
    addMutation.mutate({
      name,
      details: {
        role,
        description,
        relationships,
        firstNoted: formatFirstNoted(currentPosition),
      },
      via: detailsOpen ? 'form' : 'quick',
    });
  };
  const addSuggestion = (suggestedName: string) => {
    addMutation.mutate({
      name: suggestedName,
      details: {
        role: '',
        description: '',
        relationships: '',
        firstNoted: formatFirstNoted(currentPosition),
      },
      via: 'suggestion',
    });
  };

  // A tapped @mention scrolls to and briefly highlights the card (D-045).
  const listRef = useRef<FlatList<Character>>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  useEffect(() => {
    if (focusCharacterId === null) {
      return;
    }
    const index = sorted.findIndex((character) => character.id === focusCharacterId);
    if (index < 0) {
      return;
    }
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    setHighlightId(focusCharacterId);
    onFocusHandled();
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [focusCharacterId, sorted, onFocusHandled]);

  const suggestionBlock =
    suggestions.length > 0 ? (
      <View style={styles.suggestionBlock}>
        <Text style={styles.suggestionLabel}>From your entries — tap to add</Text>
        <View style={styles.suggestionRow}>
          {suggestions.map((suggestedName) => (
            <Pressable
              key={suggestedName}
              style={styles.suggestionChip}
              onPress={() => addSuggestion(suggestedName)}
              disabled={addMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Add ${suggestedName} to your character map`}
            >
              <Text style={styles.suggestionChipText}>+ {suggestedName}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null;

  // Progressive disclosure: the form only appears when the capture bar asks
  // for it, and its detail fields only when the reader wants them.
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
        <View style={styles.nameRow}>
          <TextInput
            style={[styles.input, styles.nameInput]}
            placeholder="Name, e.g., Frodo Baggins"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            autoFocus={composerMode === 'write'}
            returnKeyType="done"
            onSubmitEditing={submitForm}
          />
          <Pressable
            style={[styles.primaryButton, styles.nameAddButton]}
            onPress={submitForm}
            disabled={addMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Add character"
          >
            {addMutation.isPending ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.primaryButtonText}>Add</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.quickAddHint}>
          {stampLabel
            ? `Just the name is enough — they'll be noted around ${stampLabel.toLowerCase()}.`
            : 'Just the name is enough — details can come later.'}
        </Text>

        {!detailsOpen ? (
          <Pressable
            style={styles.detailsToggle}
            onPress={() => setDetailsOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add role, notes, and relationships"
          >
            <Text style={styles.detailsToggleText}>+ Add role, notes, and relationships</Text>
          </Pressable>
        ) : (
          <>
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
          </>
        )}

        {dictation.error ? <Text style={styles.error}>{dictation.error}</Text> : null}
        {formError ? <Text style={styles.error}>{formError}</Text> : null}
      </View>
    ) : null;

  return (
    <FlatList
      ref={listRef}
      data={sorted}
      keyExtractor={(character) => String(character.id)}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: true,
        });
        setTimeout(() => {
          listRef.current?.scrollToIndex({
            index: info.index,
            animated: true,
            viewPosition: 0.3,
          });
        }, 300);
      }}
      ListHeaderComponent={
        <View>
          {addForm}
          {suggestionBlock}
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
      renderItem={({ item }) => (
        <CharacterCard character={item} bookId={bookId} focused={item.id === highlightId} />
      )}
    />
  );
}

function CharacterCard({
  character,
  bookId,
  focused,
}: {
  character: Character;
  bookId: number;
  focused?: boolean;
}) {
  const queryClient = useQueryClient();
  const details = parseCharacterDescription(character.description);
  const firstNotedLabel = formatFirstNotedLabel(details.firstNoted);
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
        firstNoted: draft.firstNoted,
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
    <View style={[styles.card, focused && styles.cardFocused]}>
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
          {firstNotedLabel ? (
            <Text style={styles.firstNotedText}>First noted · {firstNotedLabel}</Text>
          ) : null}
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
    fontFamily: fonts.serif,
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
    fontFamily: fonts.serif,
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
    ...buttonShadow,
  },
  finishButtonDone: {
    backgroundColor: gold.base,
    borderColor: gold.base,
  },
  finishText: {
    fontFamily: fonts.serif,
    color: gold.deep,
    fontWeight: '700',
    fontSize: 14,
  },
  finishTextDone: {
    fontFamily: fonts.serif,
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
    borderWidth: 1,
    borderColor: gold.base,
    ...cardShadow,
  },
  tabText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    fontFamily: fonts.serif,
    color: gold.deep,
    fontWeight: '700',
  },
  tabPane: {
    flex: 1,
  },
  tabPaneHidden: {
    display: 'none',
  },
  dayHeading: {
    fontFamily: fonts.serif,
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
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 12,
  },
  positionMeta: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
  },
  // Anchored capture bar (D-054): a solid shelf fixed to the screen's bottom
  // edge - full-bleed against the container padding, separated from the
  // scroll by a firm top border and an upward shadow.
  captureBar: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.card,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
    elevation: 8,
    shadowColor: '#2a1c11',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
  },
  // Primary capture actions are physical gold buttons (D-054): soft gold
  // fill, firm dark-gold border, and real elevation.
  captureAction: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    ...buttonShadow,
  },
  captureActionText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
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
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    ...buttonShadow,
  },
  composerCloseText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontWeight: '700',
    fontSize: 13,
  },
  // The paid recap teaser dresses differently from entry cards on purpose:
  // warm gold tint, accent frame, serif title - a Companion-branded surface.
  companionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    ...cardShadow,
  },
  // The gold bookmark (Interface v2.0): premium ribbon pinned above the
  // reader's bookmarks, notched like the entry ribbons but in gold.
  goldBookmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 6,
    paddingLeft: 14,
    paddingRight: 26,
    height: 60,
    marginBottom: 18,
    overflow: 'hidden',
    ...buttonShadow,
  },
  goldBookmarkPressed: {
    opacity: 0.8,
  },
  goldBookmarkBody: {
    flex: 1,
  },
  goldBookmarkTitle: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 15,
    fontWeight: '700',
  },
  goldBookmarkSub: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 12,
    opacity: 0.85,
    marginTop: 1,
  },
  goldBookmarkNotch: {
    position: 'absolute',
    right: -1,
    top: '50%',
    marginTop: -30,
    width: 0,
    height: 0,
    borderTopWidth: 30,
    borderBottomWidth: 30,
    borderRightWidth: 13,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: colors.background,
  },
  companionRowTitle: {
    color: colors.accent,
    fontFamily: fonts.serif,
    fontWeight: '700',
    fontSize: 15,
  },
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
    fontFamily: fonts.serif,
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
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  entryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 11,
  },
  // A flagged important moment earns the gold highlight (D-054).
  importantChip: {
    alignSelf: 'flex-start',
    backgroundColor: gold.glowSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  importantChipText: {
    fontFamily: fonts.serif,
    color: gold.deep,
    fontWeight: '700',
    fontSize: 11,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 10,
    marginVertical: 2,
  },
  quoteText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
  },
  kindRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  // Active selection states carry the gold highlight (D-054).
  kindChip: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...buttonShadow,
  },
  kindChipActive: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  kindChipText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
  },
  kindChipTextActive: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.card,
    ...buttonShadow,
  },
  filterChipActive: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  filterChipText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontWeight: '600',
    fontSize: 13,
  },
  filterChipTextActive: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
  },
  aidPendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aidPendingText: { fontFamily: fonts.serif, color: colors.muted, fontSize: 13 },
  aidCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
    ...cardShadow,
  },
  aidLabel: {
    fontFamily: fonts.serif,
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  aidSuggestion: { fontFamily: fonts.serif, color: colors.text, fontSize: 14, lineHeight: 21 },
  flagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    marginBottom: 12,
    ...cardShadow,
  },
  flagsRowText: { fontFamily: fonts.serif, color: colors.text, fontSize: 13, fontWeight: '600' },
  meaningBlock: { marginTop: 10 },
  meaningResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    ...cardShadow,
  },
  meaningResultText: { fontFamily: fonts.serif, color: colors.text, fontSize: 13, flex: 1 },
  meaningClearText: { fontFamily: fonts.serif, color: colors.accent, fontSize: 13, fontWeight: '600' },
  flagsHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flagSuggestion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
    gap: 4,
  },
  flagPreview: { fontFamily: fonts.serif, color: colors.text, fontSize: 13, fontStyle: 'italic' },
  flagReason: { fontFamily: fonts.serif, color: colors.muted, fontSize: 12, lineHeight: 17 },
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
    fontFamily: fonts.serif,
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
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...buttonShadow,
  },
  segmentActive: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  segmentText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontWeight: '600',
  },
  segmentTextActive: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
  },
  progressInput: {
    flex: 1,
  },
  boundaryHint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
  },
  dictateButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    ...buttonShadow,
  },
  dictateButtonText: {
    fontFamily: fonts.serif,
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
    fontFamily: fonts.serif,
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 6,
  },
  dictationPartial: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  dictationPreview: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
  dictationRawNote: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  dictationHint: {
    fontFamily: fonts.serif,
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
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...buttonShadow,
  },
  stopButtonText: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    fontFamily: fonts.serif,
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
  highlightMatch: {
    fontFamily: fonts.serif,
    backgroundColor: gold.glow,
    color: colors.text,
    fontWeight: '700',
    borderRadius: 3,
  },
  // Primary actions are physical gold buttons (D-054).
  primaryButton: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
    ...buttonShadow,
  },
  primaryButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
    fontSize: 15,
  },
  loader: {
    marginVertical: 16,
  },
  error: {
    fontFamily: fonts.serif,
    color: colors.danger,
    marginTop: 8,
  },
  empty: {
    fontFamily: fonts.serif,
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
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  cardDate: {
    fontFamily: fonts.serif,
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
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...buttonShadow,
  },
  smallButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontWeight: '700',
    fontSize: 13,
  },
  smallButtonGhost: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...buttonShadow,
  },
  smallButtonGhostText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  smallButtonDanger: {
    backgroundColor: colors.card,
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...buttonShadow,
  },
  smallButtonDangerText: {
    fontFamily: fonts.serif,
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
  firstNotedText: {
    fontFamily: fonts.serif,
    color: gold.deep,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  cardFocused: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  nameInput: {
    flex: 1,
  },
  nameAddButton: {
    marginTop: 0,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  quickAddHint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
  },
  detailsToggle: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  detailsToggleText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  suggestionBlock: {
    marginTop: 4,
    marginBottom: 12,
  },
  suggestionLabel: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Character quick-add chips are physical, not thin outlines (D-054).
  suggestionChip: {
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...buttonShadow,
  },
  suggestionChipText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  mentionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  mentionText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontWeight: '700',
  },
  characterSection: {
    marginTop: 8,
  },
  characterLabel: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  photoStatus: {
    fontFamily: fonts.serif,
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
