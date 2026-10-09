import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { openSubscription } from '@/domains/billing/paywallSource';
import {
  CompanionRequestError,
  extractCharacters,
  hashNoteText,
  type CompanionCharacterSuggestion,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { addCharacter, listCharacters } from '@/domains/characters/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { queryKeys } from '@/lib/queryKeys';
import { cardShadow, colors, fonts, gold } from '@/lib/theme';

/** Notes shorter than this rarely name anyone; the call is not worth a quota tick. */
const MIN_NOTE_CHARS = 12;

/**
 * Character extraction (D-077, premium). Given a note the reader just saved,
 * the companion proposes the people it mentions who are not yet on the map,
 * each with whatever role/description/relationships the note supports. The
 * reader accepts or skips every card; nothing lands on the map unasked.
 *
 * Free readers see a one-line nudge toward the plan instead - the manual
 * "Add a character" path beside this component stays free forever.
 */
export function CharacterSuggestions({
  bookId,
  noteText,
  firstNoted,
}: {
  bookId: number;
  noteText: string;
  /** "page 142" stamp for the characters' first appearance ('' when unknown). */
  firstNoted: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const trimmed = noteText.trim();
  const noteHash = useMemo(() => hashNoteText(trimmed), [trimmed]);

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });
  const entitled = entitlementQuery.data?.entitled === true;
  const charactersQuery = useQuery({
    queryKey: queryKeys.characters(bookId),
    queryFn: () => listCharacters(bookId),
  });

  const extraction = useQuery({
    queryKey: queryKeys.companionCharacterExtract(bookId, noteHash),
    queryFn: async () => {
      try {
        const result = await extractCharacters(bookId, trimmed);
        trackAnalyticsEvent(
          'companion_tool_used',
          { tool: 'character_extract', status: 'succeeded', found: result.characters.length },
          bookId,
        );
        return result;
      } catch (err) {
        const status = err instanceof CompanionRequestError ? err.code : 'error';
        trackAnalyticsEvent('companion_tool_used', { tool: 'character_extract', status }, bookId);
        throw err;
      }
    },
    enabled: entitled && trimmed.length >= MIN_NOTE_CHARS,
    retry: false,
    staleTime: Infinity,
  });

  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const existingNames = useMemo(
    () => new Set((charactersQuery.data ?? []).map((c) => c.name.trim().toLowerCase())),
    [charactersQuery.data],
  );
  const pending = useMemo(
    () =>
      (extraction.data?.characters ?? []).filter(
        (c) => !handled.has(c.name.toLowerCase()) && !existingNames.has(c.name.toLowerCase()),
      ),
    [extraction.data, handled, existingNames],
  );

  const addMutation = useMutation({
    mutationFn: (suggestion: CompanionCharacterSuggestion) =>
      addCharacter(
        bookId,
        suggestion.name,
        {
          role: suggestion.role,
          description: suggestion.description,
          relationships: suggestion.relationships,
          firstNoted,
        },
        'companion',
      ),
    onSuccess: (_created, suggestion) => {
      setHandled((prev) => new Set(prev).add(suggestion.name.toLowerCase()));
      showToast(`${suggestion.name} added to your map.`, 'success');
      void queryClient.invalidateQueries({ queryKey: queryKeys.characters(bookId) });
    },
    onError: (err) => {
      showToast(err instanceof Error ? err.message : 'Could not add the character.', 'error');
    },
  });

  const skip = (suggestion: CompanionCharacterSuggestion) => {
    setHandled((prev) => new Set(prev).add(suggestion.name.toLowerCase()));
  };

  if (trimmed.length < MIN_NOTE_CHARS || entitlementQuery.isPending) {
    return null;
  }

  if (!entitled) {
    return (
      <Pressable
        style={styles.nudge}
        onPress={() => openSubscription(router, 'character_suggestions')}
        accessibilityRole="button"
        accessibilityLabel="Book Club: the companion spots new characters in your notes. View plans"
      >
        <Ionicons name="sparkles-outline" size={15} color={gold.deep} />
        <Text style={styles.nudgeText}>
          Book Club members have new characters spotted in each note and their cards drafted
          automatically.{' '}
          <Text style={styles.nudgeLink}>View plans</Text>
        </Text>
      </Pressable>
    );
  }

  if (extraction.isPending) {
    return (
      <View style={styles.pendingRow}>
        <ActivityIndicator size="small" color={colors.muted} />
        <Text style={styles.pendingText}>Looking for new characters in your note…</Text>
      </View>
    );
  }

  if (extraction.isError) {
    const message =
      extraction.error instanceof CompanionRequestError
        ? extraction.error.message
        : 'The companion could not read your note for characters just now.';
    return <Text style={styles.quiet}>{message}</Text>;
  }

  if (pending.length === 0) {
    const anyFound = (extraction.data?.characters.length ?? 0) > 0;
    return (
      <Text style={styles.quiet}>
        {anyFound
          ? 'All the characters in this note are on your map.'
          : 'No one new turned up in this note.'}
      </Text>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={18} color={gold.deep} />
        <Text style={styles.title}>
          {pending.length === 1 ? 'Someone new in your note' : `${pending.length} new in your note`}
        </Text>
      </View>
      {extraction.data?.reply.content ? (
        <Text style={styles.intro}>{extraction.data.reply.content}</Text>
      ) : null}
      {pending.map((suggestion) => (
        <View key={suggestion.name.toLowerCase()} style={styles.suggestion}>
          <Text style={styles.name}>{suggestion.name}</Text>
          {suggestion.role ? <Text style={styles.role}>{suggestion.role}</Text> : null}
          {suggestion.description ? (
            <Text style={styles.detail}>{suggestion.description}</Text>
          ) : null}
          {suggestion.relationships ? (
            <Text style={styles.detail}>Connected to: {suggestion.relationships}</Text>
          ) : null}
          {!suggestion.role && !suggestion.description && !suggestion.relationships ? (
            <Text style={styles.detail}>Only the name so far - add details any time.</Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.addButton, addMutation.isPending && styles.disabled]}
              onPress={() => addMutation.mutate(suggestion)}
              disabled={addMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Add ${suggestion.name} to your character map`}
            >
              <Ionicons name="person-add-outline" size={14} color={gold.onFill} />
              <Text style={styles.addButtonText}>Add to map</Text>
            </Pressable>
            <Pressable
              style={styles.skipButton}
              onPress={() => skip(suggestion)}
              accessibilityRole="button"
              accessibilityLabel={`Skip ${suggestion.name}`}
            >
              <Text style={styles.skipButtonText}>Skip</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Text style={styles.footnote}>
        Drafted only from what you wrote - every card is yours to edit on the map.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: gold.base,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 10,
    ...cardShadow,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  intro: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    fontStyle: 'italic',
  },
  suggestion: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 4,
  },
  name: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  role: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600',
  },
  detail: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 13,
    fontWeight: '700',
  },
  skipButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  skipButtonText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  footnote: {
    fontFamily: fonts.serif,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  pendingText: {
    fontFamily: fonts.serif,
    fontSize: 13,
    color: colors.muted,
  },
  quiet: {
    fontFamily: fonts.serif,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 12,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: gold.base,
    backgroundColor: gold.glowSoft,
  },
  nudgeText: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  nudgeLink: {
    color: gold.deep,
    fontWeight: '700',
  },
});
