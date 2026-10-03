import { describe, expect, it } from 'vitest';
import { Card } from './cards.js';
import {
  GameState,
  createInitialGameState,
  declareKozel,
  getValidCards,
  meckCount,
  playCard,
  resolveTrick,
  startNewRound,
} from './gameEngine.js';
import { createSeededRng } from './rng.js';

function makePlayers() {
  return [
    { id: 'p0', name: 'Hráč 0', isBot: false },
    { id: 'p1', name: 'Hráč 1', isBot: false },
    { id: 'p2', name: 'Hráč 2', isBot: false },
    { id: 'p3', name: 'Hráč 3', isBot: false },
  ];
}

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });

describe('startNewRound', () => {
  it('deals 8 cards to each player and finds the Kozel holder', () => {
    const state = createInitialGameState(makePlayers(), 0);
    const round = startNewRound(state, createSeededRng(42));

    expect(round.phase).toBe('DECLARING_KOZEL');
    for (const p of round.players) expect(p.hand).toHaveLength(8);

    const kozelHolder = round.players[round.kozelPlayerIndex!]!;
    expect(kozelHolder.hand.some((card) => card.suit === 'LEAVES' && card.rank === 'Q')).toBe(true);
    expect(round.turnIndex).toBe(round.kozelPlayerIndex);
    expect(round.startingLeaderIndex).toBe(1); // left of dealer (index 0)
  });

  it('sets a 15s Kozel declaration deadline, visible to all players', () => {
    const state = createInitialGameState(makePlayers(), 0);
    const round = startNewRound(state, createSeededRng(42), 1_000_000);
    expect(round.kozelDeclarationDeadline).toBe(1_000_000 + 15000);
  });

  it('deals all 32 unique cards across the 4 hands', () => {
    const state = createInitialGameState(makePlayers(), 0);
    const round = startNewRound(state, createSeededRng(7));
    const allCards = round.players.flatMap((p) => p.hand);
    expect(allCards).toHaveLength(32);
    const ids = new Set(allCards.map((card) => `${card.suit}-${card.rank}`));
    expect(ids.size).toBe(32);
  });
});

describe('declareKozel', () => {
  function roundState(): GameState {
    const state = createInitialGameState(makePlayers(), 0);
    return startNewRound(state, createSeededRng(1));
  }

  it('rejects declaration from a player who does not hold the Kozel', () => {
    const state = roundState();
    const otherPlayer = (state.kozelPlayerIndex! + 1) % 4;
    expect(() => declareKozel(state, otherPlayer, true)).toThrow();
  });

  it('sets a 2x multiplier when declared, 1x when hidden', () => {
    const state = roundState();
    const declared = declareKozel(state, state.kozelPlayerIndex!, true);
    expect(declared.multiplier).toBe(2);
    expect(declared.isKozelDeclared).toBe(true);
    expect(declared.phase).toBe('PLAYING_TRICK');
    expect(declared.turnIndex).toBe(declared.startingLeaderIndex);

    const hidden = declareKozel(state, state.kozelPlayerIndex!, false);
    expect(hidden.multiplier).toBe(1);
    expect(hidden.isKozelDeclared).toBe(false);
  });

  it('clears the declaration deadline once a decision is made', () => {
    const state = roundState();
    expect(state.kozelDeclarationDeadline).not.toBeNull();
    const declared = declareKozel(state, state.kozelPlayerIndex!, true);
    expect(declared.kozelDeclarationDeadline).toBeNull();
  });
});

