import AsyncStorage from '@react-native-async-storage/async-storage';
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
  ScrollView,
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
  runCompanionTool,
  sendCompanionMessage,
  type CompanionChatMessage,
  type CompanionProvenance,
  type CompanionToolFeature,
  type WordBankLevel,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { getBook } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { queryKeys } from '@/lib/queryKeys';
import { cardShadow, colors, fonts, gold } from '@/lib/theme';

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

// The companion's study tools (D-039 premium feature set). Each runs once
// per tap and posts its result into the conversation.
const TOOLS: { key: CompanionToolFeature; label: string; icon: 'albums-outline' | 'help-circle-outline' | 'people-outline' | 'book-outline' }[] = [
  { key: 'cue_cards', label: 'Cue cards', icon: 'albums-outline' },
  { key: 'quiz', label: 'Quiz me', icon: 'help-circle-outline' },
  { key: 'club_prep', label: 'Club prep', icon: 'people-outline' },
  { key: 'word_bank', label: 'Word bank', icon: 'book-outline' },
];

const TOOL_LABELS: Record<string, string> = {
  cue_cards: 'Cue cards',
  quiz: 'Character quiz',
  club_prep: 'Book-club prep',
  word_bank: 'Word bank',
};

const WORD_BANK_LEVEL_KEY = 'companion_word_bank_level';
const WORD_BANK_LEVELS: { key: WordBankLevel; label: string; hint: string }[] = [
  { key: 'simple', label: 'Approachable', hint: 'everyday words, a step up' },
  { key: 'standard', label: 'Standard', hint: 'solid words worth keeping' },
  { key: 'scholarly', label: 'Scholarly', hint: 'rare and precise' },
];

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
        <Stack.Screen options={{ title: 'Companion' }} />
        <Text style={styles.stateText}>This book link is not valid.</Text>
      </View>
    );
  }
  if (entitlementQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Companion' }} />
        <LoadingState label="Checking your companion access…" />
      </View>
    );
  }
  if (entitlementQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Companion' }} />
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
      <Stack.Screen options={{ title: 'Companion' }} />
      <View style={styles.offerCard}>
        <View style={styles.offerLockBadge}>
          <Ionicons name="lock-closed" size={18} color={gold.deep} />
        </View>
        <Text style={styles.offerTitle}>The reading companion</Text>
        <Text style={styles.offerBody}>
          A thoughtful conversation partner for every book on your shelf. It reads only your own
          notes, never spoils past your latest entry, and always shows whether an answer came from
          your notes or its general knowledge.
        </Text>
        <Text style={styles.offerBody}>
          The companion is part of the paid plan. Subscriptions are coming soon — your notes and
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

  // Study tools post their result straight into the conversation. The word
  // bank remembers the reader's chosen level after a one-time first pick.
  const [levelPickerOpen, setLevelPickerOpen] = useState(false);
  const toolMutation = useMutation({
    mutationFn: ({ tool, level }: { tool: CompanionToolFeature; level?: WordBankLevel }) =>
      runCompanionTool(bookId, tool, level),
    onMutate: () => {
      setSendError(null);
      setQuotaNotice(null);
    },
    onSuccess: (result, variables) => {
      if (result.boundaryLabel) {
        setLatestBoundary(result.boundaryLabel);
      }
      if (result.messages.length > 0) {
        queryClient.setQueryData<CompanionChatMessage[]>(
          queryKeys.companionMessages(bookId),
          (old) => [...(old ?? []), ...result.messages],
        );
      } else if (result.reply.content) {
        // Empty-context short-circuits (NO_ENTRIES / NO_CHARACTERS) are not
        // persisted; show the companion's line as a notice instead.
        setQuotaNotice(result.reply.content);
      }
      trackAnalyticsEvent('companion_tool_used', { tool: variables.tool, status: 'succeeded' }, bookId);
    },
    onError: (err, variables) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: variables.tool, status }, bookId);
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

  const busy = sendMutation.isPending || toolMutation.isPending;
  const handleTool = (tool: CompanionToolFeature) => {
    if (busy) {
      return;
    }
    if (tool !== 'word_bank') {
      toolMutation.mutate({ tool });
      return;
    }
    void AsyncStorage.getItem(WORD_BANK_LEVEL_KEY).then((stored) => {
      const level = WORD_BANK_LEVELS.find((l) => l.key === stored)?.key;
      if (level) {
        toolMutation.mutate({ tool: 'word_bank', level });
      } else {
        setLevelPickerOpen(true);
      }
    });
  };
  const handleLevelPick = (level: WordBankLevel) => {
    setLevelPickerOpen(false);
    void AsyncStorage.setItem(WORD_BANK_LEVEL_KEY, level);
    toolMutation.mutate({ tool: 'word_bank', level });
  };

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
        <Stack.Screen options={{ title: 'Companion' }} />
        <LoadingState label="Opening your conversation…" />
      </View>
    );
  }
  if (messagesQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Companion' }} />
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
      <Stack.Screen options={{ title: 'Companion' }} />
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
                {toolMutation.isPending ? 'Preparing…' : 'Consulting your notes…'}
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

      {levelPickerOpen ? (
        <View style={styles.levelCard}>
          <Text style={styles.levelTitle}>How do you like your words?</Text>
          <Text style={styles.levelBody}>
            A one-time choice for the word bank — it also adapts to each book&apos;s genre. You can
            change it by asking the companion.
          </Text>
          <View style={styles.levelRow}>
            {WORD_BANK_LEVELS.map((level) => (
              <Pressable
                key={level.key}
                style={styles.levelChip}
                onPress={() => handleLevelPick(level.key)}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${level.label}: ${level.hint}`}
              >
                <Text style={styles.levelChipLabel}>{level.label}</Text>
                <Text style={styles.levelChipHint}>{level.hint}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.toolBar}
        contentContainerStyle={styles.toolBarContent}
        keyboardShouldPersistTaps="handled"
      >
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.key}
            style={[styles.toolChip, busy && styles.toolChipDisabled]}
            onPress={() => handleTool(tool.key)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={tool.label}
          >
            <Ionicons name={tool.icon} size={13} color={colors.accent} />
            <Text style={styles.toolChipText}>{tool.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

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
          <Ionicons name="arrow-up" size={18} color="#ffffff" />
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
  stateText: { color: colors.muted, fontSize: 15 },

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
  boundaryText: { fontSize: 11, color: colors.muted },

  toolBar: { flexGrow: 0 },
  toolBarContent: {
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  toolChipDisabled: { opacity: 0.5 },
  toolChipText: { color: colors.text, fontSize: 12, fontWeight: '600' },

  levelCard: {
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
  levelTitle: {
    fontFamily: fonts.serif,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  levelBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  levelRow: { flexDirection: 'row', gap: 8 },
  levelChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  levelChipLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  levelChipHint: { color: colors.muted, fontSize: 10, textAlign: 'center' },

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
  readerText: { color: colors.text, fontSize: 15, lineHeight: 21 },
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
  companionText: { color: colors.text, fontSize: 15, lineHeight: 22 },
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
  provenanceText: { fontSize: 10.5, color: colors.muted, fontWeight: '600' },
  declinedChip: { borderColor: gold.base, backgroundColor: gold.glowSoft },
  declinedChipText: { color: gold.deep },

  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  thinkingText: { color: colors.muted, fontSize: 14, fontStyle: 'italic' },

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
  introBody: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  suggestionWrap: { gap: 8, marginTop: 2 },
  suggestionChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.background,
  },
  suggestionText: { color: colors.accent, fontSize: 13, fontWeight: '600' },

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
  noticeText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 18 },
  errorBanner: { borderColor: colors.danger },
  errorText: { color: colors.danger },

  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 21,
    backgroundColor: colors.card,
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
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
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
  offerBody: { color: colors.muted, fontSize: 14.5, lineHeight: 22 },
  offerPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: gold.glowSoft,
    borderWidth: 1,
    borderColor: gold.base,
  },
  offerPillText: { color: gold.deep, fontSize: 12.5, fontWeight: '700' },
});
