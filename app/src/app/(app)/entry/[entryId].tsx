import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { listCharacters } from '@/domains/characters/service';
import { splitEntryText } from '@/domains/entries/display';
import { parseEntryKind } from '@/domains/entries/markers';
import {
  applyMentionToText,
  filterNamesForMention,
  findActiveMentionQuery,
  splitTextForMentions,
} from '@/domains/entries/mentions';
import { deleteEntry, listEntries, updateEntry } from '@/domains/entries/service';
import { ErrorState, LoadingState } from '@/components/states';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

/**
 * One entry on its own premium paper (Interface v2.0): tapping a bookmark
 * ribbon opens the full record here - the reader's words at reading size on
 * a proper sheet, with the same edit and delete affordances the old inline
 * card had. Mentions of known characters stay tappable.
 */
export default function EntryDetailScreen() {
  const params = useLocalSearchParams<{ entryId: string; book: string }>();
  const entryId = Number(params.entryId);
  const bookId = Number(params.book);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
    enabled: Number.isFinite(bookId) && bookId > 0,
  });
  const charactersQuery = useQuery({
    queryKey: queryKeys.characters(bookId),
    queryFn: () => listCharacters(bookId),
    enabled: Number.isFinite(bookId) && bookId > 0,
  });
  const mentionTargets = (charactersQuery.data ?? []).map((c) => ({ id: c.id, name: c.name }));

  const entry = (entriesQuery.data ?? []).find((row) => row.id === entryId) ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: () => updateEntry(entryId, bookId, draft),
    onSuccess: () => {
      setEditing(false);
      setError(null);
      showToast('Entry saved.', 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not save the entry.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntry(entryId, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(bookId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.entrySummaries });
      showToast('Entry deleted.', 'success');
      router.back();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Could not delete the entry.');
    },
  });

  const editMentionQuery = editing ? findActiveMentionQuery(draft) : null;
  const editMentionMatches =
    editMentionQuery !== null
      ? filterNamesForMention(
          mentionTargets.map((target) => target.name),
          editMentionQuery,
        )
      : [];

  const screenTitle = <Stack.Screen options={{ title: 'Entry' }} />;

  if (entriesQuery.isPending) {
    return (
      <View style={styles.container}>
        {screenTitle}
        <LoadingState label="Opening your entry…" />
      </View>
    );
  }
  if (entriesQuery.isError) {
    return (
      <View style={styles.container}>
        {screenTitle}
        <ErrorState
          error={entriesQuery.error}
          fallback="Could not load the entry."
          onRetry={() => void entriesQuery.refetch()}
        />
      </View>
    );
  }
  if (!entry) {
    return (
      <View style={styles.container}>
        {screenTitle}
        <ErrorState error={null} fallback="This entry is no longer here." />
      </View>
    );
  }

  const parts = splitEntryText(entry.text);
  const marked = parseEntryKind(parts.body);
  const body = marked.body || parts.body || entry.text;

  const created = entry.created_at ? new Date(entry.created_at) : null;
  const createdLabel =
    created && !Number.isNaN(created.getTime())
      ? created.toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : null;
  const edited =
    entry.updated_at &&
    entry.created_at &&
    new Date(entry.updated_at).getTime() - new Date(entry.created_at).getTime() > 1000;

  const openCharacter = (characterId: number) => {
    router.push({
      pathname: '/book/[id]',
      params: { id: String(bookId), tab: 'characters', character: String(characterId) },
    });
  };

  // Mentions of known characters render as tappable links (D-045 parity).
  const renderBody = () => {
    const segments = splitTextForMentions(
      body,
      mentionTargets.map((target) => target.name),
    );
    return segments.map((segment, index) => {
      if (!segment.characterName) {
        return segment.text;
      }
      const lower = segment.characterName.toLowerCase();
      const target = mentionTargets.find((candidate) => candidate.name.toLowerCase() === lower);
      return (
        <Text
          key={index}
          style={styles.mentionText}
          onPress={target ? () => openCharacter(target.id) : undefined}
          accessibilityRole={target ? 'link' : undefined}
        >
          {segment.text}
        </Text>
      );
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {screenTitle}
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.paper}>
          <View style={styles.chipRow}>
            {parts.boundaryLabel ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{parts.boundaryLabel}</Text>
              </View>
            ) : null}
            {marked.kind === 'quote' ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>Quote</Text>
              </View>
            ) : null}
            {marked.kind === 'important' ? (
              <View style={styles.importantChip}>
                <Ionicons name="flag" size={11} color={gold.onFill} />
                <Text style={styles.importantChipText}>Important</Text>
              </View>
            ) : null}
          </View>

          {editing ? (
            <>
              <TextInput
                style={styles.editInput}
                value={draft}
                onChangeText={setDraft}
                multiline
                autoFocus
              />
              {editMentionMatches.length > 0 ? (
                <View style={styles.mentionRow}>
                  {editMentionMatches.map((mentionName) => (
                    <Pressable
                      key={mentionName}
                      style={styles.suggestionChip}
                      onPress={() => setDraft((prev) => applyMentionToText(prev, mentionName))}
                      accessibilityRole="button"
                      accessibilityLabel={`Mention ${mentionName}`}
                    >
                      <Text style={styles.suggestionChipText}>@{mentionName}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <Pressable
                  style={styles.goldButton}
                  onPress={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Save the entry"
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator size="small" color={gold.onFill} />
                  ) : (
                    <Text style={styles.goldButtonText}>Save</Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.ghostButton}
                  onPress={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <Text style={styles.ghostButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {marked.kind === 'quote' ? (
                <View style={styles.quoteBlock}>
                  <Text style={styles.quoteText}>{renderBody()}</Text>
                </View>
              ) : (
                <Text style={styles.bodyText}>{renderBody()}</Text>
              )}
              {createdLabel ? (
                <Text style={styles.dateLine}>
                  {createdLabel}
                  {edited ? ' (edited)' : ''}
                </Text>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actionRow}>
                <Pressable
                  style={styles.ghostButton}
                  onPress={() => {
                    setDraft(entry.text);
                    setError(null);
                    setEditing(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Edit the entry"
                >
                  <Ionicons name="pencil" size={13} color={colors.text} />
                  <Text style={styles.ghostButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.dangerButton}
                  onPress={() =>
                    Alert.alert('Delete entry', 'Delete this entry?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => deleteMutation.mutate(),
                      },
                    ])
                  }
                  disabled={deleteMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Delete the entry"
                >
                  <Text style={styles.dangerButtonText}>
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 16,
    flexGrow: 1,
  },
  paper: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 20,
    ...cardShadow,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  chipText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  importantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: gold.fill,
    borderWidth: 1,
    borderColor: gold.deep,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  importantChipText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 12,
    fontWeight: '700',
  },
  bodyText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 17,
    lineHeight: 27,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 14,
  },
  quoteText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 17,
    lineHeight: 27,
    fontStyle: 'italic',
  },
  mentionText: {
    color: colors.accent,
    fontWeight: '700',
  },
  dateLine: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    marginTop: 16,
  },
  editInput: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 140,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.background,
  },
  mentionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  suggestionChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  suggestionChipText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  goldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: gold.fill,
    borderWidth: 1.5,
    borderColor: gold.deep,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 9,
    ...buttonShadow,
  },
  goldButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 14,
    fontWeight: '700',
  },
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  ghostButtonText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: colors.background,
  },
  dangerButtonText: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 13,
    marginTop: 10,
  },
});
