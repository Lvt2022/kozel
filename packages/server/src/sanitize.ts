import { cardPoints, type GameState } from '@kozel/shared';
import type { ClientGameState, ClientPlayerView, Difficulty, SeatPlayer } from './types.js';

/**
 * Produces a per-viewer view of the game state: only the viewer's own hand is
 * revealed, and the Kozel holder's identity stays hidden unless it was declared
 * (or the viewer is the Kozel holder themself).
 */
export function sanitizeStateForViewer(
  state: GameState,
  viewerSeatIndex: number,
  seats: Array<SeatPlayer | null> = [],
  difficulty: Difficulty = 'HARD'
): ClientGameState {
  const revealKozelHolder = state.isKozelDeclared || state.kozelPlayerIndex === viewerSeatIndex;
  // The running round score is only a spoiler while the round is still live; once it has ended
  // there is nothing left to hide, so reveal it regardless of difficulty.
  const revealRoundScore = difficulty === 'EASY' || state.phase === 'ROUND_END' || state.phase === 'GAME_OVER';

  const players: ClientPlayerView[] = state.players.map((p, seatIndex) => {
    const liveRoundScore =
      state.phase === 'ROUND_END' || state.phase === 'GAME_OVER'
        ? p.roundScore
        : p.captured.flat().reduce((sum, c) => sum + cardPoints(c, state.multiplier), 0);
    return {
      seatIndex,
      name: p.name,
      isBot: p.isBot,
      connected: seats[seatIndex]?.connected ?? true,
      hand: seatIndex === viewerSeatIndex ? p.hand : null,
      handCount: p.hand.length,
      captured: seatIndex === viewerSeatIndex ? p.captured : null,
      capturedCount: p.captured.flat().length,
      tricksWon: p.captured.length,
      roundScore: revealRoundScore ? liveRoundScore : null,
      totalScore: p.totalScore,
    };
  });

  return {
    phase: state.phase,
    difficulty,
    viewerSeatIndex,
    dealerIndex: state.dealerIndex,
    turnIndex: state.turnIndex,
    leadSuit: state.leadSuit,
    heartsBroken: state.heartsBroken,
    currentTrick: state.currentTrick,
    kozelPlayerIndex: revealKozelHolder ? state.kozelPlayerIndex : null,
    isKozelDeclared: state.isKozelDeclared,
    kozelDeclarationDeadline: state.kozelDeclarationDeadline,
    trickWinnerIndex: state.trickWinnerIndex,
    multiplier: state.multiplier,
    roundNumber: state.roundNumber,
    tricksPlayedInRound: state.tricksPlayedInRound,
    gameOver: state.gameOver,
    losers: state.losers,
    players,
  };
}
