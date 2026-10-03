import type { Card } from '@kozel/shared';
import { describe, expect, it } from 'vitest';
import { chooseBotCard, chooseBotKozelDeclaration } from './bot.js';

describe('chooseBotCard', () => {
  it('always picks a card from the provided valid list', () => {
    const validCards: Card[] = [
      { suit: 'HEARTS', rank: '7' },
      { suit: 'BELLS', rank: 'A' },
    ];
    for (let i = 0; i < 20; i++) {
      const chosen = chooseBotCard(validCards);
      expect(validCards).toContainEqual(chosen);
    }
  });

  it('throws when given no valid cards', () => {
    expect(() => chooseBotCard([])).toThrow();
  });
});

describe('chooseBotKozelDeclaration', () => {
  it('returns a boolean', () => {
    expect(typeof chooseBotKozelDeclaration()).toBe('boolean');
  });
});
