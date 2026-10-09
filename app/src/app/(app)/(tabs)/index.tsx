import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { comprehensionPercent, describeComprehensionGrade } from '@/domains/fitness/activity';
import { describeDifficultySource, difficultyLabel } from '@/domains/fitness/difficulty';
import {
  describeFitnessTrend,
  FITNESS_TIME_CONSTANT,
  type FitnessRange,
} from '@/domains/fitness/fitness';
import type { BookFitness, ReadingModel, TrophyGroup } from '@/domains/fitness/model';
import { MAX_CONSECUTIVE_FREEZES, type StreakResult } from '@/domains/fitness/streaks';
import { TROPHY_SEGMENTS } from '@/domains/fitness/trophies';
import { useReadingModel } from '@/domains/fitness/useReadingModel';
import type { Book } from '@/domains/library/service';
import { AreaChart } from '@/components/charts/AreaChart';
import { BarChart } from '@/components/charts/BarChart';
import { Heatmap } from '@/components/charts/Heatmap';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { TrophyStrip } from '@/components/TrophyStrip';
import { HeaderAction, SegmentedControl } from '@/components/ui';
import { buttonShadow, cardShadow, colors, fonts, gold, radii, sizes, spacing } from '@/lib/theme';

const RANGES: FitnessRange[] = ['1M', '3M', '6M', '1Y'];
const RANGE_LABELS: Record<FitnessRange, string> = {
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  '1Y': '1 year',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Pieces-in-progress rows shown before the reader expands the list. */
const IN_PROGRESS_PREVIEW = 4;

/**
 * The Profile tab (D-062, home since D-064): the reader's Strava-style
 * profile and the first screen after sign-in. Reading Fitness up top, weekly
 * volume, streak and Reading Current freezes, the pace / endurance /
 * consistency grid, the reading-days calendar, the trophy case shelved by
 * difficulty, and one row per book. Every number is computed on-device from
 * the entries and Sandglass sessions the reader already logs.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const query = useReadingModel();
  const [range, setRange] = useState<FitnessRange>('3M');

  if (query.isPending) {
    return (
      <View style={styles.stateContainer}>
        <LoadingState label="Tallying your reading…" />
      </View>
    );
  }
  if (query.isError || !query.model) {
    return (
      <View style={styles.stateContainer}>
        <ErrorState
          error={query.error}
          fallback="Could not load your profile."
          onRetry={() => void query.refetch()}
        />
      </View>
    );
  }

  const model = query.model;
  const trend = describeFitnessTrend(model.series, range);
  const hasAnyActivity = model.activity.length > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <Tabs.Screen
        options={{
          headerRight: () => (
            <HeaderAction
              label="Calendar"
              accessibilityLabel="Open the reading calendar"
              onPress={() => router.push('/reading-calendar')}
            />
          ),
        }}
      />
      <StreakCard streak={model.streak} />

      <Pressable
        style={({ pressed }) => [styles.timerButton, pressed && styles.pressed]}
        onPress={() => router.push('/reading-timer')}
        accessibilityRole="button"
        accessibilityLabel="Start a reading session"
      >
        <Ionicons name="hourglass-outline" size={20} color={colors.onAccent} />
        <Text style={styles.timerButtonText}>Start a reading session</Text>
      </Pressable>

      {!hasAnyActivity ? (
        <View style={styles.card}>
          <EmptyState message="Log a bookmark or turn the glass on a reading session and your fitness, volume, and streak start here." />
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Reading fitness</Text>
          <View style={styles.rangeBadge}>
            <Text style={styles.rangeBadgeText}>{RANGE_LABELS[range]}</Text>
          </View>
        </View>
        <SegmentedControl
          value={range}
          onChange={setRange}
          options={RANGES.map((option) => ({ value: option, label: option }))}
        />
        <View style={styles.heroRow}>
          <Text style={styles.heroValue}>{formatFitness(trend.current)}</Text>
          <Text
            style={[
              styles.heroDelta,
              trend.percentChange !== null && trend.percentChange < 0 && styles.heroDeltaDown,
            ]}
          >
            {trend.percentChange === null
              ? 'building a baseline'
              : `${trend.percentChange >= 0 ? '+' : ''}${trend.percentChange}% over ${range}`}
          </Text>
        </View>
        <AreaChart
          points={trend.points.map((point) => ({ value: point.fitness }))}
          height={150}
          startLabel={trend.points.length ? monthLabel(trend.points[0].day) : undefined}
          endLabel="Today"
          accessibilityLabel={`Reading fitness ${formatFitness(trend.current)} over ${range}`}
        />
        <Text style={styles.cardFootnote}>
          A {FITNESS_TIME_CONSTANT}-day rolling average of daily Session Effort: pages x difficulty
          weight x comprehension factor. Read a little most days and it climbs.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Volume</Text>
          <Text style={styles.cardMeta}>last 12 weeks</Text>
        </View>
        <View style={styles.heroRow}>
          <Text style={styles.heroValue}>{model.volume.thisWeek}</Text>
          <Text style={styles.heroUnit}>pages this week</Text>
        </View>
        <Text
          style={[
            styles.volumeDelta,
            model.volume.percentChange !== null &&
              model.volume.percentChange < 0 &&
              styles.heroDeltaDown,
          ]}
        >
          {model.volume.percentChange === null
            ? model.volume.baseline === null
              ? 'Your first weeks set the baseline.'
              : 'Nothing to compare with yet.'
            : `${model.volume.percentChange >= 0 ? '+' : ''}${model.volume.percentChange}% vs your 4-week average (${model.volume.baseline} pages)`}
        </Text>
        <BarChart
          bars={model.weekly.map((week, index) => ({
            label: weekLabel(week.weekStart),
            value: week.pages,
            highlight: index === model.weekly.length - 1,
          }))}
          height={110}
          formatValue={(value) => `${value} pages`}
          accessibilityLabel="Pages read per week"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>This month’s shape</Text>
        <View style={styles.metricGrid}>
          <Metric
            label="Pace"
            value={
              model.summary.pacePagesPerMinute !== null
                ? String(model.summary.pacePagesPerMinute)
                : '-'
            }
            unit="pages / min"
            hint="timed sessions"
          />
          <Metric
            label="Endurance"
            value={model.summary.enduranceMinutes !== null ? String(model.summary.enduranceMinutes) : '-'}
            unit="min / sitting"
            hint="average session"
          />
          <Metric
            label="Consistency"
            value={String(model.summary.consistencyDaysPerWeek)}
            unit="days / week"
            hint="last 28 days"
          />
          <Metric
            label="Difficulty"
            value={
              model.summary.averageDifficulty !== null ? String(model.summary.averageDifficulty) : '-'
            }
            unit={
              model.summary.averageDifficulty !== null
                ? difficultyLabel(model.summary.averageDifficulty)
                : 'of 10'
            }
            hint="pages-weighted"
          />
          <Metric
            label="Comprehension"
            value={
              model.summary.averageComprehension !== null
                ? `${comprehensionPercent(model.summary.averageComprehension)}%`
                : '-'
            }
            unit={
              model.summary.averageComprehension !== null
                ? comprehensionWord(model.summary.averageComprehension)
                : 'of 100'
            }
            hint="notes & reflections"
          />
          <Metric
            label="Pages"
            value={String(model.summary.pagesLast28Days)}
            unit={`${Math.round(model.summary.minutesLast28Days)} timed min`}
            hint="last 28 days"
          />
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => router.push('/reading-calendar')}
        accessibilityRole="button"
        accessibilityLabel="Open the reading calendar"
        accessibilityHint="Shows every month with the days you read"
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Reading days</Text>
          <View style={styles.cardLink}>
            <Text style={styles.cardMeta}>{model.summary.totalReadDays} total</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </View>
        </View>
        <Heatmap cells={model.heatmap} accessibilityLabel="Reading days over the last 16 weeks" />
        <Text style={styles.cardFootnote}>Tap for the full calendar, month by month.</Text>
      </Pressable>

      <TrophyCase model={model} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>By book</Text>
        {model.books.length === 0 ? (
          <Text style={styles.cardBody}>Your library is empty.</Text>
        ) : (
          sortBooks(model.books).map((item) => (
            <BookRow
              key={item.book.id}
              item={item}
              onPress={() =>
                router.push({ pathname: '/book/[id]', params: { id: String(item.book.id) } })
              }
            />
          ))
        )}
      </View>

      <Explainer model={model} />
    </ScrollView>
  );
}

function StreakCard({ streak }: { streak: StreakResult }) {
  const flameColor =
    streak.state === 'active' ? gold.base : streak.state === 'none' ? colors.border : colors.muted;
  const message =
    streak.state === 'active'
      ? 'Read today. The streak holds.'
      : streak.state === 'frozen'
        ? 'Reading Current: today is covered by time with your companion. Read to keep it burning.'
        : streak.state === 'at_risk'
          ? 'Nothing logged yet today - a page or a session keeps the streak alive.'
          : 'Log a bookmark or a session to start a streak.';
  return (
    <View style={[styles.card, styles.streakCard]}>
      <View style={styles.streakFlame}>
        <Ionicons name="flame" size={34} color={flameColor} />
      </View>
      <View style={styles.flex}>
        <View style={styles.streakHeader}>
          <Text style={styles.streakValue}>
            {streak.current} day streak
          </Text>
          {streak.state === 'frozen' ? (
            <View style={styles.frozenBadge}>
              <Ionicons name="snow-outline" size={12} color={colors.accent} />
              <Text style={styles.frozenText}>frozen</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.streakMessage}>{message}</Text>
        <Text style={styles.streakMeta}>
          Longest {streak.longest} {streak.longest === 1 ? 'day' : 'days'}
          {streak.freezesUsed > 0
            ? ` · ${streak.freezesUsed} of ${MAX_CONSECUTIVE_FREEZES} consecutive freezes used`
            : ''}
        </Text>
      </View>
    </View>
  );
}

function Metric({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  hint: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricUnit}>{unit}</Text>
      <Text style={styles.metricHint}>{hint}</Text>
    </View>
  );
}

/**
 * The trophy case shelved by difficulty (D-064): one tile per band with its
 * count; tap a shelf to see the books on it. Below, "Pieces in progress"
 * previews a few part-built trophies and expands to every book being read.
 */
function TrophyCase({ model }: { model: ReadingModel<Book> }) {
  const router = useRouter();
  const [openShelf, setOpenShelf] = useState<TrophyGroup<Book>['label'] | null>(null);
  const [showAllInProgress, setShowAllInProgress] = useState(false);
  const total = model.trophyCase.length;
  const shelf = openShelf ? model.trophyGroups.find((group) => group.label === openShelf) ?? null : null;
  const inProgressRows = showAllInProgress
    ? model.booksInProgress
    : model.trophiesInProgress.slice(0, IN_PROGRESS_PREVIEW);
  const inProgressTotal = model.booksInProgress.length;
  const openBook = (id: number) => router.push({ pathname: '/book/[id]', params: { id: String(id) } });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Trophy case</Text>
        <Text style={styles.cardMeta}>
          {total} {total === 1 ? 'trophy' : 'trophies'}
        </Text>
      </View>
      {total === 0 ? (
        <Text style={styles.cardBody}>
          Every book with a page count is cut into {TROPHY_SEGMENTS} segments. Cross a quarter,
          earn a piece; finish the book, the trophy goes on the shelf for its difficulty.
        </Text>
      ) : (
        <View style={styles.trophyGrid}>
          {model.trophyGroups.map((group) => {
            const count = group.items.length;
            const open = group.label === openShelf;
            return (
              <Pressable
                key={group.label}
                style={({ pressed }) => [
                  styles.trophyTile,
                  count === 0 && styles.trophyTileEmpty,
                  open && styles.trophyTileOpen,
                  pressed && count > 0 && styles.pressed,
                ]}
                onPress={() => setOpenShelf((value) => (value === group.label ? null : group.label))}
                disabled={count === 0}
                accessibilityRole="button"
                accessibilityState={{ expanded: open, disabled: count === 0 }}
                accessibilityLabel={`${count} ${group.label} ${count === 1 ? 'trophy' : 'trophies'}`}
              >
                <View style={styles.trophyTileTop}>
                  <Ionicons name="trophy" size={24} color={count > 0 ? gold.base : colors.border} />
                  <Text style={[styles.trophyCount, count === 0 && styles.trophyCountEmpty]}>
                    {count}×
                  </Text>
                </View>
                <Text style={styles.trophyTitle}>{group.label}</Text>
                <Text style={styles.trophyRange}>difficulty {group.range}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {shelf && shelf.items.length > 0 ? (
        <View style={styles.shelf}>
          <Text style={styles.subheading}>
            {shelf.label} shelf - {shelf.items.length} {shelf.items.length === 1 ? 'book' : 'books'}
          </Text>
          {shelf.items.map((item) => (
            <Pressable
              key={item.book.id}
              style={({ pressed }) => [styles.shelfRow, pressed && styles.pressed]}
              onPress={() => openBook(item.book.id)}
              accessibilityRole="button"
              accessibilityLabel={`${item.book.name}, difficulty ${item.difficulty.score} of 10`}
            >
              <Ionicons name="trophy" size={18} color={gold.base} />
              <View style={styles.flex}>
                <Text style={styles.shelfTitle} numberOfLines={1}>
                  {item.book.name}
                </Text>
                <Text style={styles.bookMeta}>
                  {item.book.author ? `${item.book.author} - ` : ''}
                  {item.difficulty.score}/10
                  {item.book.finished_at ? ` - finished ${monthDayLabel(item.book.finished_at)}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {inProgressTotal > 0 ? (
        <View style={styles.inProgress}>
          <Pressable
            style={styles.inProgressHeader}
            onPress={() => setShowAllInProgress((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAllInProgress }}
            accessibilityLabel={
              showAllInProgress
                ? 'Show only trophies in progress'
                : `Show all ${inProgressTotal} books being read`
            }
          >
            <Text style={styles.subheading}>
              {showAllInProgress ? `Being read - ${inProgressTotal}` : 'Pieces in progress'}
            </Text>
            <View style={styles.cardLink}>
              <Text style={styles.cardMeta}>
                {showAllInProgress ? 'Pieces only' : `All ${inProgressTotal} being read`}
              </Text>
              <Ionicons
                name={showAllInProgress ? 'chevron-up' : 'chevron-forward'}
                size={16}
                color={colors.muted}
              />
            </View>
          </Pressable>
          {inProgressRows.length === 0 ? (
            <Text style={styles.cardBody}>
              No pieces yet - cross the first quarter of a book to start a trophy.
            </Text>
          ) : (
            inProgressRows.map((item) => (
              <Pressable
                key={item.book.id}
                style={({ pressed }) => [styles.inProgressRow, pressed && styles.pressed]}
                onPress={() => openBook(item.book.id)}
                accessibilityRole="button"
                accessibilityLabel={`${item.book.name}, ${item.trophy.unlockedCount} of ${TROPHY_SEGMENTS} pieces`}
              >
                <View style={styles.inProgressTitleRow}>
                  <Text style={styles.inProgressTitle} numberOfLines={1}>
                    {item.book.name}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {item.trophy.eligible
                      ? `${item.trophy.unlockedCount}/${TROPHY_SEGMENTS}`
                      : 'no page count'}
                  </Text>
                </View>
                <TrophyStrip progress={item.trophy} compact />
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function BookRow({ item, onPress }: { item: BookFitness<Book>; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.bookRow, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.book.name}, difficulty ${item.difficulty.score} of 10`}
    >
      <View style={styles.bookHeader}>
        <Text style={styles.bookTitle} numberOfLines={1}>
          {item.book.name}
        </Text>
        <View style={styles.difficultyChip}>
          <Text style={styles.difficultyChipText}>
            {difficultyLabel(item.difficulty.score)} {item.difficulty.score}
          </Text>
        </View>
      </View>
      <Text style={styles.bookMeta}>
        {describeDifficultySource(item.difficulty)}
        {item.pages > 0 ? ` - ${item.pages} pages` : ''}
        {item.minutes > 0 ? `, ${item.minutes} timed min` : ''}
        {item.streak.current > 0 ? ` - ${item.streak.current}-day streak` : ''}
        {typeof item.book.comprehension_score === 'number'
          ? ` - notes graded ${Math.round(item.book.comprehension_score * 100)}%, ${describeComprehensionGrade(item.book.comprehension_score)}`
          : ''}
      </Text>
      <TrophyStrip progress={item.trophy} compact />
    </Pressable>
  );
}

function Explainer({ model }: { model: ReadingModel<Book> }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Pressable
        style={styles.cardHeader}
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.cardTitle}>How these are calculated</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.explainer}>
          <Text style={styles.explainerHeading}>Difficulty Index (1-10)</Text>
          <Text style={styles.explainerBody}>
            Each book is rated once from what is known about it - prose, structure, and ideas - on
            a fixed scale: a light adventure sits near 3, a literary novel near 6, and The Brothers
            Karamazov near 8. Only the title, author, and catalog details are used, never your
            notes. Until a rating arrives, a quick estimate from genre, era, and length (plus the
            quotes you log) stands in. Set your own in Edit book and yours wins.
          </Text>
          <Text style={styles.explainerHeading}>Comprehension (0-100%)</Text>
          <Text style={styles.explainerBody}>
            Scored per book per day from what your reading leaves behind. Silent timed reading
            scores 0. Any bookmark that day earns 50 points; up to 80 words of notes add 25; an
            Important flag and reflecting on a quote add 12.5 each. With the companion, each book’s
            notes are also graded for what they show you understood: recall (half the grade -
            specific, accurate tracking of people, events, and ideas), interpretation (a quarter -
            the why), connection and evaluation (an eighth each), each marked 0-4. The grade scales
            the points your writing earned that day: accurate, factual notes grade 50% and leave
            them as they are; reflective notes add up to half again; thin notes take some away. A
            grade from only a few notes counts for less, and books are regraded only when you write
            something new. The tile averages the last 28 days, weighted by pages; each graded
            book’s row shows the notes grade itself. Inside Session Effort the same score is the
            multiplier x0.6 (0%) to x1.4 (100%).
          </Text>
          <Text style={styles.explainerHeading}>Session Effort</Text>
          <Text style={styles.explainerBody}>
            pages x (Difficulty / 5) x Comprehension, per book per day. Pages come from your bookmark
            positions or the pages you enter after a Sandglass session, whichever is larger.
          </Text>
          <Text style={styles.explainerHeading}>Pace</Text>
          <Text style={styles.explainerBody}>
            Pages per minute across your timed sessions with a page range (last 28 days). A
            typical novel sits around 0.7-1.0; dense non-fiction well under that.
          </Text>
          <Text style={styles.explainerHeading}>Reading Fitness</Text>
          <Text style={styles.explainerBody}>
            Each day: Fitness = yesterday’s Fitness + (today’s Effort - yesterday’s Fitness) / 42. A
            quiet day costs about 2.4%; a steady habit lifts it. Current value {formatFitness(
              model.series.length ? model.series[model.series.length - 1].fitness : 0,
            )}.
          </Text>
          <Text style={styles.explainerHeading}>Streaks and Reading Current</Text>
          <Text style={styles.explainerBody}>
            A read day is any bookmark or session. A day spent only with the companion (recaps,
            questions, search) freezes the streak instead of breaking it, up to{' '}
            {MAX_CONSECUTIVE_FREEZES} days in a row. Frozen days are not counted.
          </Text>
          <Text style={styles.explainerHeading}>Trophies</Text>
          <Text style={styles.explainerBody}>
            {TROPHY_SEGMENTS} pieces per book at each quarter of its page count; finishing a book
            completes the trophy even without a page count. Finished trophies are shelved by the
            book’s Difficulty Index: Light, Moderate, Demanding, Dense.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function sortBooks(books: readonly BookFitness<Book>[]): BookFitness<Book>[] {
  return [...books].sort((a, b) => {
    const left = a.lastActiveDay ?? '';
    const right = b.lastActiveDay ?? '';
    if (left !== right) {
      return left < right ? 1 : -1;
    }
    return a.book.name.localeCompare(b.book.name);
  });
}

function formatFitness(value: number): string {
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}

/** "Reflective" for a comprehension factor - the tile's unit line, capitalised like the Difficulty band. */
function comprehensionWord(factor: number): string {
  const word = describeComprehensionGrade(comprehensionPercent(factor) / 100);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function monthLabel(day: string): string {
  const month = Number(day.slice(5, 7));
  return MONTHS[month - 1] ?? '';
}

/** "12 Sep" for an ISO timestamp (local day). */
function monthDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
}

function weekLabel(weekStart: string): string {
  const month = Number(weekStart.slice(5, 7));
  const date = Number(weekStart.slice(8, 10));
  return `${MONTHS[month - 1] ?? ''} ${date}`;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
    ...cardShadow,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
  },
  cardMeta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
  },
  cardBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
  },
  cardFootnote: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  subheading: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  pressed: {
    opacity: 0.75,
  },
  timerButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: sizes.button,
    backgroundColor: colors.accent,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    ...buttonShadow,
  },
  timerButtonText: {
    fontFamily: fonts.sansSemiBold,
    color: colors.onAccent,
    fontSize: 16,
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  streakFlame: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: gold.glowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  streakValue: {
    fontFamily: fonts.serif,
    fontSize: 25,
    lineHeight: 32,
    color: colors.text,
  },
  frozenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  frozenText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.accent,
  },
  streakMessage: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    marginTop: spacing.xs,
  },
  streakMeta: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  rangeBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rangeBadgeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.accent,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroValue: {
    fontFamily: fonts.serif,
    fontSize: 44,
    lineHeight: 52,
    color: colors.text,
  },
  heroUnit: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.muted,
  },
  heroDelta: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.accent,
  },
  heroDeltaDown: {
    color: colors.fall,
  },
  volumeDelta: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.accent,
  },
  cardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  // Two columns (D-064): three squeezed "Comprehension" onto two lines.
  metric: {
    flexBasis: '46%',
    flexGrow: 1,
    backgroundColor: colors.surface2,
    borderRadius: radii.field,
    padding: spacing.md,
  },
  metricLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.muted,
  },
  metricValue: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
    marginTop: spacing.xs,
  },
  metricUnit: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.text,
  },
  metricHint: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  trophyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  trophyTile: {
    flexBasis: '46%',
    flexGrow: 1,
    gap: 4,
    backgroundColor: colors.riseSoft,
    borderColor: gold.base,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  trophyTileEmpty: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  trophyTileOpen: {
    borderColor: colors.walnut,
    borderWidth: 2,
  },
  trophyTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trophyCount: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 22,
    color: colors.text,
  },
  trophyCountEmpty: {
    color: colors.muted,
  },
  trophyTitle: {
    fontFamily: fonts.serif,
    fontSize: 14,
    color: colors.text,
  },
  trophyRange: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.muted,
  },
  shelf: {
    gap: 6,
    marginTop: 2,
  },
  shelfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  shelfTitle: {
    fontFamily: fonts.serif,
    fontSize: 14,
    color: colors.text,
  },
  inProgress: {
    gap: 8,
    marginTop: 4,
  },
  inProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inProgressRow: {
    gap: 4,
  },
  inProgressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inProgressTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 13,
    color: colors.text,
  },
  bookRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 6,
  },
  bookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bookTitle: {
    flex: 1,
    fontFamily: fonts.serif,
    fontSize: 15,
    color: colors.text,
  },
  bookMeta: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.muted,
  },
  difficultyChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.accentSoft,
  },
  difficultyChipText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 11,
    color: colors.accent,
  },
  explainer: {
    gap: 4,
  },
  explainerHeading: {
    fontFamily: fonts.serif,
    fontSize: 14,
    color: colors.text,
    marginTop: 6,
  },
  explainerBody: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
});
