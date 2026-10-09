import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BookHeroCompact } from '@/components/book/BookHeroCompact';
import { CharacterCard } from '@/components/book/CharacterCard';
import { SectionFooterActions } from '@/components/book/SectionFooterActions';
import { bookSectionStyles as shared } from '@/components/book/shared';
import { KeyboardPane } from '@/components/KeyboardPane';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { StickyFooter } from '@/components/ui';
import {
  formatFirstNoted,
  sortCharactersByAppearance,
  suggestCharacterNames,
} from '@/domains/characters/capture';
import {
  addCharacter,
  listCharacters,
  parseCharacterDescription,
  type Character,
  type CharacterDetails,
} from '@/domains/characters/service';
import { formatBoundaryPosition, getCurrentPosition, splitEntryText } from '@/domains/entries/display';
import { parseEntryKind } from '@/domains/entries/markers';
import { listEntries } from '@/domains/entries/service';
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { cleanupTranscript } from '@/domains/voice/cleanup';
import { useDictation } from '@/domains/voice/useDictation';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, radii, spacing } from '@/lib/theme';

type ComposerMode = 'write' | 'speak' | null;

/**
 * The book's character map on its own screen (D-093). The Sandglass's "Did
 * you meet someone new?" card hands off with ?compose=write|speak; a tapped
 * @mention arrives with ?character=<id> and the card scrolls into view.
 */
