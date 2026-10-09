import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image as CoverImage } from 'expo-image';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BookClubCard } from '@/components/book/BookClubCard';
import { TrophyStrip } from '@/components/TrophyStrip';
import { useToast } from '@/components/toast';
import { Button, HeaderAction, SectionLabel, StickyFooter } from '@/components/ui';
import { listCharacters } from '@/domains/characters/service';
import { fetchCompanionEntitlement } from '@/domains/companion/entitlement';
import { getCurrentPosition } from '@/domains/entries/display';
import { listEntries } from '@/domains/entries/service';
import { describeDifficultySource, difficultyLabel } from '@/domains/fitness/difficulty';
import { collectQuoteTextsByBook, difficultyForBook, furthestPage } from '@/domains/fitness/model';
import { listReadingSessions } from '@/domains/fitness/service';
import { computeTrophyProgress } from '@/domains/fitness/trophies';
import { listBookImages } from '@/domains/library/images';
import { getBook, setBookFinished } from '@/domains/library/service';
import { trackAnalyticsEvent } from '@/domains/reporting/analytics';
import { queryKeys } from '@/lib/queryKeys';
import { formatRelativeTime } from '@/lib/relativeTime';
import { cardShadow, colors, fonts, gold, radii, spacing } from '@/lib/theme';

type SectionTab = 'entries' | 'characters' | 'photos';

/**
 * The book hub (D-093, after the Figma "Book detail · Book hub" screen):
 * hero, gold progress bar, the Book Club recap card, and three rows into
 * the book's own screens - Journal, Characters, Photos. The sticky footer
 * starts a reading session; Edit stays in the header.
 */
