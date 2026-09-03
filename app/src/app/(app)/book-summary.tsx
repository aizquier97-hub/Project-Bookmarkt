import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  CompanionRequestError,
  requestRangedRecap,
  type RecapDetail,
} from '@/domains/companion/api';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { buildBookmarkLabel, formatBookmarkCaption } from '@/domains/entries/display';
import { listEntries, type Entry } from '@/domains/entries/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { PremiumOffer } from '@/components/PremiumOffer';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { queryKeys } from '@/lib/queryKeys';
import { buttonShadow, cardShadow, colors, fonts, gold } from '@/lib/theme';

const DETAILS: { value: RecapDetail; label: string; hint: string }[] = [
  { value: 'brief', label: 'Brief', hint: 'A few sentences' },
  { value: 'standard', label: 'Standard', hint: 'A paragraph or two' },
  { value: 'detailed', label: 'Detailed', hint: 'The full account' },
];

/**
 * The gold bookmark's screen (Interface v2.0): pick any stretch of your own
 * bookmarks - first tap marks one end, second tap the other - choose how
 * much detail you want, and the companion retells that part of the story
 * from your entries alone, on premium paper.
 */
export default function BookSummaryScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;

  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });

  const screenTitle = <Stack.Screen options={{ title: 'The story so far' }} />;

  if (!validId) {
    return (
      <View style={styles.stateContainer}>
        {screenTitle}
        <Text style={styles.stateText}>This book link is not valid.</Text>
      </View>
    );
  }
  if (entitlementQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        {screenTitle}
        <LoadingState label="Checking your companion access…" />
      </View>
    );
  }
  if (entitlementQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        {screenTitle}
        <ErrorState
          error={entitlementQuery.error}
          fallback="Could not check your companion access."
          onRetry={() => void entitlementQuery.refetch()}
        />
      </View>
    );
  }
  if (!entitlementQuery.data.entitled) {
    return (
      <View style={styles.flex}>
        {screenTitle}
        <PremiumOffer
          title="The story so far"
          body="Choose any stretch of your bookmarks and the companion retells that part of the story from your own entries - as brief or as detailed as you like, never past your latest page."
        />
      </View>
    );
  }
  return <SummaryBuilder bookId={bookId} />;
}

