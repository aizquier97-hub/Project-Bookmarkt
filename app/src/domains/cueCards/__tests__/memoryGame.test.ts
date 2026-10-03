import {
  applyFlip,
  betterResult,
  buildBoard,
  deckOverlap,
  formatClock,
  hasEnoughForBoard,
  hideMismatch,
  isFaceUp,
  isWon,
  MAX_PAIRS,
  MIN_PAIRS,
  playableCards,
  shuffle,
} from '@/domains/cueCards/memoryGame';

function card(n: number) {
  return { front: `Cue ${n}`, back: `Answer ${n}` };
}

/** A tiny deterministic generator so boards are reproducible. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('playableCards / hasEnoughForBoard', () => {
  it('drops blank, self-answering, and duplicated cues', () => {
    const cards = [
      card(1),
      { front: '  ', back: 'x' },
      { front: 'Same', back: 'same' },
      { front: 'cue 1', back: 'Another answer' },
      card(2),
    ];
    expect(playableCards(cards)).toEqual([card(1), card(2)]);
    expect(hasEnoughForBoard(cards)).toBe(false);
    expect(hasEnoughForBoard([card(1), card(2), card(3)])).toBe(true);
  });
});

describe('shuffle', () => {
  it('is a permutation and reproducible for a given source', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(items, seeded(7));
    const b = shuffle(items, seeded(7));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('buildBoard', () => {
  it('refuses a deck below the minimum', () => {
    expect(() => buildBoard([card(1), card(2)])).toThrow(/at least/);
  });

  it('deals a two-across board of ten tiles at most (D-066)', () => {
    expect(MAX_PAIRS).toBe(5);
  });

  it('deals two tiles per card, capped at MAX_PAIRS, every pair complete', () => {
    const deck = Array.from({ length: MAX_PAIRS + 3 }, (_, i) => card(i + 1));
    const board = buildBoard(deck, seeded(1));
    expect(board.tiles).toHaveLength(MAX_PAIRS * 2);
    const byPair = new Map<number, string[]>();
    for (const tile of board.tiles) {
      byPair.set(tile.pairId, [...(byPair.get(tile.pairId) ?? []), tile.face]);
    }
    expect(byPair.size).toBe(MAX_PAIRS);
    for (const faces of byPair.values()) {
      expect([...faces].sort()).toEqual(['answer', 'cue']);
    }
    expect(board.revealed).toEqual([]);
    expect(board.matched).toEqual([]);
    expect(board.moves).toBe(0);
    expect(isWon(board)).toBe(false);
  });

  it('uses exactly the minimum deck when that is all there is', () => {
    const board = buildBoard([card(1), card(2), card(3)], seeded(3));
    expect(board.tiles).toHaveLength(MIN_PAIRS * 2);
  });
});

describe('applyFlip', () => {
  const deck = [card(1), card(2), card(3)];

  function tileIds(board: ReturnType<typeof buildBoard>, pairId: number) {
    return board.tiles.filter((t) => t.pairId === pairId).map((t) => t.id);
  }

  it('reveals one tile, then matches a true pair and clears the reveal', () => {
    let board = buildBoard(deck, seeded(11));
    const [a, b] = tileIds(board, 0);
    board = applyFlip(board, a);
    expect(board.revealed).toEqual([a]);
    expect(board.moves).toBe(0);
    board = applyFlip(board, b);
    expect(board.revealed).toEqual([]);
    expect(board.matched).toEqual([0]);
    expect(board.moves).toBe(1);
    expect(isFaceUp(board, board.tiles.find((t) => t.id === a)!)).toBe(true);
  });

  it('holds a mismatch face up until hidden, ignoring flips meanwhile', () => {
    let board = buildBoard(deck, seeded(5));
    const [a] = tileIds(board, 0);
    const [c] = tileIds(board, 1);
    const [e] = tileIds(board, 2);
    board = applyFlip(applyFlip(board, a), c);
    expect(board.mismatch).toBe(true);
    expect(board.revealed).toEqual([a, c]);
    expect(board.moves).toBe(1);
    expect(applyFlip(board, e)).toBe(board);
    board = hideMismatch(board);
    expect(board.mismatch).toBe(false);
    expect(board.revealed).toEqual([]);
    expect(board.matched).toEqual([]);
  });

  it('ignores re-flipping a shown tile or a matched tile', () => {
    let board = buildBoard(deck, seeded(9));
    const [a, b] = tileIds(board, 0);
    board = applyFlip(board, a);
    expect(applyFlip(board, a)).toBe(board);
    board = applyFlip(board, b);
    expect(applyFlip(board, a)).toBe(board);
  });

  it('is won when every pair is matched', () => {
    let board = buildBoard(deck, seeded(2));
    for (let pairId = 0; pairId < MIN_PAIRS; pairId += 1) {
      const [a, b] = tileIds(board, pairId);
      board = applyFlip(applyFlip(board, a), b);
    }
    expect(isWon(board)).toBe(true);
    expect(board.moves).toBe(MIN_PAIRS);
  });
});

describe('deckOverlap', () => {
  it('measures how much of the new deck repeats the old one', () => {
    const previous = [card(1), card(2), card(3), card(4)];
    expect(deckOverlap(previous, [card(1), card(2), card(5), card(6)])).toBe(0.5);
    expect(deckOverlap(previous, [{ front: 'cue 1', back: 'x' }])).toBe(1);
    expect(deckOverlap(previous, [card(7)])).toBe(0);
    expect(deckOverlap(previous, [])).toBe(1);
  });
});

describe('formatClock', () => {
  it('reads like a stopwatch and never goes negative', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(750)).toBe('12:30');
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('betterResult', () => {
  const slow = { seconds: 40, turns: 9, pairs: 5 };
  const quick = { seconds: 31, turns: 12, pairs: 5 };
  const quickFewerTurns = { seconds: 31, turns: 8, pairs: 5 };

  it('takes the first clear as the record', () => {
    expect(betterResult(null, slow)).toBe(slow);
  });

  it('prefers fewer seconds, whatever the turn count', () => {
    expect(betterResult(slow, quick)).toBe(quick);
    expect(betterResult(quick, slow)).toBe(quick);
  });

  it('breaks a tie on time by fewer turns and keeps the holder otherwise', () => {
    expect(betterResult(quick, quickFewerTurns)).toBe(quickFewerTurns);
    expect(betterResult(quickFewerTurns, quick)).toBe(quickFewerTurns);
    expect(betterResult(quick, { ...quick })).toBe(quick);
  });
});