export default function BookScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);
  const validId = Number.isInteger(bookId) && bookId > 0;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

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
  const entriesQuery = useQuery({
    queryKey: queryKeys.entries(bookId),
    queryFn: () => listEntries(bookId),
    enabled: validId,
  });
  const imagesQuery = useQuery({
    queryKey: queryKeys.bookImages(bookId),
    queryFn: () => listBookImages(bookId),
    enabled: validId,
  });
  // Sandglass sessions (D-062) share the Profile tab's cache; this book's
  // rows push its furthest page and trophy pieces forward.
  const sessionsQuery = useQuery({
    queryKey: queryKeys.readingSessions,
    queryFn: listReadingSessions,
    enabled: validId,
  });
  const entitlementQuery = useQuery({
    queryKey: queryKeys.companionEntitlement,
    queryFn: fetchCompanionEntitlement,
    staleTime: 60_000,
  });
  const companionEntitled = entitlementQuery.data?.entitled === true;

  // Finishing a book is the roadmap's primary outcome - celebrate it, and
  // let an accidental tap be undone without ceremony.
  const finishMutation = useMutation({
    mutationFn: (finished: boolean) => setBookFinished(bookId, finished),
    onSuccess: (updated, finished) => {
      queryClient.setQueryData(queryKeys.book(bookId), updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.books });
      if (finished) {
        showToast('🎉 Book finished! It now shines in gold on your shelf.');
      }
    },
  });

  const book = bookQuery.data;
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const bookSessions = useMemo(
    () => (sessionsQuery.data ?? []).filter((session) => session.topic_id === bookId),
    [sessionsQuery.data, bookId],
  );
  const difficulty = useMemo(
    () =>
      book ? difficultyForBook(book, collectQuoteTextsByBook(entries).get(book.id) ?? []) : null,
    [book, entries],
  );
  const trophy = useMemo(
    () =>
      book
        ? computeTrophyProgress({
            totalPages: book.total_pages,
            currentPage: furthestPage(entries, bookSessions),
            finished: Boolean(book.finished_at),
          })
        : null,
    [book, entries, bookSessions],
  );

  if (!validId) {
    return (
      <View style={styles.invalid}>
        <Text style={styles.error}>This book link is not valid.</Text>
      </View>
    );
  }

  const currentPosition = getCurrentPosition(entries);
  const lastEntryRelative = formatRelativeTime(entries[0]?.created_at);
  const progressPercent =
    currentPosition && currentPosition.progressType !== 'chapter' && book?.total_pages
      ? Math.min(100, Math.max(0, Math.round((currentPosition.upper / book.total_pages) * 100)))
      : null;
  const positionLabel = currentPosition
    ? `${currentPosition.progressType === 'chapter' ? 'Chapter' : 'Page'} ${currentPosition.upper}`
    : null;

  // Which section readers open (D-087): book_tab_viewed keeps its name so
  // the series reads continuously across the tab → hub change.
  const openSection = (tab: SectionTab) => {
    trackAnalyticsEvent(
      'book_tab_viewed',
      {
        tab,
        entries: entriesQuery.data?.length ?? null,
        characters: charactersQuery.data?.length ?? null,
      },
      bookId,
    );
    const pathname =
      tab === 'entries' ? '/book-journal' : tab === 'characters' ? '/book-characters' : '/book-photos';
    router.push({ pathname, params: { id: String(bookId) } });
  };

  const entryCount = entriesQuery.data?.length;
  const characterCount = charactersQuery.data?.length;
  const photoCount = imagesQuery.data?.length;

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: 'Book',
          headerBackTitle: 'Library',
          headerRight: () => (
            <Link href={{ pathname: '/edit-book', params: { id: String(bookId) } }} asChild>
              <HeaderAction label="Edit" onPress={() => undefined} accessibilityLabel="Edit book details" />
            </Link>
          ),
        }}
      />
      <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
        <View style={styles.heroRow}>
          {book?.cover_url ? (
            <CoverImage
              source={{ uri: book.cover_url }}
              style={styles.cover}
              contentFit="cover"
              accessibilityLabel={`Cover of ${book.name}`}
            />
          ) : (
            <View style={[styles.cover, styles.coverEmpty]} />
          )}
          <View style={styles.heroInfo}>
            {book ? (
              <Text style={styles.title} accessibilityRole="header">
                {book.name}
              </Text>
            ) : null}
            {book?.author ? <Text style={styles.meta}>{book.author}</Text> : null}
            {book?.total_pages ? <Text style={styles.meta}>{book.total_pages} pages</Text> : null}
            {difficulty ? (
              <View style={styles.difficultyRow}>
                <View style={styles.difficultyChip}>
                  <Text style={styles.difficultyChipText}>
                    {difficultyLabel(difficulty.score)} · {difficulty.score}/10
                  </Text>
                </View>
                <Text style={styles.difficultyMeta} numberOfLines={1}>
                  {describeDifficultySource(difficulty)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {positionLabel ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>{positionLabel}</Text>
              {progressPercent !== null ? (
                <Text style={styles.progressText}>{progressPercent}% read</Text>
              ) : null}
            </View>
            {progressPercent !== null ? (
              <View
                style={styles.progressTrack}
                accessible
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
              >
                <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
              </View>
            ) : null}
          </View>
        ) : null}

        {trophy ? (
          <View style={styles.trophyRow}>
            <TrophyStrip progress={trophy} compact />
          </View>
        ) : null}

        {/* The recap card (Interface v2.0 → D-093): the one premium surface
            on the hub. Either state opens the story-so-far screen, which
            handles the unentitled case itself. */}
        {entries.length > 0 ? (
          <View style={styles.clubCardWrap}>
            <BookClubCard
              title="The story thus far"
              body="An AI summary of your last entries."
              entitled={companionEntitled}
              openLabel="Read the recap"
              lockedNote="Your notes only · No spoilers"
              onPress={() =>
                router.push({ pathname: '/book-summary', params: { id: String(bookId) } })
              }
            />
          </View>
        ) : null}

        <SectionLabel style={styles.sectionLabel}>Inside this book</SectionLabel>
        <View style={styles.rows}>
          <HubRow
            title="Journal"
            subtitle={
              lastEntryRelative
                ? `Last entry ${lastEntryRelative}`
                : 'One line about where you are is a perfect start'
            }
            count={entryCount}
            onPress={() => openSection('entries')}
          />
          <HubRow
            title="Characters"
            subtitle="Your cast, kept close"
            count={characterCount}
            onPress={() => openSection('characters')}
          />
          <HubRow
            title="Photos"
            subtitle="Your visual bookmarks"
            count={photoCount}
            onPress={() => openSection('photos')}
            last
          />
        </View>

        {book ? (
          book.finished_at ? (
            <Pressable
              style={[styles.finishButton, styles.finishButtonDone]}
              onPress={() => finishMutation.mutate(false)}
              disabled={finishMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Finished. Tap to mark as still reading"
            >
              <Ionicons name="trophy" size={14} color={gold.onFill} />
              <Text style={styles.finishTextDone}>
                Finished {new Date(book.finished_at).toLocaleDateString()} · undo
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.finishButton}
              onPress={() => finishMutation.mutate(true)}
              disabled={finishMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Mark this book as finished"
            >
              <Ionicons name="flag-outline" size={16} color={colors.accent} />
              <Text style={styles.finishText}>Mark as finished</Text>
            </Pressable>
          )
        ) : null}
        {finishMutation.isError ? (
          <Text style={styles.error}>
            {finishMutation.error instanceof Error
              ? finishMutation.error.message
              : 'Could not update the book.'}
          </Text>
        ) : null}
        {bookQuery.isError ? (
          <Text style={styles.error}>
            {bookQuery.error instanceof Error ? bookQuery.error.message : 'Could not load the book.'}
          </Text>
        ) : null}
      </ScrollView>

      {book && !book.finished_at ? (
        <StickyFooter>
          <Button
            label="Start a reading session"
            icon="create-outline"
            onPress={() => router.push({ pathname: '/reading-timer', params: { id: String(bookId) } })}
            accessibilityLabel="Start a timed reading session with this book"
          />
        </StickyFooter>
      ) : null}
    </View>
  );
}

function HubRow({
  title,
  subtitle,
  count,
  onPress,
  last,
}: {
  title: string;
  subtitle: string;
  count: number | undefined;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${count !== undefined ? `, ${count}` : ''}. ${subtitle}`}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {count !== undefined ? <Text style={styles.rowCount}>{count}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  invalid: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cover: {
    width: 72,
    height: 108,
    borderRadius: 6,
    backgroundColor: colors.surface2,
    ...cardShadow,
  },
  coverEmpty: { borderWidth: 1, borderColor: colors.border },
  heroInfo: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.serif, fontSize: 25, lineHeight: 32, color: colors.text },
  meta: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted },
  difficultyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  difficultyChip: {
    borderRadius: radii.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.accentSoft,
  },
  difficultyChipText: { fontFamily: fonts.sansSemiBold, fontSize: 11, color: colors.accent },
  difficultyMeta: { flex: 1, fontFamily: fonts.sans, fontSize: 11, color: colors.muted },
  progressBlock: { marginTop: spacing.lg, gap: spacing.sm },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surface2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: gold.base },
  trophyRow: { marginTop: spacing.md },
  clubCardWrap: { marginTop: spacing.lg },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.xs },
  rows: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  rowPressed: { opacity: 0.7 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 28, color: colors.text },
  rowSubtitle: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted },
  rowCount: { fontFamily: fonts.serif, fontSize: 20, color: colors.text },
  // Status pill (kept from the tab-era hero; not in the Figma hub - flagged).
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  finishButtonDone: { backgroundColor: gold.fill, borderColor: gold.fill },
  finishText: { fontFamily: fonts.sansSemiBold, color: colors.accent, fontSize: 14 },
  finishTextDone: { fontFamily: fonts.sansSemiBold, color: gold.onFill, fontSize: 14 },
  error: { fontFamily: fonts.sans, color: colors.danger, marginTop: spacing.sm },
});