function SummaryBuilder({ bookId }: { bookId: number }) {
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
  });
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);

  // Two-tap range: first tap marks one end, second the other; tapping a
  // marked row unmarks it. Order does not matter - the server sorts by date.
  const [selected, setSelected] = useState<number[]>([]);
  const [detail, setDetail] = useState<RecapDetail>('standard');
  const [story, setStory] = useState<{ content: string; boundaryLabel: string | null } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const storyMutation = useMutation({
    mutationFn: (range: { startEntryId: number; endEntryId: number }) =>
      requestRangedRecap(bookId, range.startEntryId, range.endEntryId, detail),
    onMutate: () => {
      setError(null);
      setStory(null);
    },
    onSuccess: (result) => {
      setStory({ content: result.reply.content, boundaryLabel: result.boundaryLabel });
      trackAnalyticsEvent('companion_tool_used', { tool: 'ranged_recap', status: 'succeeded', detail }, bookId);
    },
    onError: (err) => {
      const status = err instanceof CompanionRequestError ? err.code : 'error';
      trackAnalyticsEvent('companion_tool_used', { tool: 'ranged_recap', status }, bookId);
      setError(
        err instanceof CompanionRequestError
          ? err.message
          : 'The story could not be told just now. Please try again.',
      );
    },
  });

  const toggleEntry = (entryId: number) => {
    setSelected((prev) => {
      if (prev.includes(entryId)) {
        return prev.filter((id) => id !== entryId);
      }
      if (prev.length >= 2) {
        return [entryId];
      }
      return [...prev, entryId];
    });
  };

  const selectAll = () => {
    if (entries.length >= 2) {
      setSelected([entries[entries.length - 1].id, entries[0].id]);
    } else if (entries.length === 1) {
      setSelected([entries[0].id]);
    }
  };

  const canTell = selected.length >= 1 && !storyMutation.isPending;

  const tellStory = () => {
    if (selected.length === 0) {
      return;
    }
    const startEntryId = selected[0];
    const endEntryId = selected[1] ?? selected[0];
    storyMutation.mutate({ startEntryId, endEntryId });
  };

  const renderRow = ({ item: entry }: { item: Entry }) => {
    const isSelected = selected.includes(entry.id);
    return (
      <Pressable
        style={[styles.pickRow, isSelected && styles.pickRowSelected]}
        onPress={() => toggleEntry(entry.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`Bookmark: ${formatBookmarkCaption(entry) || 'entry'}`}
      >
        <Ionicons
          name={isSelected ? 'bookmark' : 'bookmark-outline'}
          size={16}
          color={isSelected ? gold.deep : colors.muted}
        />
        <View style={styles.pickRowBody}>
          <Text style={styles.pickRowLabel} numberOfLines={1}>
            {buildBookmarkLabel(entry).text || 'A blank bookmark'}
          </Text>
          <Text style={styles.pickRowCaption} numberOfLines={1}>
            {formatBookmarkCaption(entry)}
          </Text>
        </View>
      </Pressable>
    );
  };

  if (entriesQuery.isPending) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'The story so far' }} />
        <LoadingState label="Fetching your bookmarks…" />
      </View>
    );
  }
  if (entriesQuery.isError) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'The story so far' }} />
        <ErrorState
          error={entriesQuery.error}
          fallback="Could not load your bookmarks."
          onRetry={() => void entriesQuery.refetch()}
        />
      </View>
    );
  }
  if (entries.length === 0) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'The story so far' }} />
        <EmptyState message="No bookmarks yet. Once you log a few entries, the companion can retell any stretch of them here." />
      </View>
    );
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => String(entry.id)}
      renderItem={renderRow}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.rowGap} />}
      ListHeaderComponent={
        <View>
          <Stack.Screen options={{ title: 'The story so far' }} />
          {story ? (
            <View style={styles.storyPaper}>
              {story.boundaryLabel ? (
                <View style={styles.boundaryChip}>
                  <Text style={styles.boundaryChipText}>
                    Nothing past {story.boundaryLabel.toLowerCase()}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.storyText}>{story.content}</Text>
              <Pressable
                style={styles.ghostButton}
                onPress={() => setStory(null)}
                accessibilityRole="button"
                accessibilityLabel="Clear the story and pick another stretch"
              >
                <Text style={styles.ghostButtonText}>Tell another stretch</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.intro}>
              Mark where the stretch begins and ends - tap one bookmark for each. The companion
              retells only what you recorded between them.
            </Text>
          )}

          <View style={styles.detailRow}>
            {DETAILS.map((option) => {
              const active = detail === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.detailChip, active && styles.detailChipActive]}
                  onPress={() => setDetail(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${option.label}: ${option.hint}`}
                >
                  <Text style={[styles.detailChipText, active && styles.detailChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.goldButton, !canTell && styles.goldButtonDisabled]}
              onPress={tellStory}
              disabled={!canTell}
              accessibilityRole="button"
              accessibilityLabel="Tell the story of the marked stretch"
            >
              {storyMutation.isPending ? (
                <ActivityIndicator size="small" color={gold.onFill} />
              ) : (
                <>
                  <Ionicons name="book-outline" size={15} color={gold.onFill} />
                  <Text style={styles.goldButtonText}>
                    {selected.length === 1 ? 'Tell this moment' : 'Tell the story'}
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={styles.ghostButton}
              onPress={selectAll}
              accessibilityRole="button"
              accessibilityLabel="Select everything so far"
            >
              <Text style={styles.ghostButtonText}>All so far</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.pickHeading}>Your bookmarks, newest first</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stateContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  stateText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  intro: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  storyPaper: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: gold.base,
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    gap: 12,
    ...cardShadow,
  },
  boundaryChip: {
    alignSelf: 'flex-start',
    backgroundColor: gold.glowSoft,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  boundaryChipText: {
    fontFamily: fonts.serif,
    color: gold.deep,
    fontSize: 11,
    fontWeight: '700',
  },
  storyText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 16,
    lineHeight: 25,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  detailChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  detailChipActive: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  detailChipText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  detailChipTextActive: {
    color: gold.onFill,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  goldButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: gold.fill,
    borderWidth: 1.5,
    borderColor: gold.deep,
    borderRadius: 10,
    paddingVertical: 11,
    ...buttonShadow,
  },
  goldButtonDisabled: {
    opacity: 0.5,
  },
  goldButtonText: {
    fontFamily: fonts.serif,
    color: gold.onFill,
    fontSize: 14,
    fontWeight: '700',
  },
  ghostButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  ghostButtonText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  pickHeading: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  pickRowSelected: {
    borderColor: gold.deep,
    borderWidth: 1.5,
    backgroundColor: gold.glowSoft,
  },
  pickRowBody: {
    flex: 1,
  },
  pickRowLabel: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 13,
  },
  pickRowCaption: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    marginTop: 1,
  },
  rowGap: {
    height: 8,
  },
  error: {
    fontFamily: fonts.serif,
    color: colors.danger,
    fontSize: 13,
    marginBottom: 10,
  },
});
