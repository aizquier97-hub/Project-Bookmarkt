import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CompanionRequestError,
  fetchLatestCompanionRecap,
  requestCompanionRecap,
  type CompanionChatMessage,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { formatRelativeTime } from '@/lib/relativeTime';
import { queryKeys } from '@/lib/queryKeys';
import { cardShadow, buttonShadow, colors, fonts, gold } from '@/lib/theme';

type Detail = 'brief' | 'detailed';

/**
 * "Where you left off" (D-022): the companion retells the story so far from
 * the reader's own entries, never past the latest one. Entitled readers get
 * the real recap here (the Stage 3 locked teaser's replacement); everyone
 * else keeps the teaser copy until billing arrives in Phase 3. The newest
 * recap is stored server-side, so reopening the card costs nothing.
 */
export function RecapCard({
  bookId,
  latestEntryRelative,
  entryCount,
}: {
  bookId: number;
  latestEntryRelative: string | null;
  entryCount: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail>('brief');
  const [requestError, setRequestError] = useState<string | null>(null);

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
    enabled: open,
  });
  const entitled = entitlementQuery.data?.entitled === true;

  const recapQuery = useQuery({
    queryKey: queryKeys.companionRecap(bookId),
    queryFn: () => fetchLatestCompanionRecap(bookId),
    enabled: open && entitled,
  });

  const recapMutation = useMutation({
    mutationFn: () => requestCompanionRecap(bookId, detail),
    onMutate: () => setRequestError(null),
    onSuccess: (result) => {
      trackAnalyticsEvent('recap_requested', { detail, status: 'succeeded', entryCount }, bookId);
      const saved = result.messages.find((m) => m.role === 'companion');
      const recap: CompanionChatMessage = saved ?? {
        id: Date.now(),
        role: 'companion',
        feature: 'recap',
        content: result.reply.content,
        createdAt: new Date().toISOString(),
        provenance: result.reply.provenance,
        declined: result.reply.declined,
        boundaryLabel: result.boundaryLabel,
      };
      queryClient.setQueryData(queryKeys.companionRecap(bookId), recap);
    },
    onError: (err) => {
      const code = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('recap_requested', { detail, status: code, entryCount }, bookId);
      setRequestError(
        err instanceof CompanionRequestError
          ? err.message
          : 'The recap could not be written. Please try again.',
      );
    },
  });

  const toggleOpen = () => {
    const opening = !open;
    setOpen(opening);
    if (opening) {
      // The pre-companion buying-interest signal keeps its name and shape.
      trackAnalyticsEvent('recap_teaser_tapped', { entryCount }, bookId);
    }
  };

  const recap = recapQuery.data ?? null;

  return (
    <View>
      <Pressable
        style={styles.row}
        onPress={toggleOpen}
        accessibilityRole="button"
        accessibilityLabel="Where you left off"
      >
        <View style={styles.titleRow}>
          <Ionicons
            name={entitled ? 'book-outline' : 'lock-closed'}
            size={13}
            color={gold.deep}
          />
          <Text style={styles.title}>Where you left off</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{open ? '✕' : 'Companion'}</Text>
        </View>
      </Pressable>

      {open ? (
        <View style={styles.card}>
          {entitlementQuery.isPending ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : !entitled ? (
            <Text style={styles.body}>
              A Companion feature: it retells the story so far from your own entries — never past
              your latest one{latestEntryRelative ? ` (${latestEntryRelative})` : ''}. The
              companion is part of the paid plan; subscriptions are coming soon.
            </Text>
          ) : (
            <View style={styles.recapArea}>
              {recap ? (
                <View style={styles.recapBlock}>
                  <Text style={styles.recapText}>{recap.content}</Text>
                  <View style={styles.metaRow}>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>From your notes</Text>
                    </View>
                    {recap.boundaryLabel ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="shield-checkmark-outline" size={11} color={colors.muted} />
                        <Text style={styles.metaChipText}>
                          Nothing past {recap.boundaryLabel}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.metaTime}>
                      Retold {formatRelativeTime(recap.createdAt)}
                    </Text>
                  </View>
                </View>
              ) : recapQuery.isPending ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.body}>
                  I shall retell the story so far using only your entries — a quick sketch or the
                  longer account, as you prefer.
                </Text>
              )}

              <View style={styles.controlsRow}>
                <View style={styles.segment}>
                  {(['brief', 'detailed'] as const).map((option) => (
                    <Pressable
                      key={option}
                      style={[styles.segmentItem, detail === option && styles.segmentItemActive]}
                      onPress={() => setDetail(option)}
                      accessibilityRole="button"
                      accessibilityLabel={`${option === 'brief' ? 'Brief' : 'Detailed'} recap`}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          detail === option && styles.segmentTextActive,
                        ]}
                      >
                        {option === 'brief' ? 'Brief' : 'Detailed'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  style={[styles.retellButton, recapMutation.isPending && styles.retellDisabled]}
                  onPress={() => recapMutation.mutate()}
                  disabled={recapMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Retell the story so far"
                >
                  {recapMutation.isPending ? (
                    <ActivityIndicator size="small" color={gold.onFill} />
                  ) : (
                    <Text style={styles.retellText}>{recap ? 'Retell afresh' : 'Retell'}</Text>
                  )}
                </Pressable>
              </View>

              {recapMutation.isPending ? (
                <Text style={styles.workingText}>Rereading your notes…</Text>
              ) : null}
              {requestError ? <Text style={styles.errorText}>{requestError}</Text> : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A physical paper insert (D-054): cream card stock, slight border, real
  // shadow, with a gold spine marking the Companion surface.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    ...cardShadow,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    color: colors.text,
    fontFamily: fonts.serif,
    fontWeight: '700',
    fontSize: 15,
  },
  pill: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: {
    fontFamily: fonts.serif,
    color: colors.background,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderLeftColor: gold.base,
    borderRadius: 12,
    padding: 14,
    marginTop: -8,
    marginBottom: 14,
    ...cardShadow,
  },
  body: { fontFamily: fonts.serif, color: colors.text, fontSize: 14, lineHeight: 21 },
  recapArea: { gap: 12 },
  recapBlock: { gap: 8 },
  recapText: { fontFamily: fonts.serif, color: colors.text, fontSize: 14.5, lineHeight: 22 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaChipText: { fontFamily: fonts.serif, fontSize: 10.5, color: colors.muted, fontWeight: '600' },
  metaTime: { fontFamily: fonts.serif, fontSize: 11, color: colors.muted },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  segmentItem: { paddingHorizontal: 12, paddingVertical: 6 },
  segmentItemActive: { backgroundColor: gold.fill },
  segmentText: { fontFamily: fonts.serif, fontSize: 12.5, fontWeight: '600', color: colors.muted },
  segmentTextActive: { fontFamily: fonts.serif, color: gold.onFill, fontWeight: '700' },
  retellButton: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 88,
    alignItems: 'center',
    ...buttonShadow,
  },
  retellDisabled: { opacity: 0.6 },
  retellText: { fontFamily: fonts.serif, color: gold.onFill, fontWeight: '700', fontSize: 13 },
  workingText: { fontFamily: fonts.serif, color: colors.muted, fontSize: 13, fontStyle: 'italic' },
  errorText: { fontFamily: fonts.serif, color: colors.danger, fontSize: 13, lineHeight: 19 },
});
