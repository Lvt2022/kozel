export type Suit = 'HEARTS' | 'BELLS' | 'ACORNS' | 'LEAVES';

export const SUITS: Suit[] = ['HEARTS', 'BELLS', 'ACORNS', 'LEAVES'];

export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export interface Card {
  suit: Suit;
  rank: Rank;
}

export function cardId(card: Card): string {
  return `${card.suit}-${card.rank}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank);
}

/** true if a beats b, assuming both are of the same (lead) suit */
export function isHigherRank(a: Rank, b: Rank): boolean {
  return rankValue(a) > rankValue(b);
}

export function isKozel(card: Card): boolean {
  return card.suit === 'LEAVES' && card.rank === 'Q';
}

export function isHeart(card: Card): boolean {
  return card.suit === 'HEARTS';
}

/** Penalty points for a single captured card, given the round's multiplier (1 or 2). */
export function cardPoints(card: Card, multiplier: 1 | 2): number {
  if (isKozel(card)) return 12 * multiplier;
  if (isHeart(card)) return 1 * multiplier;
  return 0;
}
