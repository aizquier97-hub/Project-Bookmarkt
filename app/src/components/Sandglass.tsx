import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';

import { colors, gold } from '@/lib/theme';

interface SandglassProps {
  /** Elapsed fraction of the session, 0 (full top bulb) to 1 (all sand down). */
  progress: number;
  /** Rendered width; height follows the 5:8 glass proportion. */
  size?: number;
  /** Draws the falling stream while the timer runs. */
  running?: boolean;
}

// Geometry on a 100 x 160 canvas: walnut plates and posts frame two glass
// bulbs that meet at the waist (y = 80). Sand height scales linearly with
// the fraction so the glass "reads" like a progress bar without numbers.
const TOP_BULB = 'M22 14 L78 14 L78 32 Q78 62 54 77 L50 80 L46 77 Q22 62 22 32 Z';
const BOTTOM_BULB = 'M22 146 L78 146 L78 128 Q78 98 54 83 L50 80 L46 83 Q22 98 22 128 Z';
const BULB_HEIGHT = 66;

/** The Sandglass (D-062): the reading timer's face. Pure SVG. */
export function Sandglass({ progress, size = 160, running = false }: SandglassProps) {
  const elapsed = Math.min(1, Math.max(0, progress));
  const remaining = 1 - elapsed;
  const topSandY = 80 - remaining * BULB_HEIGHT;
  const bottomSandY = 146 - elapsed * BULB_HEIGHT;
  const moundHalfWidth = 10 + elapsed * 14;
  const moundHeight = elapsed > 0 ? 6 : 0;

  return (
    <View style={[styles.wrap, { width: size, height: size * 1.6 }]}>
      <Svg width={size} height={size * 1.6} viewBox="0 0 100 160">
        <Defs>
          <ClipPath id="topBulb">
            <Path d={TOP_BULB} />
          </ClipPath>
          <ClipPath id="bottomBulb">
            <Path d={BOTTOM_BULB} />
          </ClipPath>
        </Defs>

        {/* Glass */}
        <Path d={TOP_BULB} fill="rgba(255,255,255,0.55)" stroke={colors.walnutBorder} strokeWidth={1.5} />
        <Path d={BOTTOM_BULB} fill="rgba(255,255,255,0.55)" stroke={colors.walnutBorder} strokeWidth={1.5} />

        {/* Sand still to fall */}
        <G clipPath="url(#topBulb)">
          <Rect x={22} y={topSandY} width={56} height={80 - topSandY + 1} fill={gold.fill} />
          <Rect x={22} y={topSandY} width={56} height={1.5} fill={gold.base} />
        </G>

        {/* Sand that has fallen */}
        <G clipPath="url(#bottomBulb)">
          <Rect x={22} y={bottomSandY} width={56} height={146 - bottomSandY + 1} fill={gold.fill} />
          {moundHeight > 0 ? (
            <Path
              d={`M${50 - moundHalfWidth} ${bottomSandY} L50 ${bottomSandY - moundHeight} L${50 + moundHalfWidth} ${bottomSandY} Z`}
              fill={gold.fill}
            />
          ) : null}
        </G>

        {/* Falling stream */}
        {running && remaining > 0 && elapsed < 1 ? (
          <Line
            x1={50}
            y1={80}
            x2={50}
            y2={bottomSandY - moundHeight}
            stroke={gold.base}
            strokeWidth={1.6}
            strokeDasharray="2 2"
          />
        ) : null}

        {/* Walnut frame */}
        <Rect x={8} y={4} width={84} height={10} rx={3} fill={colors.walnut} />
        <Rect x={8} y={146} width={84} height={10} rx={3} fill={colors.walnut} />
        <Rect x={13} y={12} width={4} height={136} rx={2} fill={colors.walnutBorder} />
        <Rect x={83} y={12} width={4} height={136} rx={2} fill={colors.walnutBorder} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
