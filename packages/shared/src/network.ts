import type { Card, Suit } from './cards.js';
import type { GamePhase, RoundHistoryEntry, TrickEntry } from './gameEngine.js';

export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';

/**
 * EASY reveals each player's live running round score (captured penalty points so far);
 * HARD hides it until the round ends, so players must track their own score mentally.
 */
export type Difficulty = 'EASY' | 'HARD';

export interface RoomSummary {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  difficulty: Difficulty;
}

export interface SeatPublicView {
  seatIndex: number;
  name: string | null;
  isBot: boolean;
  occupied: boolean;
}

export interface RoomPublicView {
  id: string;
  name: string;
  status: RoomStatus;
  seats: SeatPublicView[];
}

/** Per-player view of a card, hidden unless it belongs to the viewer. */
export interface ClientPlayerView {
  seatIndex: number;
  name: string;
  isBot: boolean;
  connected: boolean;
  hand: Card[] | null;
  handCount: number;
  /** Tricks this player has collected this round; only populated for the viewer themself. */
  captured: Card[][] | null;
  capturedCount: number;
  /** Number of tricks won this round; always visible (face-down), regardless of difficulty. */
  tricksWon: number;
  /** Live running penalty points for this round; null when hidden by HARD difficulty (revealed once the round ends). */
  roundScore: number | null;
  totalScore: number;
}

export interface ClientGameState {
  phase: GamePhase;
  difficulty: Difficulty;
  viewerSeatIndex: number;
  dealerIndex: number;
  turnIndex: number;
  leadSuit: Suit | null;
  heartsBroken: boolean;
  currentTrick: TrickEntry[];
  kozelPlayerIndex: number | null;
  isKozelDeclared: boolean;
  kozelDeclarationDeadline: number | null;
  trickWinnerIndex: number | null;
  multiplier: 1 | 2;
  roundNumber: number;
  tricksPlayedInRound: number;
  gameOver: boolean;
  losers: number[];
  players: ClientPlayerView[];
  /** Final score of every completed round so far this game, oldest first. */
  roundHistory: RoundHistoryEntry[];
}

// eslint-disable-next-line @typescript-eslint/ban-types
export type AckResult<T extends object = {}> = ({ ok: true } & T) | { ok: false; error: string };
