import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, gold } from '@/lib/theme';

export interface Bar {
  label: string;
  value: number;
  /** Rendered in gold (the current week). */
  highlight?: boolean;
}

interface BarChartProps {
  bars: readonly Bar[];
  height?: number;
  /** Shown above the tallest bar ("120 pages"). */
  formatValue?: (value: number) => string;
  accessibilityLabel?: string;
}

/**
 * Strava's weekly volume bars: plain views, one column per week, the
 * current week in gold. Labels sit under every other bar to stay legible.
 */
export function BarChart({ bars, height = 120, formatValue, accessibilityLabel }: BarChartProps) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const peakIndex = bars.reduce(
    (best, bar, index) => (bar.value > (bars[best]?.value ?? -1) ? index : best),
    0,
  );
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={[styles.plot, { height }]}>
        {bars.map((bar, index) => {
          const ratio = bar.value / max;
          const barHeight = Math.max(bar.value > 0 ? 3 : 1, Math.round(ratio * (height - 18)));
          return (
            <View key={`${bar.label}-${index}`} style={styles.column}>
              {formatValue && index === peakIndex && bar.value > 0 ? (
                <Text style={styles.peak} numberOfLines={1}>
                  {formatValue(bar.value)}
                </Text>
              ) : null}
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: bar.highlight
                      ? gold.fill
                      : bar.value > 0
                        ? colors.accent
                        : colors.border,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {bars.map((bar, index) => (
          <Text key={`${bar.label}-label-${index}`} style={styles.label} numberOfLines={1}>
            {index % 2 === bars.length % 2 ? bar.label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 0,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  peak: {
    fontSize: 10,
    color: colors.muted,
    fontFamily: fonts.sans,
    marginBottom: 3,
  },
  labels: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: colors.muted,
    fontFamily: fonts.sans,
  },
});
