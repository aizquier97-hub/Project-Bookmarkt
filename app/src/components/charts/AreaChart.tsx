import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, fonts } from '@/lib/theme';

export interface AreaChartPoint {
  value: number;
  /** ISO day (YYYY-MM-DD) used to place month ticks along the X axis. */
  day?: string;
}

interface AreaChartProps {
  points: readonly AreaChartPoint[];
  height?: number;
  color?: string;
  /** Captions under the left and right edges ("Jul", "Today"). */
  startLabel?: string;
  endLabel?: string;
  accessibilityLabel?: string;
}

const PADDING_TOP = 8;
const PADDING_BOTTOM = 4;
const TICK_HEIGHT = 4;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Keep month ticks at least this far from an edge caption so they never collide. */
const EDGE_GUTTER = 0.09;

/**
 * Strava-style cumulative area chart: a smooth filled line over a quiet
 * grid, with the latest value marked. Pure SVG, measures its own width.
 * D-090 added the X axis: a tick and month label wherever a new month
 * starts between the two edge captions.
 */
export function AreaChart({
  points,
  height = 160,
  color = colors.accent,
  startLabel,
  endLabel,
  accessibilityLabel,
}: AreaChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;
  const baseline = PADDING_TOP + plotHeight;
  const max = Math.max(1, ...points.map((point) => point.value));
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((point, index) => ({
    x: points.length > 1 ? index * stepX : width / 2,
    y: PADDING_TOP + plotHeight - (point.value / max) * plotHeight,
  }));

  let linePath = '';
  let areaPath = '';
  if (width > 0 && coords.length > 0) {
    linePath = coords
      .map((c, index) => `${index === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)} ${baseline} L${coords[0].x.toFixed(1)} ${baseline} Z`;
  }
  const last = coords[coords.length - 1];
  const ticks = monthTicks(points);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={{ height }} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.35} />
                <Stop offset="1" stopColor={color} stopOpacity={0.03} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((fraction) => {
              const y = PADDING_TOP + plotHeight * (1 - fraction);
              return (
                <Line
                  key={fraction}
                  x1={0}
                  x2={width}
                  y1={y}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth={StyleSheet.hairlineWidth}
                  strokeDasharray="3 5"
                />
              );
            })}
            {areaPath ? <Path d={areaPath} fill="url(#areaFill)" /> : null}
            {linePath && coords.length > 1 ? (
              <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
            ) : null}
            <Line x1={0} x2={width} y1={baseline} y2={baseline} stroke={colors.muted} strokeWidth={1} />
            {ticks.map((tick) => {
              const x = tick.fraction * width;
              return (
                <Line
                  key={tick.key}
                  x1={x}
                  x2={x}
                  y1={baseline}
                  y2={baseline - TICK_HEIGHT}
                  stroke={colors.muted}
                  strokeWidth={1}
                />
              );
            })}
            {last ? <Circle cx={last.x} cy={last.y} r={4} fill={color} stroke={colors.card} strokeWidth={2} /> : null}
          </Svg>
        ) : null}
      </View>
      {startLabel || endLabel || ticks.length > 0 ? (
        <View style={styles.axis}>
          <View style={styles.labels}>
            <Text style={styles.label}>{startLabel ?? ''}</Text>
            <Text style={styles.label}>{endLabel ?? ''}</Text>
          </View>
          {width > 0
            ? ticks.map((tick) => (
                <Text
                  key={tick.key}
                  style={[styles.label, styles.tickLabel, { left: tick.fraction * width - 16 }]}
                  numberOfLines={1}
                >
                  {tick.label}
                </Text>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

interface MonthTick {
  key: string;
  label: string;
  fraction: number;
}

/** One tick at the first day of each month inside the range, edges excluded. */
function monthTicks(points: readonly AreaChartPoint[]): MonthTick[] {
  if (points.length < 2) {
    return [];
  }
  const ticks: MonthTick[] = [];
  let previousMonth = points[0].day?.slice(0, 7) ?? null;
  for (let index = 1; index < points.length; index += 1) {
    const day = points[index].day;
    if (!day) {
      continue;
    }
    const month = day.slice(0, 7);
    if (month !== previousMonth) {
      previousMonth = month;
      const fraction = index / (points.length - 1);
      if (fraction > EDGE_GUTTER && fraction < 1 - EDGE_GUTTER) {
        ticks.push({ key: month, label: MONTHS[Number(day.slice(5, 7)) - 1] ?? '', fraction });
      }
    }
  }
  // Keep the labels legible on a narrow card: at most one every ~3 months
  // once the range spans a year.
  if (ticks.length > 5) {
    const every = Math.ceil(ticks.length / 5);
    return ticks.filter((_, index) => index % every === every - 1);
  }
  return ticks;
}

const styles = StyleSheet.create({
  axis: {
    marginTop: 4,
    height: 16,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
    fontFamily: fonts.sans,
  },
  tickLabel: {
    position: 'absolute',
    top: 0,
    width: 32,
    textAlign: 'center',
  },
});
