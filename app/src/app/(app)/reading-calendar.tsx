import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { parseDayKey } from '@/domains/fitness/days';
import { computeCalendarMonth, shiftMonth, type CalendarDay } from '@/domains/fitness/fitness';
import { useReadingModel } from '@/domains/fitness/useReadingModel';
import { ErrorState, LoadingState } from '@/components/states';
import { cardShadow, colors, fonts, gold } from '@/lib/theme';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The reading calendar (D-064): the Profile's 16-week heatmap opened into a
 * full month view. Every day is read (an entry or a Sandglass session),
 * Reading Current (companion time only, which freezes a streak), or quiet;
 * tap a day for its pages, minutes, and entries, and page back through the
 * months to see how a habit took shape.
 */
export default function ReadingCalendarScreen() {
  const query = useReadingModel();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() + 1 };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const model = query.model;
  const month = useMemo(
    () =>
      model
        ? computeCalendarMonth({
            loads: model.loads,
            engagementDays: model.engagementDays,
            year: cursor.year,
            monthIndex: cursor.monthIndex,
            today: model.today,
          })
        : null,
    [model, cursor],
  );

  if (query.isPending) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Reading calendar' }} />
        <LoadingState label="Turning the pages back…" />
      </View>
    );
  }
  if (query.isError || !model || !month) {
    return (
      <View style={styles.stateContainer}>
        <Stack.Screen options={{ title: 'Reading calendar' }} />
        <ErrorState
          error={query.error}
          fallback="Could not load your reading days."
          onRetry={() => void query.refetch()}
        />
      </View>
    );
  }

  const todayMonth = model.today.slice(0, 7);
  const atCurrentMonth = month.month >= todayMonth;
  const selected = selectedDay
    ? (month.cells.find((cell) => cell?.day === selectedDay) ?? null)
    : null;

  const move = (delta: number) => {
    setCursor((value) => shiftMonth(value.year, value.monthIndex, delta));
    setSelectedDay(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Reading calendar' }} />

      <View style={styles.card}>
        <View style={styles.monthNav}>
          <Pressable
            style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
            onPress={() => move(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.monthTitle}>
            {MONTH_NAMES[month.monthIndex - 1]} {month.year}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.navButton,
              atCurrentMonth && styles.navButtonDisabled,
              pressed && !atCurrentMonth && styles.pressed,
            ]}
            onPress={() => move(1)}
            disabled={atCurrentMonth}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: atCurrentMonth }}
            hitSlop={8}
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={atCurrentMonth ? colors.border : colors.text}
            />
          </Pressable>
        </View>

        <View style={styles.totalsRow}>
          <Total value={String(month.readDays)} label={month.readDays === 1 ? 'reading day' : 'reading days'} />
          <Total value={String(month.pages)} label="pages" />
          <Total value={String(month.minutes)} label="timed min" />
          {month.currentDays > 0 ? (
            <Total value={String(month.currentDays)} label="current" />
          ) : null}
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((label) => (
            <Text key={label} style={styles.weekday}>
              {label}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {month.cells.map((cell, index) =>
            cell === null ? (
              <View key={`pad-${index}`} style={styles.cell} />
            ) : (
              <DayCell
                key={cell.day}
                cell={cell}
                selected={cell.day === selectedDay}
                onPress={() => setSelectedDay((value) => (value === cell.day ? null : cell.day))}
              />
            ),
          )}
        </View>

        <View style={styles.legend}>
          <LegendSwatch style={styles.swatchRead} label="Read" />
          <LegendSwatch style={styles.swatchCurrent} label="Reading Current" />
          <LegendSwatch style={styles.swatchToday} label="Today" />
        </View>
      </View>

      {selected ? <DayDetail day={selected} /> : null}

      <Text style={styles.footnote}>
        A read day is any bookmark entry or Sandglass session. A Reading Current day is time
        spent only with your companion - it keeps a streak alive without counting toward it.
      </Text>
    </ScrollView>
  );
}