describe('trick play: follow-suit and winner evaluation', () => {
  function baseState(): GameState {
    const state = createInitialGameState(makePlayers(), 0);
    const round = startNewRound(state, createSeededRng(1));
    const declared = declareKozel(round, round.kozelPlayerIndex!, false);
    // Override hands with a controlled scenario for deterministic trick testing.
    return {
      ...declared,
      turnIndex: 0,
      leadSuit: null,
      currentTrick: [],
      heartsBroken: true, // this suite tests follow-suit/winner logic, not the hearts-lead rule
      players: declared.players.map((p, i) => {
        const hands: Card[][] = [
          [c('HEARTS', '9'), c('BELLS', '7')],
          [c('HEARTS', 'A'), c('ACORNS', '7')],
          [c('ACORNS', '8'), c('BELLS', '9')],
          [c('BELLS', 'K'), c('LEAVES', 'Q')],
        ];
        return { ...p, hand: hands[i]!, captured: [] };
      }),
    };
  }

  it('allows any card before a suit has been led', () => {
    const state = baseState();
    const valid = getValidCards(state, 2);
    expect(valid).toEqual(state.players[2]!.hand);
  });

  it('only cards of the lead suit can win the trick, even over higher off-suit cards', () => {
    let state = baseState();
    // Player 0 leads HEARTS 9.
    state = playCard(state, 0, c('HEARTS', '9'));
    expect(state.leadSuit).toBe('HEARTS');

    // Player 1 holds HEARTS A and must follow suit.
    const validForP1 = getValidCards(state, 1);
    expect(validForP1).toEqual([c('HEARTS', 'A')]);
    state = playCard(state, 1, c('HEARTS', 'A'));

    // Player 2 holds no HEARTS, may play anything -- plays ACORNS 8 (off-suit, cannot win).
    state = playCard(state, 2, c('ACORNS', '8'));

    // Player 3 holds no HEARTS either -- plays the Kozel, which still cannot win since off-suit.
    state = playCard(state, 3, c('LEAVES', 'Q'));

    // Trick complete but held: all 4 cards stay on the table with the winner marked, nothing
    // awarded yet.
    expect(state.currentTrick).toHaveLength(4);
    expect(state.turnIndex).toBe(1);
    expect(state.trickWinnerIndex).toBe(1);
    expect(state.players[1]!.captured).toHaveLength(0);
    expect(() => playCard(state, 1, c('ACORNS', '7'))).toThrow(); // nobody can act while a trick is held

    // Resolving it: HEARTS A was the highest HEARTS card, so player 1 wins despite the Kozel being played.
    state = resolveTrick(state);
    expect(state.currentTrick).toEqual([]);
    expect(state.trickWinnerIndex).toBeNull();
    expect(state.turnIndex).toBe(1);
    expect(state.players[1]!.captured).toHaveLength(1); // one trick won so far
    expect(state.players[1]!.captured[0]).toHaveLength(4);
    expect(state.players[1]!.captured.flat().some((card) => card.suit === 'LEAVES' && card.rank === 'Q')).toBe(true);
  });

  it('rejects playing out of turn', () => {
    const state = baseState();
    expect(() => playCard(state, 1, c('HEARTS', 'A'))).toThrow();
  });

  it('rejects a card that does not follow suit when the player is able to', () => {
    let state = baseState();
    state = playCard(state, 0, c('HEARTS', '9'));
    expect(() => playCard(state, 1, c('ACORNS', '7'))).toThrow();
  });
});

describe('hearts cannot be led until broken', () => {
  function heartsState(): GameState {
    const state = createInitialGameState(makePlayers(), 0);
    const round = startNewRound(state, createSeededRng(1));
    const declared = declareKozel(round, round.kozelPlayerIndex!, false);
    return {
      ...declared,
      turnIndex: 0,
      leadSuit: null,
      currentTrick: [],
      heartsBroken: false,
      players: declared.players.map((p, i) => {
        const hands: Card[][] = [
          [c('HEARTS', '9'), c('BELLS', '7')],
          [c('HEARTS', 'A'), c('ACORNS', '7')],
          [c('ACORNS', '8'), c('BELLS', '9')],
          [c('BELLS', 'K'), c('LEAVES', 'Q')],
        ];
        return { ...p, hand: hands[i]!, captured: [] };
      }),
    };
  }

  it('excludes HEARTS from the leader\'s valid cards while hearts are unbroken', () => {
    const state = heartsState();
    const valid = getValidCards(state, 0);
    expect(valid).toEqual([c('BELLS', '7')]);
  });

  it('rejects leading a HEARTS card before it has been broken', () => {
    const state = heartsState();
    expect(() => playCard(state, 0, c('HEARTS', '9'))).toThrow();
  });

  it('sets heartsBroken once a HEARTS card is discarded off-suit mid-trick', () => {
    let state = heartsState();
    // Player 0 leads BELLS 7 (their only non-HEARTS card).
    state = playCard(state, 0, c('BELLS', '7'));
    expect(state.heartsBroken).toBe(false);
    // Player 1 holds no BELLS, so may legally discard their HEARTS A -- this breaks hearts.
    state = playCard(state, 1, c('HEARTS', 'A'));
    expect(state.heartsBroken).toBe(true);
  });

  it('allows leading HEARTS once hearts have been broken, even with other suits in hand', () => {
    const state: GameState = { ...heartsState(), heartsBroken: true };
    const valid = getValidCards(state, 0);
    expect(valid).toEqual(state.players[0]!.hand);
    expect(() => playCard(state, 0, c('HEARTS', '9'))).not.toThrow();
  });

  it('allows leading HEARTS when it is the only suit left in hand', () => {
    const state: GameState = {
      ...heartsState(),
      turnIndex: 0,
      players: heartsState().players.map((p, i) => (i === 0 ? { ...p, hand: [c('HEARTS', '9')] } : p)),
    };
    const valid = getValidCards(state, 0);
    expect(valid).toEqual([c('HEARTS', '9')]);
    expect(() => playCard(state, 0, c('HEARTS', '9'))).not.toThrow();
  });
});

