import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, gold } from '@/lib/theme';

export interface DateRange {
  /** Local calendar day, "YYYY-MM-DD". */
  start: string;
  /** Local calendar day, "YYYY-MM-DD", inclusive. */
  end: string;
}

/** Local calendar-day key for a date - no UTC drift near midnight. */
export function toDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Expands a calendar-day range to full local-time ISO bounds (midnight to
 * end of day) so the server's timestamp comparison covers whole days in the
 * reader's own timezone.
 */
export function rangeToIsoBounds(range: DateRange): { rangeStart: string; rangeEnd: string } {
  const [sy, sm, sd] = range.start.split('-').map(Number);
  const [ey, em, ed] = range.end.split('-').map(Number);
  return {
    rangeStart: new Date(sy, sm - 1, sd, 0, 0, 0, 0).toISOString(),
    rangeEnd: new Date(ey, em - 1, ed, 23, 59, 59, 999).toISOString(),
  };
}

const PRESETS: { label: string; days: number | null }[] = [
  { label: 'Last week', days: 7 },
  { label: 'Last 2 weeks', days: 14 },
  { label: 'Last month', days: 30 },
  { label: 'All so far', days: null },
];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MONTHS = [
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

function presetRange(days: number | null): DateRange {
  const today = new Date();
  if (days === null) {
    return { start: '2000-01-01', end: toDayKey(today) };
  }
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return { start: toDayKey(start), end: toDayKey(today) };
}

/**
 * Compact date-range picker (Interface v2.0): preset chips for the common
 * cases plus a month-grid calendar for specific dates - tap once for the
 * first day, again for the last. No third-party datepicker; the grid is
 * plain views styled as the app's paper.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
}) {
  const today = new Date();
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  // A lone first tap: the range is incomplete until the second day lands.
  const [pendingStart, setPendingStart] = useState<string | null>(null);

  const grid = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(toDayKey(new Date(year, month, day)));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthCursor]);

  const activePresetLabel = useMemo(() => {
    if (!value) return null;
    for (const preset of PRESETS) {
      const range = presetRange(preset.days);
      if (range.start === value.start && range.end === value.end) return preset.label;
    }
    return null;
  }, [value]);

  const handleDayPress = (dayKey: string) => {
    if (pendingStart) {
      const [start, end] = pendingStart <= dayKey ? [pendingStart, dayKey] : [dayKey, pendingStart];
      setPendingStart(null);
      onChange({ start, end });
    } else {
      setPendingStart(dayKey);
      onChange(null);
    }
  };

  const shiftMonth = (delta: number) => {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return (
    <View>
      <View style={styles.presetRow}>
        {PRESETS.map((preset) => {
          const active = activePresetLabel === preset.label;
          return (
            <Pressable
              key={preset.label}
              style={[styles.presetChip, active && styles.presetChipActive]}
              onPress={() => {
                setPendingStart(null);
                onChange(presetRange(preset.days));
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.presetText, active && styles.presetTextActive]}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.monthHeader}>
        <Pressable
          style={styles.monthArrow}
          onPress={() => shiftMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={16} color={colors.muted} />
        </Pressable>
        <Text style={styles.monthTitle}>
          {MONTHS[monthCursor.getMonth()]} {monthCursor.getFullYear()}
        </Text>
        <Pressable
          style={styles.monthArrow}
          onPress={() => shiftMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((dayKey, index) => {
          if (!dayKey) {
            return <View key={`blank-${index}`} style={styles.dayCell} />;
          }
          const isBound =
            dayKey === pendingStart || dayKey === value?.start || dayKey === value?.end;
          const inRange =
            Boolean(value) && dayKey > (value?.start ?? '') && dayKey < (value?.end ?? '');
          return (
            <Pressable
              key={dayKey}
              style={[styles.dayCell, inRange && styles.dayInRange, isBound && styles.dayBound]}
              onPress={() => handleDayPress(dayKey)}
              accessibilityRole="button"
              accessibilityLabel={dayKey}
              accessibilityState={{ selected: isBound }}
            >
              <Text style={[styles.dayText, isBound && styles.dayTextBound]}>
                {Number(dayKey.slice(8))}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {pendingStart ? (
        <Text style={styles.hint}>First day marked - now tap the last day.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  presetChipActive: {
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  presetText: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  presetTextActive: {
    color: gold.onFill,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  monthArrow: {
    padding: 6,
  },
  monthTitle: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1.15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  dayInRange: {
    backgroundColor: gold.glowSoft,
    borderRadius: 0,
  },
  dayBound: {
    backgroundColor: gold.fill,
    borderWidth: 1,
    borderColor: gold.deep,
  },
  dayText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 13,
  },
  dayTextBound: {
    color: gold.onFill,
    fontWeight: '700',
  },
  hint: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
