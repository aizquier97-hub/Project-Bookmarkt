import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { bookSectionStyles as shared, confirmDestructive, formatRecordTimestamp } from '@/components/book/shared';
import { formatFirstNotedLabel } from '@/domains/characters/capture';
import {
  deleteCharacter,
  parseCharacterDescription,
  updateCharacter,
  type Character,
  type CharacterDetails,
} from '@/domains/characters/service';
import { queryKeys } from '@/lib/queryKeys';
import { colors, fonts, gold, spacing } from '@/lib/theme';

/**
 * One character card (D-093, after the Figma "Book · Characters" screen):
 * serif name with the gold first-noted stamp beside it, the role, the
 * reader's notes, then a hairline and "Edit ›" / "Delete". Editing swaps
 * the body for the four fields in place.
 */
export function CharacterCard({
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

  if (editing) {
    return (
      <View style={[shared.card, focused && shared.cardFocused]}>
        <TextInput
          style={shared.input}
          placeholder="Name"
          placeholderTextColor={colors.muted}
          value={draft.name}
          onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
          autoFocus
        />
        <TextInput
          style={[shared.input, shared.stackedInput]}
          placeholder="Role"
          placeholderTextColor={colors.muted}
          value={draft.role}
          onChangeText={(value) => setDraft((prev) => ({ ...prev, role: value }))}
        />
        <TextInput
          style={[shared.input, shared.stackedInput, shared.textAreaSmall]}
          placeholder="Traits and notes..."
          placeholderTextColor={colors.muted}
          value={draft.description}
          onChangeText={(value) => setDraft((prev) => ({ ...prev, description: value }))}
          multiline
        />
        <TextInput
          style={[shared.input, shared.stackedInput, shared.textAreaSmall]}
          placeholder="Relationships"
          placeholderTextColor={colors.muted}
          value={draft.relationships}
          onChangeText={(value) => setDraft((prev) => ({ ...prev, relationships: value }))}
          multiline
        />
        {error ? <Text style={shared.error}>{error}</Text> : null}
        <View style={shared.cardActions}>
          <Pressable
            style={shared.smallButton}
            onPress={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            accessibilityRole="button"
          >
            <Text style={shared.smallButtonText}>
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Text>
          </Pressable>
          <Pressable
            style={shared.smallButtonGhost}
            onPress={() => {
              setEditing(false);
              setDraft({ name: character.name, ...parseCharacterDescription(character.description) });
              setError(null);
            }}
            accessibilityRole="button"
          >
            <Text style={shared.smallButtonGhostText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[shared.card, focused && shared.cardFocused]}>
      <View style={styles.nameRow}>
        <Text style={styles.name}>{character.name}</Text>
        {firstNotedLabel ? (
          <Text style={styles.firstNoted} numberOfLines={1}>
            First noted · {firstNotedLabel}
          </Text>
        ) : null}
      </View>
      {details.role ? <Text style={styles.role}>{details.role}</Text> : null}
      {details.description ? <Text style={[shared.cardText, styles.body]}>{details.description}</Text> : null}
      {details.relationships ? (
        <Text style={[shared.cardText, styles.body]}>
          <Text style={styles.bodyLabel}>Relationships · </Text>
          {details.relationships}
        </Text>
      ) : null}
      <Text style={shared.cardDate}>{formatRecordTimestamp(character)}</Text>
      {error ? <Text style={shared.error}>{error}</Text> : null}
      <View style={shared.cardDivider} />
      <View style={shared.cardFooter}>
        <Pressable
          style={shared.textAction}
          onPress={() => {
            setDraft({ name: character.name, ...parseCharacterDescription(character.description) });
            setEditing(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${character.name}`}
        >
          <Text style={shared.textActionLabel}>Edit ›</Text>
        </Pressable>
        <Pressable
          style={shared.textAction}
          onPress={() =>
            confirmDestructive('Delete character', 'Delete this character map entry?', () =>
              deleteMutation.mutate(),
            )
          }
          disabled={deleteMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${character.name}`}
        >
          <Text style={shared.textActionMuted}>
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: { flexShrink: 1, fontFamily: fonts.serif, fontSize: 22, lineHeight: 28, color: colors.text },
  firstNoted: { fontFamily: fonts.sansMedium, fontSize: 12, color: gold.deep },
  role: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  body: { marginTop: spacing.sm },
  bodyLabel: { fontFamily: fonts.sansMedium, color: colors.muted },
});
