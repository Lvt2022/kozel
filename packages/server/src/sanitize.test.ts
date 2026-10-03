import { createInitialGameState, declareKozel, getValidCards, playCard, resolveTrick, startNewRound } from '@kozel/shared';
import { createSeededRng } from '@kozel/shared';
import { describe, expect, it } from 'vitest';
import { sanitizeStateForViewer } from './sanitize.js';

function makePlayers() {
  return [
    { id: 'p0', name: 'Hráč 0', isBot: false },
    { id: 'p1', name: 'Hráč 1', isBot: false },
    { id: 'p2', name: 'Hráč 2', isBot: false },
    { id: 'p3', name: 'Hráč 3', isBot: false },
  ];
}

describe('sanitizeStateForViewer', () => {
  it('reveals only the viewer\'s own hand', () => {
    const state = startNewRound(createInitialGameState(makePlayers(), 0), createSeededRng(1));
    const view = sanitizeStateForViewer(state, 2);

    expect(view.players[2]!.hand).toHaveLength(8);
    expect(view.players[0]!.hand).toBeNull();
    expect(view.players[1]!.hand).toBeNull();
    expect(view.players[3]!.hand).toBeNull();
    // Hand sizes are still visible even when hidden, for UI purposes.
    expect(view.players[0]!.handCount).toBe(8);
  });

  it('hides the Kozel holder identity until declared', () => {
    const state = startNewRound(createInitialGameState(makePlayers(), 0), createSeededRng(1));
    const otherSeat = (state.kozelPlayerIndex! + 1) % 4;

    const viewOther = sanitizeStateForViewer(state, otherSeat);
    expect(viewOther.kozelPlayerIndex).toBeNull();

    const viewSelf = sanitizeStateForViewer(state, state.kozelPlayerIndex!);
    expect(viewSelf.kozelPlayerIndex).toBe(state.kozelPlayerIndex);
  });

  it('reveals the Kozel holder to everyone once declared', () => {
    const round = startNewRound(createInitialGameState(makePlayers(), 0), createSeededRng(1));
    const declared = declareKozel(round, round.kozelPlayerIndex!, true);
    const otherSeat = (declared.kozelPlayerIndex! + 1) % 4;

    const view = sanitizeStateForViewer(declared, otherSeat);
    expect(view.kozelPlayerIndex).toBe(declared.kozelPlayerIndex);
  });

  it('reveals only the viewer\'s own captured tricks', () => {
    const round = startNewRound(createInitialGameState(makePlayers(), 0), createSeededRng(1));
    let state = declareKozel(round, round.kozelPlayerIndex!, false);
    // Play one full trick so somebody has a captured trick to look back on.
    for (let i = 0; i < 4; i++) {
      const card = getValidCards(state, state.turnIndex)[0]!;
      state = playCard(state, state.turnIndex, card);
    }
    state = resolveTrick(state);
    const winnerSeat = state.players.findIndex((p) => p.captured.length > 0);
    expect(winnerSeat).toBeGreaterThanOrEqual(0);

    const ownView = sanitizeStateForViewer(state, winnerSeat);
    expect(ownView.players[winnerSeat]!.captured).toHaveLength(1);
    expect(ownView.players[winnerSeat]!.captured![0]).toHaveLength(4);

    const otherSeat = (winnerSeat + 1) % 4;
    const otherView = sanitizeStateForViewer(state, otherSeat);
    expect(otherView.players[winnerSeat]!.captured).toBeNull();
    expect(otherView.players[winnerSeat]!.capturedCount).toBe(4);
  });

  it('includes the Kozel declaration deadline for everyone', () => {
    const state = startNewRound(createInitialGameState(makePlayers(), 0), createSeededRng(1));
    const otherSeat = (state.kozelPlayerIndex! + 1) % 4;
    const view = sanitizeStateForViewer(state, otherSeat);
    expect(view.kozelDeclarationDeadline).toBe(state.kozelDeclarationDeadline);
    expect(view.kozelDeclarationDeadline).not.toBeNull();
  });

  describe('round score visibility and trick counts', () => {
    function stateWithOneTrickWon() {
      const round = startNewRound(createInitialGameState(makePlayers(), 0), createSeededRng(1));
      let state = declareKozel(round, round.kozelPlayerIndex!, false);
      for (let i = 0; i < 4; i++) {
        const card = getValidCards(state, state.turnIndex)[0]!;
        state = playCard(state, state.turnIndex, card);
      }
      return resolveTrick(state);
    }

    it('hides the live round score on HARD difficulty while a round is in progress', () => {
      const state = stateWithOneTrickWon();
      const view = sanitizeStateForViewer(state, 0, [], 'HARD');
      for (const p of view.players) expect(p.roundScore).toBeNull();
    });

    it('reveals the live round score on EASY difficulty while a round is in progress', () => {
      const state = stateWithOneTrickWon();
      const view = sanitizeStateForViewer(state, 0, [], 'EASY');
      const winnerSeat = state.players.findIndex((p) => p.captured.length > 0);
      expect(view.players[winnerSeat]!.roundScore).not.toBeNull();
    });

    it('always exposes each player\'s trick-won count, regardless of difficulty', () => {
      const state = stateWithOneTrickWon();
      const winnerSeat = state.players.findIndex((p) => p.captured.length > 0);
      const view = sanitizeStateForViewer(state, (winnerSeat + 1) % 4, [], 'HARD');
      expect(view.players[winnerSeat]!.tricksWon).toBe(1);
    });
  });
});
