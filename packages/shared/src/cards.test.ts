import { describe, expect, it } from 'vitest';
import { cardId, cardPoints, createDeck, isHigherRank, isKozel } from './cards.js';

describe('createDeck', () => {
  it('contains exactly 32 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(32);
    const ids = new Set(deck.map(cardId));
    expect(ids.size).toBe(32);
  });

  it('contains exactly 4 suits of 8 ranks each', () => {
    const deck = createDeck();
    const bySuit = new Map<string, number>();
    for (const card of deck) {
      bySuit.set(card.suit, (bySuit.get(card.suit) ?? 0) + 1);
    }
    expect(bySuit.size).toBe(4);
    for (const count of bySuit.values()) expect(count).toBe(8);
  });
});

describe('isKozel', () => {
  it('identifies only the green (LEAVES) queen as Kozel', () => {
    expect(isKozel({ suit: 'LEAVES', rank: 'Q' })).toBe(true);
    expect(isKozel({ suit: 'HEARTS', rank: 'Q' })).toBe(false);
    expect(isKozel({ suit: 'LEAVES', rank: 'K' })).toBe(false);
  });
});

describe('isHigherRank', () => {
  it('orders ranks from 7 (low) to A (high)', () => {
    expect(isHigherRank('A', '7')).toBe(true);
    expect(isHigherRank('7', 'A')).toBe(false);
    expect(isHigherRank('J', '10')).toBe(true);
    expect(isHigherRank('Q', 'J')).toBe(true);
    expect(isHigherRank('K', 'Q')).toBe(true);
  });
});

describe('cardPoints', () => {
  it('scores a standard round at 1x: hearts=1, kozel=12, everything else=0', () => {
    expect(cardPoints({ suit: 'HEARTS', rank: '7' }, 1)).toBe(1);
    expect(cardPoints({ suit: 'HEARTS', rank: 'A' }, 1)).toBe(1);
    expect(cardPoints({ suit: 'LEAVES', rank: 'Q' }, 1)).toBe(12);
    expect(cardPoints({ suit: 'BELLS', rank: 'A' }, 1)).toBe(0);
    expect(cardPoints({ suit: 'ACORNS', rank: 'K' }, 1)).toBe(0);
    expect(cardPoints({ suit: 'LEAVES', rank: 'A' }, 1)).toBe(0);
  });

  it('doubles everything when Kozel is declared (2x)', () => {
    expect(cardPoints({ suit: 'HEARTS', rank: '7' }, 2)).toBe(2);
    expect(cardPoints({ suit: 'LEAVES', rank: 'Q' }, 2)).toBe(24);
    expect(cardPoints({ suit: 'BELLS', rank: 'A' }, 2)).toBe(0);
  });

  it('matches the spec total of 20 (1x) / 40 (2x) points in the deck', () => {
    const deck = createDeck();
    const total1x = deck.reduce((sum, c) => sum + cardPoints(c, 1), 0);
    const total2x = deck.reduce((sum, c) => sum + cardPoints(c, 2), 0);
    expect(total1x).toBe(20);
    expect(total2x).toBe(40);
  });
});
