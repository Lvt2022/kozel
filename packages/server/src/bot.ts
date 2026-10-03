import type { Card } from '@kozel/shared';

/** Picks a uniformly random card among the ones the bot is allowed to play. */
export function chooseBotCard(validCards: Card[]): Card {
  if (validCards.length === 0) throw new Error('No valid cards to choose from');
  const index = Math.floor(Math.random() * validCards.length);
  return validCards[index]!;
}

/** Simple heuristic: a bot declares the Kozel about half the time. */
export function chooseBotKozelDeclaration(): boolean {
  return Math.random() < 0.5;
}
