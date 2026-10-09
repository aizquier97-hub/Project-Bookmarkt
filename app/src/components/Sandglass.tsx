import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';

import { gold } from '@/lib/theme';

interface SandglassProps {
  /** Elapsed fraction of the session, 0 (full top bulb) to 1 (all sand down). */
  progress: number;
  /** Rendered width; height follows the 5:8 glass proportion. */
  size?: number;
  /** Draws the falling stream while the timer runs. */
  running?: boolean;
}

// Geometry on a 100 x 160 canvas (D-090, after the Figma reference): two
// thin antique-gold caps and two hairline posts frame the glass; the upper
// bulb holds the sand as a solid gold mass, the lower bulb is only an
// outline until the pile grows. Sand height scales linearly with the
// fraction so the glass reads like a progress bar without numbers.
const TOP_BULB = 'M20 12 L80 12 L80 34 Q80 64 55 78 L50 81 L45 78 Q20 64 20 34 Z';
const BOTTOM_BULB = 'M20 148 L80 148 L80 126 Q80 96 55 82 L50 79 L45 82 Q20 96 20 126 Z';
const BULB_HEIGHT = 66;
const FRAME_STROKE = 'rgba(201, 150, 47, 0.55)';

/** The Sandglass (D-062): the reading timer's face. Pure SVG. */
export function Sandglass({ progress, size = 160, running = false }: SandglassProps) {
  const elapsed = Math.min(1, Math.max(0, progress));
  const remaining = 1 - elapsed;
  const topSandY = 81 - remaining * BULB_HEIGHT;
  const pileHalfWidth = 6 + elapsed * 24;
  const pileHeight = elapsed > 0 ? 4 + elapsed * 20 : 0;
  const pileTopY = 148 - pileHeight;

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

        {/* Frame: thin caps and posts */}
        <Line x1={10} y1={6} x2={90} y2={6} stroke={gold.base} strokeWidth={2.4} strokeLinecap="round" />
        <Line x1={10} y1={154} x2={90} y2={154} stroke={gold.base} strokeWidth={2.4} strokeLinecap="round" />
        <Line x1={13} y1={6} x2={13} y2={154} stroke={FRAME_STROKE} strokeWidth={1} />
        <Line x1={87} y1={6} x2={87} y2={154} stroke={FRAME_STROKE} strokeWidth={1} />

        {/* Glass outlines */}
        <Path d={TOP_BULB} fill="none" stroke={FRAME_STROKE} strokeWidth={1} />
        <Path d={BOTTOM_BULB} fill="none" stroke={FRAME_STROKE} strokeWidth={1} />

        {/* Sand still to fall */}
        <G clipPath="url(#topBulb)">
          <Rect x={20} y={topSandY} width={60} height={82 - topSandY} fill={gold.fill} />
        </G>

        {/* Sand that has fallen: a pile that widens as the session goes on */}
        {pileHeight > 0 ? (
          <G clipPath="url(#bottomBulb)">
            <Path
              d={`M${50 - pileHalfWidth} 148 Q50 ${pileTopY - pileHeight * 0.6} ${50 + pileHalfWidth} 148 Z`}
              fill={gold.fill}
            />
          </G>
        ) : null}

        {/* Falling stream */}
        {running && remaining > 0 && elapsed < 1 ? (
          <Line x1={50} y1={81} x2={50} y2={pileTopY} stroke={gold.base} strokeWidth={1} />
        ) : null}
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
