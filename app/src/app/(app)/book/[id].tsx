import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { getBook } from '@/domains/library/service';
import { colors } from '@/lib/theme';

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
  const [tab, setTab] = useState<'entries' | 'characters'>('entries');

  const bookQuery = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => getBook(bookId),
    enabled: validId,
  });
  const charactersQuery = useQuery({
    queryKey: ['characters', bookId],
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
        </View>

        {tab === 'entries' ? (
          <EntriesTab bookId={bookId} />
        ) : (
          <CharactersTab bookId={bookId} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function EntriesTab({ bookId }: { bookId: number }) {
  const queryClient = useQueryClient();
  const [progressType, setProgressType] = useState<ProgressType>('page');
  const [progressValue, setProgressValue] = useState('');
  const [text, setText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const entriesQuery = useQuery({
    queryKey: ['entries', bookId],
    queryFn: () => listEntries(bookId),
  });

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const latestBoundary = useMemo(
    () => getLatestProgressBoundary(entries, progressType),
    [entries, progressType],
  );

  const addEntryMutation = useMutation({
    mutationFn: () => addEntry(bookId, { text, progressType, progressValue }),
    onSuccess: () => {
      setText('');
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['entries', bookId] });
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
            <ActivityIndicator color={colors.accent} style={styles.loader} />
          ) : entriesQuery.isError ? (
            <Text style={styles.error}>
              {entriesQuery.error instanceof Error
                ? entriesQuery.error.message
                : 'Could not load entries.'}
            </Text>
          ) : entries.length === 0 ? (
            <Text style={styles.empty}>No entries yet for this book.</Text>
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
      void queryClient.invalidateQueries({ queryKey: ['entries', bookId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the entry.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntry(entry.id, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['entries', bookId] });
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
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [relationships, setRelationships] = useState('');
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const charactersQuery = useQuery({
    queryKey: ['characters', bookId],
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
      void queryClient.invalidateQueries({ queryKey: ['characters', bookId] });
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
            <ActivityIndicator color={colors.accent} style={styles.loader} />
          ) : charactersQuery.isError ? (
            <Text style={styles.error}>
              {charactersQuery.error instanceof Error
                ? charactersQuery.error.message
                : 'Could not load characters.'}
            </Text>
          ) : filtered.length === 0 ? (
            <Text style={styles.empty}>
              {characters.length === 0
                ? 'No characters mapped yet for this book.'
                : 'No characters match your search.'}
            </Text>
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
      void queryClient.invalidateQueries({ queryKey: ['characters', bookId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the character.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCharacter(character.id, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['characters', bookId] });
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
    fontSize: 15,
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
  },
  captureTitle: {
    color: colors.text,
    fontSize: 16,
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
    fontSize: 16,
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
});
