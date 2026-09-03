import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/states';
import {
  CompanionRequestError,
  fetchCompanionMessages,
  requestClubSnapshot,
  sendCompanionMessage,
  type CompanionChatMessage,
  type CompanionProvenance,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { DateRangePicker, rangeToIsoBounds, type DateRange } from '@/components/DateRangePicker';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

const MAX_MESSAGE_CHARS = 2000;

// Deadpan-scholarly openers (D-038): the companion is calm, non-judgmental,
// and never uses emoji. These chips lower the first-message hurdle.
const SUGGESTIONS = [
  'What do my notes say so far?',
  'Remind me who the characters are.',
  'Help me think through my last entry.',
] as const;

const PROVENANCE_LABELS: Record<CompanionProvenance, string> = {
  your_notes: 'From your notes',
  general_knowledge: 'From my knowledge',
  mixed: 'Your notes + my knowledge',
};

// The chat renders older persisted tool results with their original labels;
// club snapshots are the one tool still run from this screen (Interface
// v2.0: cue cards moved to their own tab, quiz and word bank are on hold).
const TOOL_LABELS: Record<string, string> = {
  cue_cards: 'Cue cards',
  quiz: 'Character quiz',
  club_prep: 'Club snapshot',
  word_bank: 'Word bank',
};

export default function CompanionScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (validId) {
      trackAnalyticsEvent('companion_opened', {}, bookId);
    }
  }, [validId, bookId]);

  if (!validId) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Book Club' }} />
        <Text style={styles.stateText}>This book link is not valid.</Text>
      </View>
    );
  }
  if (entitlementQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Book Club' }} />
        <LoadingState label="Checking your companion access…" />
      </View>
    );
  }
  if (entitlementQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Book Club' }} />
        <ErrorState
          error={entitlementQuery.error}
          fallback="Could not check your companion access."
          onRetry={() => void entitlementQuery.refetch()}
        />
      </View>
    );
  }
  if (!entitlementQuery.data.entitled) {
    return <CompanionOffer />;
  }
  return <CompanionChat bookId={bookId} />;
}

/**
 * The subscription-offer state (server said not entitled). Billing arrives
 * in Phase 3; until then this explains the companion without a buy button.
 */
function CompanionOffer() {
  return (
    <View style={styles.offerContainer}>
      <Stack.Screen options={{ title: 'Book Club' }} />
      <View style={styles.offerCard}>
        <View style={styles.offerLockBadge}>
          <Ionicons name="lock-closed" size={18} color={gold.deep} />
        </View>
        <Text style={styles.offerTitle}>The Book Club</Text>
        <Text style={styles.offerBody}>
          A book club of two: talk any book on your shelf over, properly. The companion reads only
          your own notes, never spoils past your latest entry, and always shows whether an answer
          came from your notes or its general knowledge.
        </Text>
        <Text style={styles.offerBody}>
          The Book Club is part of the paid plan. Subscriptions are coming soon — your notes and
          character maps stay free forever.
        </Text>
        <View style={styles.offerPill}>
          <Text style={styles.offerPillText}>Coming soon</Text>
        </View>
      </View>
    </View>
  );
}

