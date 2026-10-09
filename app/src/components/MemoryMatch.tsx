import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CompanionCueCard } from '@/domains/companion/api';
import {
  applyFlip,
  buildBoard,
  formatClock,
  hideMismatch,
  isFaceUp,
  isWon,
  MISMATCH_LINGER_MS,
  pairCount,
  type GameResult,
  type MemoryBoard,
  type MemoryTile,
} from '@/domains/cueCards/memoryGame';
import { cardShadow, colors, fonts, gold, radii, spacing } from '@/lib/theme';

interface MemoryMatchProps {
  cards: readonly CompanionCueCard[];
  /** The book's best clear at this board size, shown beside the clock. */
  best: GameResult | null;
  onWon: (result: GameResult) => void;
}

/**
 * The Recall match board (D-065; D-066 made it the whole game): cue and
 * answer faces of the reader's own cue cards, face down two across, against
 * a clock that starts on the first turn. Matched pairs stay up in gold; a
 * wrong pair lingers a moment, then turns back. The status row stays put
 * while a tall board scrolls beneath it. The parent re-keys the component
 * for a fresh board.
 */
export function MemoryMatch({ cards, best, onWon }: MemoryMatchProps) {
  const [board, setBoard] = useState<MemoryBoard>(() => buildBoard(cards));
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const announced = useRef(false);

  useEffect(() => {
    if (!board.mismatch) {
      return;
    }
    const timer = setTimeout(() => setBoard((current) => hideMismatch(current)), MISMATCH_LINGER_MS);
    return () => clearTimeout(timer);
  }, [board.mismatch]);

  const won = isWon(board);

  // The clock ticks only while a game is under way.
  useEffect(() => {
    if (startedAt === null || won) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [startedAt, won]);

  useEffect(() => {
    if (won && !announced.current) {
      announced.current = true;
      const seconds = startedAt === null ? 0 : Math.round((Date.now() - startedAt) / 1000);
      onWon({ seconds, turns: board.moves, pairs: pairCount(board) });
    }
  }, [won, startedAt, board, onWon]);

  const elapsedSeconds = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));

  const turn = (tileId: number) => {
    if (startedAt === null) {
      const started = Date.now();
      setStartedAt(started);
      setNow(started);
    }
    setBoard((current) => applyFlip(current, tileId));
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.statusRow}>
        <Text style={styles.status}>
          {board.matched.length} of {pairCount(board)} pairs
        </Text>
        <Text style={styles.status}>
          {board.moves} {board.moves === 1 ? 'turn' : 'turns'}
        </Text>
        <View style={styles.clock} accessibilityLabel={`Elapsed ${formatClock(elapsedSeconds)}`}>
          <Ionicons name="stopwatch-outline" size={15} color={gold.deep} />
          <Text style={styles.clockText}>{formatClock(elapsedSeconds)}</Text>
          {best ? <Text style={styles.best}>best {formatClock(best.seconds)}</Text> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {board.tiles.map((tile) => (
          <Tile
            key={tile.id}
            tile={tile}
            faceUp={isFaceUp(board, tile)}
            matched={board.matched.includes(tile.pairId)}
            disabled={won || board.mismatch}
            onPress={() => turn(tile.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Tile({
  tile,
  faceUp,
  matched,
  disabled,
  onPress,
}: {
  tile: MemoryTile;
  faceUp: boolean;
  matched: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const label = faceUp
    ? `${tile.face === 'cue' ? 'Cue' : 'Answer'}: ${tile.text}${matched ? ', matched' : ''}`
    : 'Face-down tile. Tap to turn it over.';
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        faceUp ? (tile.face === 'cue' ? styles.tileCue : styles.tileAnswer) : styles.tileDown,
        matched && styles.tileMatched,
        pressed && !faceUp && styles.tilePressed,
      ]}
      onPress={onPress}
      disabled={disabled || faceUp}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || faceUp, selected: matched }}
    >
      {faceUp ? (
        <View style={styles.tileFace}>
          <Text style={[styles.tileTag, tile.face === 'answer' && styles.tileTagAnswer]}>
            {tile.face === 'cue' ? 'CUE' : 'FROM YOUR RECORDS'}
          </Text>
          <Text
            style={[styles.tileText, tile.face === 'answer' && styles.tileTextAnswer]}
            numberOfLines={6}
          >
            {tile.text}
          </Text>
        </View>
      ) : (
        <Ionicons name="bookmark-outline" size={30} color={gold.base} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  status: {
    fontFamily: fonts.sansMedium,
    color: colors.accent,
    fontSize: 15,
  },
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  clockText: {
    fontFamily: fonts.sans,
    color: colors.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  best: {
    fontFamily: fonts.sans,
    color: colors.muted,
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
    paddingBottom: spacing.lg,
  },
  tile: {
    // Two across (D-066): a tile wide enough for a twelve-word answer at
    // body size, no font shrinking.
    width: '48.5%',
    minHeight: 104,
    borderRadius: radii.card,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  tileFace: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tileDown: {
    backgroundColor: colors.walnut,
    borderColor: colors.walnutBorder,
  },
  tilePressed: {
    opacity: 0.85,
  },
  tileCue: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  tileAnswer: {
    backgroundColor: gold.glowSoft,
    borderColor: gold.glow,
  },
  tileMatched: {
    borderWidth: 2,
    borderColor: gold.deep,
  },
  tileTag: {
    fontFamily: fonts.sansMedium,
    color: colors.muted,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  tileTagAnswer: {
    color: colors.muted,
  },
  tileText: {
    width: '100%',
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  tileTextAnswer: {
    color: colors.text,
  },
});
