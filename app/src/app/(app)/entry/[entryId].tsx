import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { getBook } from '@/domains/library/service';
import { ErrorState, LoadingState } from '@/components/states';
import { KeyboardPane } from '@/components/KeyboardPane';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/queryKeys';
import { HeaderAction } from '@/components/ui';
import { buttonShadow, cardShadow, colors, fonts, gold, radii, sizes, spacing } from '@/lib/theme';

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
  // Book name for the eyebrow line ("<Book> · Your journal"); quiet if it fails.
  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
    enabled: Number.isFinite(bookId) && bookId > 0,
    staleTime: 5 * 60 * 1000,
  });

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activityEntries });
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activityEntries });
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

  const screenTitle = (
    <Stack.Screen
      options={{
        title: 'Entry',
        headerRight:
          entry && !editing
            ? () => (
                <HeaderAction
                  label="Edit"
                  accessibilityLabel="Edit the entry"
                  onPress={() => {
                    setDraft(entry.text);
                    setError(null);
                    setEditing(true);
                  }}
                />
              )
            : undefined,
      }}
    />
  );

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
    <KeyboardPane style={styles.flex}>
      {screenTitle}
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>
          {[bookQuery.data?.name, 'Your journal'].filter(Boolean).join(' · ')}
        </Text>
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
                <Ionicons name="flag" size={11} color={colors.onAccent} />
                <Text style={styles.importantChipText}>Important</Text>
              </View>
            ) : null}
          </View>
          {createdLabel ? (
            <Text style={styles.dateLine}>
              {createdLabel}
              {edited ? ' (edited)' : ''}
            </Text>
          ) : null}
          <View style={styles.divider} />

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
                    <ActivityIndicator size="small" color={colors.onAccent} />
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
    </KeyboardPane>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: spacing.lg,
    flexGrow: 1,
    gap: spacing.md,
  },
  paper: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.md,
    ...cardShadow,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: gold.glowSoft,
    borderRadius: radii.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    color: gold.deep,
    fontSize: 12,
  },
  importantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  importantChipText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 12,
  },
  bodyText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 22,
    lineHeight: 32,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 14,
  },
  quoteText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 22,
    lineHeight: 32,
  },
  mentionText: {
    fontFamily: fonts.serif,
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  dateLine: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  editInput: {
    fontFamily: fonts.sans,
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
    fontFamily: fonts.sansSemiBold,
    color: colors.accent,
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  goldButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: sizes.button,
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    ...buttonShadow,
  },
  goldButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 14,
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
    fontFamily: fonts.sansSemiBold,
    color: colors.text,
    fontSize: 14,
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
    fontFamily: fonts.sansSemiBold,
    color: colors.danger,
    fontSize: 14,
  },
  error: {
    fontFamily: fonts.sans,
    color: colors.danger,
    fontSize: 13,
    marginTop: 10,
  },
});