export default function BookCharactersScreen() {
  const params = useLocalSearchParams<{ id: string; character?: string; compose?: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const composeParam: ComposerMode =
    params.compose === 'write' || params.compose === 'speak' ? params.compose : null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [composerMode, setComposerMode] = useState<ComposerMode>(composeParam);
  const [focusCharacterId, setFocusCharacterId] = useState<number | null>(() => {
    const parsed = Number(params.character);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  });
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [relationships, setRelationships] = useState('');
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  // Name-first quick add (D-045): details hide behind a toggle so a name
  // alone is a complete, zero-friction capture.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const dictation = useDictation();

  // A composer opened by a hand-off param (D-087) counts like a footer tap.
  useEffect(() => {
    if (validId && composeParam) {
      trackAnalyticsEvent(
        'composer_opened',
        { target: 'character', mode: composeParam, source: 'timer_handoff' },
        bookId,
      );
    }
    // Mount-only: the params describe how this screen was entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validId, bookId]);

  // "Speak character" opens the form with dictation already running.
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
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
    enabled: validId,
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
        setComposerMode(null);
      }
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not add the character.');
    },
  });

  const submitForm = () => {
    addMutation.mutate({
      name,
      details: { role, description, relationships, firstNoted: formatFirstNoted(currentPosition) },
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
  const openComposer = (mode: Exclude<ComposerMode, null>) => {
    trackAnalyticsEvent('composer_opened', { target: 'character', mode, source: 'capture_bar' }, bookId);
    setComposerMode(mode);
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
    setFocusCharacterId(null);
    const timer = setTimeout(() => setHighlightId(null), 2500);
    return () => clearTimeout(timer);
  }, [focusCharacterId, sorted]);

  const screenOptions = <Stack.Screen options={{ title: 'Characters', headerBackTitle: 'Book' }} />;

  if (!validId) {
    return (
      <View style={[shared.flex, styles.invalid]}>
        {screenOptions}
        <Text style={shared.error}>This book link is not valid.</Text>
      </View>
    );
  }

  const metaLine =
    characters.length === 0
      ? 'Your cast, kept close'
      : `${characters.length} ${characters.length === 1 ? 'character' : 'characters'} · your cast, kept close`;

  const addForm =
    composerMode !== null ? (
      <View style={styles.formCard}>
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>Add a character</Text>
          <Pressable
            onPress={() => setComposerMode(null)}
            accessibilityRole="button"
            accessibilityLabel="Close the character form"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
        <View style={styles.nameRow}>
          <TextInput
            style={[shared.input, styles.nameInput]}
            placeholder="Name, e.g., Frodo Baggins"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            autoFocus={composerMode === 'write'}
            returnKeyType="done"
            onSubmitEditing={submitForm}
          />
          <Pressable
            style={[shared.smallButton, styles.nameAddButton]}
            onPress={submitForm}
            disabled={addMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Add character"
          >
            {addMutation.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={shared.smallButtonText}>Add</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.hint}>
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
              style={[shared.input, shared.stackedInput]}
              placeholder="Role, e.g., Main protagonist"
              placeholderTextColor={colors.muted}
              value={role}
              onChangeText={setRole}
            />
            <TextInput
              style={[shared.input, shared.stackedInput, shared.textAreaSmall]}
              placeholder="Traits and notes..."
              placeholderTextColor={colors.muted}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <TextInput
              style={[shared.input, shared.stackedInput, shared.textAreaSmall]}
              placeholder="Relationships, e.g., Sam (best friend)"
              placeholderTextColor={colors.muted}
              value={relationships}
              onChangeText={setRelationships}
              multiline
            />

            {dictation.status === 'idle' ? (
              <Pressable style={styles.dictateButton} onPress={() => void dictation.start()}>
                <Ionicons name="mic" size={15} color={colors.accent} />
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
                <View style={shared.cardActions}>
                  <Pressable
                    style={shared.smallButton}
                    onPress={() => {
                      const raw = dictation.confirm();
                      if (!raw) {
                        return;
                      }
                      const cleaned = cleanupTranscript(raw);
                      setDescription((prev) => (prev.trim() ? `${prev.trimEnd()} ${cleaned}` : cleaned));
                    }}
                  >
                    <Text style={shared.smallButtonText}>Add to notes</Text>
                  </Pressable>
                  <Pressable style={shared.smallButtonGhost} onPress={dictation.discard}>
                    <Text style={shared.smallButtonGhostText}>Discard</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        )}

        {dictation.error ? <Text style={shared.error}>{dictation.error}</Text> : null}
        {formError ? <Text style={shared.error}>{formError}</Text> : null}
      </View>
    ) : null;

  return (
    <KeyboardPane style={shared.flex}>
      {screenOptions}
      <BookHeroCompact book={bookQuery.data} entries={entries} />
      <FlatList
        ref={listRef}
        data={sorted}
        keyExtractor={(character) => String(character.id)}
        contentContainerStyle={shared.list}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: true,
          });
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.3 });
          }, 300);
        }}
        ListHeaderComponent={
          <View>
            <View style={shared.sectionTitleRow}>
              <Text style={shared.sectionTitle} accessibilityRole="header">
                Your characters
              </Text>
            </View>
            <Text style={shared.sectionMeta}>{metaLine}</Text>
            {addForm}
            {suggestions.length > 0 ? (
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
            ) : null}
            {characters.length > 0 ? (
              <TextInput
                style={[shared.input, shared.searchInput]}
                placeholder="Search by name, role, or relationship..."
                placeholderTextColor={colors.muted}
                value={search}
                onChangeText={setSearch}
                accessibilityLabel="Search your characters"
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
      {composerMode === null ? (
        <StickyFooter>
          <SectionFooterActions
            primaryLabel="Add character"
            primaryIcon="person-add-outline"
            onPrimary={() => openComposer('write')}
            squareIcon="mic-outline"
            squareLabel="Speak a character"
            onSquare={() => openComposer('speak')}
          />
        </StickyFooter>
      ) : null}
    </KeyboardPane>
  );
}

const styles = StyleSheet.create({
  invalid: { padding: spacing.lg },
  formCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 12,
    ...cardShadow,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  formTitle: { color: colors.text, fontSize: 18, fontFamily: fonts.serif },
  nameRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  nameInput: { flex: 1 },
  nameAddButton: { paddingHorizontal: 18, justifyContent: 'center' },
  hint: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12, marginTop: 6 },
  detailsToggle: { marginTop: 10, alignSelf: 'flex-start' },
  detailsToggleText: { fontFamily: fonts.sansSemiBold, color: colors.accent, fontSize: 13 },
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
    marginTop: 10,
    ...buttonShadow,
  },
  dictateButtonText: { fontFamily: fonts.sansSemiBold, color: colors.accent, fontSize: 13 },
  dictationCard: {
    backgroundColor: colors.background,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.field,
    padding: 12,
    marginTop: 10,
  },
  dictationLabel: { fontFamily: fonts.sansSemiBold, color: colors.text, fontSize: 13, marginBottom: 6 },
  dictationPartial: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14, marginBottom: 8 },
  dictationPreview: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 8,
  },
  dictationHint: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12, lineHeight: 16, marginBottom: 4 },
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
  stopButtonText: { fontFamily: fonts.sansSemiBold, color: colors.danger, fontSize: 13 },
  suggestionBlock: { marginTop: 4, marginBottom: 12 },
  suggestionLabel: {
    fontFamily: fonts.sansMedium,
    color: colors.accent,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip: {
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...buttonShadow,
  },
  suggestionChipText: { fontFamily: fonts.sansSemiBold, color: colors.accent, fontSize: 13 },
});
