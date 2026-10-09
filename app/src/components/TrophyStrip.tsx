import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { TrophyProgress } from '@/domains/fitness/trophies';
import { TROPHY_SEGMENTS } from '@/domains/fitness/trophies';
import { colors, fonts, gold } from '@/lib/theme';

interface TrophyStripProps {
  progress: TrophyProgress;
  /** Compact strips drop the caption and shrink the pieces. */
  compact?: boolean;
}

/**
 * Segment trophy (D-062): four pieces that fill in gold as the reader
 * crosses each quarter of the book, with the trophy itself lighting up on
 * completion. Books without a page count show a hint instead of pieces.
 */
export function TrophyStrip({ progress, compact = false }: TrophyStripProps) {
  const pieceHeight = compact ? 8 : 12;
  const caption = !progress.eligible
    ? progress.complete
      ? 'Trophy earned'
      : 'Add a page count to earn trophy pieces'
    : progress.complete
      ? 'Trophy complete'
      : progress.pagesToNext !== null
        ? `${progress.pagesToNext} ${progress.pagesToNext === 1 ? 'page' : 'pages'} to piece ${progress.unlockedCount + 1} of ${TROPHY_SEGMENTS}`
        : '';

  return (
    <View
      accessible
      accessibilityLabel={`Trophy: ${progress.unlockedCount} of ${TROPHY_SEGMENTS} pieces unlocked. ${caption}`}
    >
      <View style={styles.row}>
        <View style={styles.pieces}>
          {progress.segments.map((segment, index) => {
            const isCurrent =
              progress.eligible && !segment.unlocked && index === progress.unlockedCount;
            return (
              <View
                key={segment.index}
                style={[
                  styles.piece,
                  { height: pieceHeight },
                  index === 0 && styles.pieceFirst,
                  index === progress.segments.length - 1 && styles.pieceLast,
                  segment.unlocked ? styles.pieceUnlocked : styles.pieceLocked,
                ]}
              >
                {isCurrent ? (
                  <View
                    style={[
                      styles.pieceFill,
                      { width: `${Math.round(progress.segmentFraction * 100)}%` },
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        <Ionicons
          name={progress.complete ? 'trophy' : 'trophy-outline'}
          size={compact ? 16 : 20}
          color={progress.complete ? gold.base : colors.muted}
        />
      </View>
      {!compact && caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pieces: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
  },
  piece: {
    flex: 1,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
  },
  pieceFirst: {
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  pieceLast: {
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  pieceUnlocked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pieceLocked: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.border,
  },
  pieceFill: {
    height: '100%',
    backgroundColor: gold.glow,
  },
  caption: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.sans,
  },
});