function DayCell({
  cell,
  selected,
  onPress,
}: {
  cell: CalendarDay;
  selected: boolean;
  onPress: () => void;
}) {
  const date = Number(cell.day.slice(8, 10));
  const label =
    cell.kind === 'read'
      ? `${describeDay(cell.day)}: read, ${cell.pages} pages`
      : cell.kind === 'current'
        ? `${describeDay(cell.day)}: Reading Current`
        : `${describeDay(cell.day)}: no reading logged`;
  return (
    <Pressable
      style={styles.cell}
      onPress={onPress}
      disabled={cell.isFuture}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: cell.isFuture }}
    >
      <View
        style={[
          styles.dayDot,
          cell.kind === 'read' && styles.dayRead,
          cell.kind === 'current' && styles.dayCurrent,
          cell.isToday && styles.dayToday,
          selected && styles.daySelected,
        ]}
      >
        <Text
          style={[
            styles.dayText,
            cell.kind === 'read' && styles.dayTextRead,
            cell.kind === 'current' && styles.dayTextCurrent,
            cell.isFuture && styles.dayTextFuture,
          ]}
        >
          {date}
        </Text>
      </View>
    </Pressable>
  );
}

function DayDetail({ day }: { day: CalendarDay }) {
  const parts: string[] = [];
  if (day.pages > 0) {
    parts.push(`${day.pages} ${day.pages === 1 ? 'page' : 'pages'}`);
  }
  if (day.minutes > 0) {
    parts.push(`${day.minutes} timed min`);
  }
  if (day.entries > 0) {
    parts.push(`${day.entries} ${day.entries === 1 ? 'entry' : 'entries'}`);
  }
  if (day.sessions > 0) {
    parts.push(`${day.sessions} ${day.sessions === 1 ? 'session' : 'sessions'}`);
  }
  const summary =
    day.kind === 'read'
      ? parts.join(' - ')
      : day.kind === 'current'
        ? 'Reading Current - time with your companion kept the streak alive.'
        : 'Nothing logged.';
  return (
    <View style={styles.card}>
      <Text style={styles.detailTitle}>{describeDay(day.day)}</Text>
      <Text style={styles.detailBody}>{summary}</Text>
    </View>
  );
}

function Total({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

function LegendSwatch({ style, label }: { style: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, style]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function describeDay(day: string): string {
  const date = parseDayKey(day);
  return `${LONG_WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 12,
    ...cardShadow,
  },
  pressed: {
    opacity: 0.7,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  monthTitle: {
    fontFamily: fonts.serif,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  totalsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  total: {
    flex: 1,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  totalValue: {
    fontFamily: fonts.serif,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  totalLabel: {
    fontFamily: fonts.serif,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.serif,
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    height: CELL_SIZE + 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: CELL_SIZE - 4,
    height: CELL_SIZE - 4,
    borderRadius: (CELL_SIZE - 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dayRead: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  dayCurrent: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  dayToday: {
    borderColor: colors.walnut,
  },
  daySelected: {
    borderWidth: 2.5,
    borderColor: colors.walnut,
  },
  dayText: {
    fontFamily: fonts.serif,
    fontSize: 14,
    color: colors.text,
  },
  dayTextRead: {
    color: gold.onFill,
    fontWeight: '700',
  },
  dayTextCurrent: {
    color: colors.accent,
    fontWeight: '600',
  },
  dayTextFuture: {
    color: colors.border,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  swatchRead: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  swatchCurrent: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  swatchToday: {
    borderColor: colors.walnut,
  },
  legendText: {
    fontFamily: fonts.serif,
    fontSize: 12,
    color: colors.muted,
  },
  detailTitle: {
    fontFamily: fonts.serif,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  detailBody: {
    fontFamily: fonts.serif,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  footnote: {
    fontFamily: fonts.serif,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    paddingHorizontal: 4,
  },
});
