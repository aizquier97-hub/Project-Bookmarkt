import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { getLatestProgressBoundary, type ProgressType } from '@/domains/entries/progress';
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
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { cleanupTranscript } from '@/domains/voice/cleanup';
import { useDictation } from '@/domains/voice/useDictation';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { cardShadow, colors, fonts } from '@/lib/theme';

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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Stack.Screen options={{ title: book?.name ?? 'Book' }} />

        {book?.author ? <Text style={styles.author}>by {book.author}</Text> : null}
        {metaParts.length ? <Text style={styles.meta}>{metaParts.join(' · ')}</Text> : null}

        <Link
          href={{ pathname: '/edit-book', params: { id: String(bookId) } }}
          asChild
        >
          <Pressable style={styles.editDetailsButton}>
            <Text style={styles.editDetailsText}>Edit book details</Text>
          </Pressable>
        </Link>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabButton, tab === 'entries' && styles.tabButtonActive]}
            onPress={() => setTab('entries')}
          >
            <Text style={[styles.tabText, tab === 'entries' && styles.tabTextActive]}>
              Entries
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

        {tab === 'entries' ? (
          <EntriesTab bookId={bookId} />
        ) : tab === 'characters' ? (
          <CharactersTab bookId={bookId} />
        ) : (
          <PhotosTab bookId={bookId} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function EntriesTab({ bookId }: { bookId: number }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [progressType, setProgressType] = useState<ProgressType>('page');
  const [progressValue, setProgressValue] = useState('');
  const [text, setText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [rawTranscripts, setRawTranscripts] = useState<string[]>([]);
  const dictation = useDictation();

  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
  });

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const latestBoundary = useMemo(
    () => getLatestProgressBoundary(entries, progressType),
    [entries, progressType],
  );

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
      showToast('Entry saved.', 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not save the entry.');
    },
  });

  const captureForm = (
    <View style={styles.captureCard}>
      <Text style={styles.captureTitle}>Save a reading entry</Text>
      <Text style={styles.captureHint}>
        Record where you stopped and what happened, in your own words. Your latest entry sets
        your reading boundary.
      </Text>

      <View style={styles.segmentRow}>
        {(['page', 'chapter'] as const).map((type) => (
          <Pressable
            key={type}
            style={[styles.segment, progressType === type && styles.segmentActive]}
            onPress={() => setProgressType(type)}
          >
            <Text style={[styles.segmentText, progressType === type && styles.segmentTextActive]}>
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
        placeholder="Write what happened since your last entry..."
        placeholderTextColor={colors.muted}
        value={text}
        onChangeText={setText}
        multiline
      />

      {dictation.status === 'idle' ? (
        <Pressable style={styles.dictateButton} onPress={() => void dictation.start()}>
          <Text style={styles.dictateButtonText}>🎤 Dictate instead</Text>
        </Pressable>
      ) : null}

      {dictation.status === 'recording' ? (
        <View style={styles.dictationCard}>
          <Text style={styles.dictationLabel}>Listening… speak your entry.</Text>
          {dictation.partial ? (
            <Text style={styles.dictationPartial}>{dictation.partial}</Text>
          ) : null}
          <Pressable style={styles.stopButton} onPress={dictation.stop}>
            <Text style={styles.stopButtonText}>■ Stop dictation</Text>
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
  );

  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => String(entry.id)}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {captureForm}
          {entriesQuery.isPending ? (
            <LoadingState label="Loading entries…" />
          ) : entriesQuery.isError ? (
            <ErrorState
              error={entriesQuery.error}
              fallback="Could not load entries."
              onRetry={() => void entriesQuery.refetch()}
            />
          ) : entries.length === 0 ? (
            <EmptyState message="No entries yet for this book." />
          ) : null}
        </View>
      }
      renderItem={({ item }) => <EntryCard entry={item} bookId={bookId} />}
    />
  );
}

function EntryCard({ entry, bookId }: { entry: Entry; bookId: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () => updateEntry(entry.id, bookId, draft),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the entry.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntry(entry.id, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
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
          <Text style={styles.cardText}>{entry.text}</Text>
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

function CharactersTab({ bookId }: { bookId: number }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [relationships, setRelationships] = useState('');
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

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
      showToast('Character added.', 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.characters(bookId) });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Could not add the character.');
    },
  });

  const addForm = (
    <View style={styles.captureCard}>
      <Text style={styles.captureTitle}>Add a character</Text>
      <TextInput
        style={styles.input}
        placeholder="Name, e.g., Frodo Baggins"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
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

      <TextInput
        style={[styles.input, styles.searchInput]}
        placeholder="Search by name, role, or relationship..."
        placeholderTextColor={colors.muted}
        value={search}
        onChangeText={setSearch}
      />
    </View>
  );

  return (
    <FlatList
      data={filtered}
      keyExtractor={(character) => String(character.id)}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {addForm}
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
                  ? 'No characters mapped yet for this book.'
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

function PhotosTab({ bookId }: { bookId: number }) {
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
  editDetailsButton: {
    alignSelf: 'flex-start',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  editDetailsText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tabText: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 14,
  },
  tabTextActive: {
    color: colors.background,
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
