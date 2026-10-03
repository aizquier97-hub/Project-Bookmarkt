import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CompanionCueCard } from '@/domains/companion/api';
import {
  applyFlip,
  buildBoard,
  hideMismatch,
  isFaceUp,
  isWon,
  MISMATCH_LINGER_MS,
  pairCount,
  type MemoryBoard,
  type MemoryTile,
} from '@/domains/cueCards/memoryGame';
import { cardShadow, colors, fonts, gold } from '@/lib/theme';

interface MemoryMatchProps {
  cards: readonly CompanionCueCard[];
  onWon: (moves: number) => void;
}

/**
 * The memory-match board (D-065): cue and answer faces of the reader's
 * own cue cards, face down in a three-across grid. Matched pairs stay up
 * in gold; a wrong pair lingers a moment, then turns back. The parent
 * re-keys the component for a fresh board.
 */
export function MemoryMatch({ cards, onWon }: MemoryMatchProps) {
  const [board, setBoard] = useState<MemoryBoard>(() => buildBoard(cards));
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    if (!board.mismatch) {
      return;
    }
    const timer = setTimeout(() => setBoard((current) => hideMismatch(current)), MISMATCH_LINGER_MS);
    return () => clearTimeout(timer);
  }, [board.mismatch]);

  const won = isWon(board);
  useEffect(() => {
    if (won && !announced) {
      setAnnounced(true);
      onWon(board.moves);
    }
  }, [won, announced, board.moves, onWon]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.statusRow}>
        <Text style={styles.status}>
          {board.matched.length} of {pairCount(board)} pairs
        </Text>
        <Text style={styles.status}>
          {board.moves} {board.moves === 1 ? 'turn' : 'turns'}
        </Text>
      </View>
      <View style={styles.grid} accessibilityRole="none">
        {board.tiles.map((tile) => (
          <Tile
            key={tile.id}
            tile={tile}
            faceUp={isFaceUp(board, tile)}
            matched={board.matched.includes(tile.pairId)}
            disabled={won || board.mismatch}
            onPress={() => setBoard((current) => applyFlip(current, tile.id))}
          />
        ))}
      </View>
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
        <>
          <Text style={[styles.tileTag, tile.face === 'answer' && styles.tileTagAnswer]}>
            {tile.face === 'cue' ? 'CUE' : 'FROM YOUR RECORDS'}
          </Text>
          <Text
            style={[styles.tileText, tile.face === 'answer' && styles.tileTextAnswer]}
            numberOfLines={5}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {tile.text}
          </Text>
        </>
      ) : (
        <Ionicons name="bookmark-outline" size={22} color={colors.onWalnutMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    maxWidth: 380,
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  status: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tile: {
    // Three across with two 8pt gutters: (100% - 16) / 3.
    width: '31.5%',
    flexGrow: 1,
    aspectRatio: 0.85,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...cardShadow,
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
    backgroundColor: gold.fill,
    borderColor: gold.deep,
  },
  tileMatched: {
    borderWidth: 2,
    borderColor: gold.deep,
  },
  tileTag: {
    fontFamily: fonts.serif,
    color: colors.muted,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  tileTagAnswer: {
    color: gold.onFill,
    opacity: 0.8,
  },
  tileText: {
    fontFamily: fonts.serif,
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  tileTextAnswer: {
    color: gold.onFill,
    fontWeight: '500',
  },
});
