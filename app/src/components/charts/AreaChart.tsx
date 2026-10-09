import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, fonts } from '@/lib/theme';

export interface AreaChartPoint {
  value: number;
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

/**
 * Strava-style cumulative area chart: a smooth filled line over a quiet
 * grid, with the latest value marked. Pure SVG, measures its own width.
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
    const baseline = PADDING_TOP + plotHeight;
    areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)} ${baseline} L${coords[0].x.toFixed(1)} ${baseline} Z`;
  }
  const last = coords[coords.length - 1];

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
            <Line
              x1={0}
              x2={width}
              y1={PADDING_TOP + plotHeight}
              y2={PADDING_TOP + plotHeight}
              stroke={colors.border}
              strokeWidth={1}
            />
            {areaPath ? <Path d={areaPath} fill="url(#areaFill)" /> : null}
            {linePath && coords.length > 1 ? (
              <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
            ) : null}
            {last ? <Circle cx={last.x} cy={last.y} r={4} fill={color} stroke={colors.card} strokeWidth={2} /> : null}
          </Svg>
        ) : null}
      </View>
      {startLabel || endLabel ? (
        <View style={styles.labels}>
          <Text style={styles.label}>{startLabel ?? ''}</Text>
          <Text style={styles.label}>{endLabel ?? ''}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  label: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.sans,
  },
});
