import { StyleSheet, Text, View } from 'react-native';

import type { HeatmapCell } from '@/domains/fitness/fitness';
import { colors, fonts, gold } from '@/lib/theme';

interface HeatmapProps {
  /** Monday-aligned, ascending day cells (see computeHeatmap). */
  cells: readonly HeatmapCell[];
  accessibilityLabel?: string;
}

const LEVEL_COLORS: Record<HeatmapCell['level'], string> = {
  0: colors.accentSoft,
  1: '#e3c9a1',
  2: gold.fill,
  3: gold.base,
  4: colors.accent,
};

const WEEKDAYS = ['M', '', 'W', '', 'F', '', 'S'];

/** GitHub-style reading calendar: one square per day, columns are weeks. */
export function Heatmap({ cells, accessibilityLabel }: HeatmapProps) {
  const weeks: HeatmapCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.weekdayColumn}>
        {WEEKDAYS.map((label, index) => (
          <Text key={index} style={styles.weekday}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={styles.weekColumn}>
            {Array.from({ length: 7 }).map((_, dayIndex) => {
              const cell = week[dayIndex];
              return (
                <View
                  key={dayIndex}
                  style={[
                    styles.cell,
                    { backgroundColor: cell ? LEVEL_COLORS[cell.level] : 'transparent' },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const CELL = 12;
const GAP = 3;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  weekdayColumn: {
    gap: GAP,
  },
  weekday: {
    height: CELL,
    fontSize: 9,
    lineHeight: CELL,
    color: colors.muted,
    fontFamily: fonts.serif,
    width: 10,
  },
  grid: {
    flex: 1,
    flexDirection: 'row',
    gap: GAP,
    justifyContent: 'flex-end',
  },
  weekColumn: {
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
});