function CompanionChat({ bookId }: { bookId: number }) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [quotaNotice, setQuotaNotice] = useState<string | null>(null);
  const [latestBoundary, setLatestBoundary] = useState<string | null>(null);
  const listRef = useRef<FlatList<CompanionChatMessage>>(null);

  const bookQuery = useQuery({
    queryKey: queryKeys.book(bookId),
    queryFn: () => getBook(bookId),
  });
  const messagesQuery = useQuery({
    queryKey: queryKeys.companionMessages(bookId),
    queryFn: () => fetchCompanionMessages(bookId),
  });
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  // The freshest spoiler boundary: the latest reply's metadata, else the
  // newest stored companion message that recorded one.
  const boundaryLabel =
    latestBoundary ??
    [...messages].reverse().find((m) => m.role === 'companion' && m.boundaryLabel)
      ?.boundaryLabel ??
    null;

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendCompanionMessage(bookId, message),
    onMutate: () => {
      setSendError(null);
      setQuotaNotice(null);
    },
    onSuccess: (result) => {
      setDraft('');
      setLatestBoundary(result.boundaryLabel);
      queryClient.setQueryData<CompanionChatMessage[]>(
        queryKeys.companionMessages(bookId),
        (old) => [...(old ?? []), ...result.messages],
      );
      trackAnalyticsEvent('companion_message_sent', { status: 'succeeded' }, bookId);
    },
    onError: (err) => {
      if (err instanceof CompanionRequestError) {
        trackAnalyticsEvent('companion_message_sent', { status: err.code }, bookId);
        if (err.subscriptionRequired) {
          // The server gate disagrees with our cached read - re-render as offer.
          void queryClient.invalidateQueries({ queryKey: queryKeys.companionEntitlement });
          return;
        }
        if (err.quotaExceeded) {
          setQuotaNotice(err.message);
          return;
        }
        setSendError(err.message);
        return;
      }
      trackAnalyticsEvent('companion_message_sent', { status: 'error' }, bookId);
      setSendError('The companion could not respond. Please try again.');
    },
  });

  // The club snapshot (Interface v2.0): a smooth read-through of what the
  // reader recorded between two dates, prepared for the walk to book club.
  // Persisted into the conversation like any companion turn.
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotRange, setSnapshotRange] = useState<DateRange | null>(null);
  const snapshotMutation = useMutation({
    mutationFn: (range: DateRange) => {
      const bounds = rangeToIsoBounds(range);
      return requestClubSnapshot(bookId, bounds.rangeStart, bounds.rangeEnd);
    },
    onMutate: () => {
      setSendError(null);
      setQuotaNotice(null);
    },
    onSuccess: (result) => {
      setSnapshotOpen(false);
      setSnapshotRange(null);
      if (result.boundaryLabel) {
        setLatestBoundary(result.boundaryLabel);
      }
      if (result.messages.length > 0) {
        queryClient.setQueryData<CompanionChatMessage[]>(
          queryKeys.companionMessages(bookId),
          (old) => [...(old ?? []), ...result.messages],
        );
      } else if (result.reply.content) {
        // Empty-range short-circuits are not persisted; show the line as a
        // notice instead.
        setQuotaNotice(result.reply.content);
      }
      trackAnalyticsEvent('companion_tool_used', { tool: 'club_prep', status: 'succeeded' }, bookId);
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'club_prep', status }, bookId);
      if (err instanceof CompanionRequestError) {
        if (err.subscriptionRequired) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.companionEntitlement });
          return;
        }
        if (err.quotaExceeded) {
          setQuotaNotice(err.message);
          return;
        }
        setSendError(err.message);
        return;
      }
      setSendError('The companion could not respond. Please try again.');
    },
  });

  const busy = sendMutation.isPending || snapshotMutation.isPending;

  const canSend = draft.trim().length > 0 && !busy;
  const handleSend = () => {
    const message = draft.trim();
    if (!message || busy) {
      return;
    }
    sendMutation.mutate(message);
  };

  // Inverted list: newest first in data, rendered bottom-up like every chat.
  const inverted = useMemo(() => [...messages].reverse(), [messages]);

  if (messagesQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Book Club' }} />
        <LoadingState label="Opening your conversation…" />
      </View>
    );
  }
  if (messagesQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Book Club' }} />
        <ErrorState
          error={messagesQuery.error}
          fallback="Could not load the conversation."
          onRetry={() => void messagesQuery.refetch()}
        />
      </View>
    );
  }

  const bookName = bookQuery.data?.name ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <Stack.Screen options={{ title: 'Book Club' }} />
      {bookName ? (
        <View style={styles.contextBar}>
          <Text style={styles.contextBook} numberOfLines={1}>
            {bookName}
          </Text>
          <View style={styles.boundaryChip}>
            <Ionicons name="shield-checkmark-outline" size={12} color={colors.muted} />
            <Text style={styles.boundaryText}>
              {boundaryLabel ? `Nothing past ${boundaryLabel}` : 'No spoilers past your notes'}
            </Text>
          </View>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        style={styles.flex}
        data={inverted}
        inverted
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <MessageBubble message={item} />}
        ListHeaderComponent={
          busy ? (
            <View style={[styles.bubble, styles.companionBubble, styles.thinkingBubble]}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={styles.thinkingText}>
                {snapshotMutation.isPending ? 'Reading that stretch…' : 'Consulting your notes…'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          messages.length === 0 ? (
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>At your service</Text>
              <Text style={styles.introBody}>
                I have read your notes on this book — nothing further, I assure you. Ask about
                what you&apos;ve recorded, or think out loud; I shall keep the thread.
              </Text>
              <View style={styles.suggestionWrap}>
                {SUGGESTIONS.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    style={styles.suggestionChip}
                    onPress={() => setDraft(suggestion)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use suggestion: ${suggestion}`}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null
        }
      />

      {quotaNotice ? (
        <View style={styles.noticeBanner}>
          <Ionicons name="hourglass-outline" size={14} color={colors.muted} />
          <Text style={styles.noticeText}>{quotaNotice}</Text>
        </View>
      ) : null}
      {sendError ? (
        <View style={[styles.noticeBanner, styles.errorBanner]}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={[styles.noticeText, styles.errorText]}>{sendError}</Text>
        </View>
      ) : null}

      {snapshotOpen ? (
        <View style={styles.snapshotCard}>
          <View style={styles.snapshotHeader}>
            <Text style={styles.snapshotTitle}>Club snapshot</Text>
            <Pressable
              onPress={() => setSnapshotOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close the snapshot picker"
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.snapshotBody}>
            A smooth read-through of everything you recorded between two dates - made for the walk
            to book club. Pick the stretch:
          </Text>
          <DateRangePicker value={snapshotRange} onChange={setSnapshotRange} />
          <Pressable
            style={[
              styles.snapshotButton,
              (!snapshotRange || busy) && styles.snapshotButtonDisabled,
            ]}
            onPress={() => snapshotRange && snapshotMutation.mutate(snapshotRange)}
            disabled={!snapshotRange || busy}
            accessibilityRole="button"
            accessibilityLabel="Prepare the club snapshot for the chosen dates"
          >
            {snapshotMutation.isPending ? (
              <ActivityIndicator size="small" color={gold.onFill} />
            ) : (
              <>
                <Ionicons name="people" size={15} color={gold.onFill} />
                <Text style={styles.snapshotButtonText}>Prepare my snapshot</Text>
              </>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.toolBarRow}>
          <Pressable
            style={[styles.toolChip, busy && styles.toolChipDisabled]}
            onPress={() => setSnapshotOpen(true)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Prepare a club snapshot for a range of dates"
          >
            <Ionicons name="people-outline" size={13} color={colors.accent} />
            <Text style={styles.toolChipText}>Club snapshot</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.composerRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about your notes…"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={MAX_MESSAGE_CHARS}
          editable={!sendMutation.isPending}
        />
        <Pressable
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message to the companion"
        >
          <Ionicons name="arrow-up" size={18} color={gold.onFill} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: CompanionChatMessage }) {
  if (message.role === 'reader') {
    return (
      <View style={[styles.bubble, styles.readerBubble]}>
        <Text style={styles.readerText}>{message.content}</Text>
      </View>
    );
  }
  return (
    <View style={styles.companionGroup}>
      <Text style={styles.speakerLabel}>
        {TOOL_LABELS[message.feature]
          ? `Companion · ${TOOL_LABELS[message.feature]}`
          : 'Companion'}
      </Text>
      <View
        style={[styles.bubble, styles.companionBubble, message.declined && styles.declinedBubble]}
      >
        <Text style={styles.companionText}>{message.content}</Text>
      </View>
      <View style={styles.metaRow}>
        {message.provenance ? (
          <View style={styles.provenanceChip}>
            <Text style={styles.provenanceText}>{PROVENANCE_LABELS[message.provenance]}</Text>
          </View>
        ) : null}
        {message.declined ? (
          <View style={[styles.provenanceChip, styles.declinedChip]}>
            <Ionicons name="shield-checkmark-outline" size={11} color={gold.deep} />
            <Text style={[styles.provenanceText, styles.declinedChipText]}>Spoiler held back</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  stateContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  stateText: { fontFamily: fonts.serif, color: colors.muted, fontSize: 15 },

  contextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  contextBook: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  boundaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  boundaryText: { fontFamily: fonts.serif, fontSize: 11, color: colors.muted },

  toolBarRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
    ...buttonShadow,
  },
  toolChipDisabled: { opacity: 0.5 },
  toolChipText: { fontFamily: fonts.serif, color: colors.text, fontSize: 12, fontWeight: '600' },

  snapshotCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    ...cardShadow,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snapshotTitle: {
    fontFamily: fonts.serif,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  snapshotBody: { fontFamily: fonts.serif, color: colors.muted, fontSize: 13, lineHeight: 18 },
  snapshotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: gold.fill,
    borderWidth: 1.5,
    borderColor: gold.deep,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
    ...buttonShadow,
  },
  snapshotButtonDisabled: { opacity: 0.5 },
  snapshotButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 14,
    fontWeight: '700',
  },

  listContent: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },

  bubble: {
    maxWidth: '86%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  readerBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentSoft,
    borderBottomRightRadius: 4,
  },
  readerText: { fontFamily: fonts.serif, color: colors.text, fontSize: 15, lineHeight: 21 },
  companionGroup: { alignSelf: 'flex-start', maxWidth: '92%', gap: 4 },
  speakerLabel: {
    fontFamily: fonts.serif,
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginLeft: 4,
  },
  companionBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
    ...cardShadow,
  },
  companionText: { fontFamily: fonts.serif, color: colors.text, fontSize: 15, lineHeight: 22 },
  declinedBubble: { borderColor: gold.base, backgroundColor: gold.glowSoft },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 4 },
  provenanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  provenanceText: { fontFamily: fonts.serif, fontSize: 10.5, color: colors.muted, fontWeight: '600' },
  declinedChip: { borderColor: gold.base, backgroundColor: gold.glowSoft },
  declinedChipText: { fontFamily: fonts.serif, color: gold.deep },

  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  thinkingText: { fontFamily: fonts.serif, color: colors.muted, fontSize: 14, fontStyle: 'italic' },

  introCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 12,
    gap: 10,
    ...cardShadow,
  },
  introTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  introBody: { fontFamily: fonts.serif, color: colors.muted, fontSize: 14, lineHeight: 21 },
  suggestionWrap: { gap: 8, marginTop: 2 },
  suggestionChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.card,
    ...buttonShadow,
  },
  suggestionText: { fontFamily: fonts.serif, color: colors.accent, fontSize: 13, fontWeight: '600' },

  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: { fontFamily: fonts.serif, flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 },
  errorBanner: { borderColor: colors.danger },
  errorText: { fontFamily: fonts.serif, color: colors.danger },

  // The composer anchors solidly to the bottom edge (D-054): card fill,
  // firm top border, and an upward shadow separating it from the chat.
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    elevation: 8,
    shadowColor: '#2a1c11',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
  },
  input: {
    fontFamily: fonts.serif,
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 21,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 11 : 8,
    paddingBottom: Platform.OS === 'ios' ? 11 : 8,
    fontSize: 15,
    color: colors.text,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: gold.fill,
    borderColor: gold.deep,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    ...buttonShadow,
  },
  sendButtonDisabled: { opacity: 0.35 },

  offerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
    justifyContent: 'center',
  },
  offerCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 12,
    alignItems: 'flex-start',
    ...cardShadow,
  },
  offerLockBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: gold.glowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  offerBody: { fontFamily: fonts.serif, color: colors.muted, fontSize: 14.5, lineHeight: 22 },
  offerPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: gold.glowSoft,
    borderWidth: 1,
    borderColor: gold.base,
  },
  offerPillText: { fontFamily: fonts.serif, color: gold.deep, fontSize: 12.5, fontWeight: '700' },
});