describe('full round scoring and dealer rotation', () => {
  function suitSweepState(declareKozelFlag: boolean): GameState {
    const state = createInitialGameState(makePlayers(), 0);
    const round = startNewRound(state, createSeededRng(1));
    const kozelHolderIndex = round.players.findIndex((p) =>
      p.hand.some((card) => card.suit === 'LEAVES' && card.rank === 'Q')
    );
    const declared = declareKozel(round, kozelHolderIndex, declareKozelFlag);

    // Give each player a full suit so player 0 (all HEARTS) wins every trick.
    const ranks: Card['rank'][] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const hands: Card[][] = [
      ranks.map((r) => c('HEARTS', r)),
      ranks.map((r) => c('BELLS', r)),
      ranks.map((r) => c('ACORNS', r)),
      ranks.map((r) => c('LEAVES', r)),
    ];

    return {
      ...declared,
      dealerIndex: 0,
      turnIndex: 0,
      leadSuit: null,
      currentTrick: [],
      tricksPlayedInRound: 0,
      players: declared.players.map((p, i) => ({ ...p, hand: hands[i]!, captured: [] })),
    };
  }

  function playFullRound(initial: GameState): GameState {
    let state = initial;
    for (let trick = 0; trick < 8; trick++) {
      const leader = state.turnIndex;
      for (let step = 0; step < 4; step++) {
        const player = (leader + step) % 4;
        const [cardToPlay] = getValidCards(state, player).length
          ? getValidCards(state, player)
          : state.players[player]!.hand;
        state = playCard(state, player, cardToPlay ?? state.players[player]!.hand[0]!);
      }
      state = resolveTrick(state);
    }
    return state;
  }

  it('awards all 20 points to the sole Hearts holder at 1x and rotates the dealer to the winner', () => {
    const final = playFullRound(suitSweepState(false));
    expect(final.phase).toBe('ROUND_END');
    expect(final.players[0]!.roundScore).toBe(20);
    expect(final.players[0]!.totalScore).toBe(20);
    expect(final.players[1]!.roundScore).toBe(0);
    expect(final.dealerIndex).toBe(0);
    expect(final.gameOver).toBe(false);
  });

  it('doubles the round to 40 points when the Kozel is declared', () => {
    const final = playFullRound(suitSweepState(true));
    expect(final.players[0]!.roundScore).toBe(40);
    expect(final.players[0]!.totalScore).toBe(40);
  });

  it('ends the game once a player reaches 100 points and identifies the loser', () => {
    let state = suitSweepState(false);
    state = { ...state, players: state.players.map((p, i) => (i === 0 ? { ...p, totalScore: 85 } : p)) };
    const final = playFullRound(state);
    expect(final.phase).toBe('GAME_OVER');
    expect(final.gameOver).toBe(true);
    expect(final.players[0]!.totalScore).toBe(105);
    expect(final.losers).toEqual([0]);
  });

  it('declares a tie when multiple players share the top losing score', () => {
    let state = suitSweepState(false);
    // Player 0 will gain 20 points this round (80 -> 100); player 2 already sits at 100 and gains 0.
    state = {
      ...state,
      players: state.players.map((p, i) => {
        if (i === 0) return { ...p, totalScore: 80 };
        if (i === 2) return { ...p, totalScore: 100 };
        return p;
      }),
    };
    const final = playFullRound(state);
    expect(final.players[0]!.totalScore).toBe(100);
    expect(final.players[2]!.totalScore).toBe(100);
    expect(final.gameOver).toBe(true);
    expect(final.losers).toEqual([0, 2]);
  });
});

describe('meckCount', () => {
  it('is zero below or at the 100-point threshold', () => {
    expect(meckCount(80)).toBe(0);
    expect(meckCount(100)).toBe(0);
  });

  it('equals score minus 100 above the threshold', () => {
    expect(meckCount(104)).toBe(4);
    expect(meckCount(130)).toBe(30);
  });
});
