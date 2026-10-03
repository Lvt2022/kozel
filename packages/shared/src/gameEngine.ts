import { Card, Suit, cardPoints, cardsEqual, createDeck, isHigherRank, isKozel } from './cards.js';
import { Rng, shuffle } from './rng.js';

export const PLAYER_COUNT = 4;
export const TRICKS_PER_ROUND = 8;
export const WINNING_SCORE = 100;
export const KOZEL_DECLARATION_TIMEOUT_MS = 15000;

export type GamePhase =
  | 'WAITING'
  | 'DECLARING_KOZEL'
  | 'PLAYING_TRICK'
  | 'ROUND_END'
  | 'GAME_OVER';

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  hand: Card[];
  /** Tricks this player has collected so far this round, each an array of the 4 played cards. */
  captured: Card[][];
  roundScore: number;
  totalScore: number;
}

export interface TrickEntry {
  playerIndex: number;
  card: Card;
}

/** One completed round's final score per player, indexed the same as GameState.players. */
export interface RoundHistoryEntry {
  roundNumber: number;
  multiplier: 1 | 2;
  scores: number[];
}

export interface GameState {
  phase: GamePhase;
  players: PlayerState[];
  dealerIndex: number;
  turnIndex: number;
  leadSuit: Suit | null;
  currentTrick: TrickEntry[];
  kozelPlayerIndex: number | null;
  isKozelDeclared: boolean;
  /** Epoch ms deadline by which the Kozel holder must decide; null outside the DECLARING_KOZEL phase. */
  kozelDeclarationDeadline: number | null;
  /**
   * Set once the 4th card of a trick is played, so the table can show who won it and on which
   * card before resolveTrick() clears currentTrick and starts the next one. Null the rest of
   * the time.
   */
  trickWinnerIndex: number | null;
  multiplier: 1 | 2;
  roundNumber: number;
  tricksPlayedInRound: number;
  startingLeaderIndex: number;
  gameOver: boolean;
  losers: number[];
  /** True once a HEARTS card has been played in this round, allowing it to be led going forward. */
  heartsBroken: boolean;
  /** Final score of every completed round so far this game, oldest first. */
  roundHistory: RoundHistoryEntry[];
}

export function nextPlayerIndex(index: number): number {
  return (index + 1) % PLAYER_COUNT;
}

export function createInitialGameState(
  players: Array<{ id: string; name: string; isBot: boolean }>,
  dealerIndex: number
): GameState {
  if (players.length !== PLAYER_COUNT) {
    throw new Error(`Kozel requires exactly ${PLAYER_COUNT} players`);
  }
  return {
    phase: 'WAITING',
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      hand: [],
      captured: [],
      roundScore: 0,
      totalScore: 0,
    })),
    dealerIndex,
    turnIndex: dealerIndex,
    leadSuit: null,
    currentTrick: [],
    kozelPlayerIndex: null,
    isKozelDeclared: false,
    kozelDeclarationDeadline: null,
    trickWinnerIndex: null,
    multiplier: 1,
    roundNumber: 0,
    tricksPlayedInRound: 0,
    startingLeaderIndex: nextPlayerIndex(dealerIndex),
    gameOver: false,
    losers: [],
    heartsBroken: false,
    roundHistory: [],
  };
}

function deal(deck: Card[]): Card[][] {
  const hands: Card[][] = [[], [], [], []];
  deck.forEach((card, i) => {
    hands[i % PLAYER_COUNT]!.push(card);
  });
  return hands;
}

function findKozelHolder(hands: Card[][]): number {
  const idx = hands.findIndex((hand) => hand.some((card) => isKozel(card)));
  if (idx === -1) throw new Error('Kozel card missing from deck/hands');
  return idx;
}

/** Deals a fresh round. Must be called from WAITING or ROUND_END phase. */
export function startNewRound(state: GameState, rng: Rng = Math.random, now: number = Date.now()): GameState {
  if (state.phase !== 'WAITING' && state.phase !== 'ROUND_END') {
    throw new Error(`Cannot start a new round from phase ${state.phase}`);
  }
  const deck = shuffle(createDeck(), rng);
  const hands = deal(deck);
  const kozelPlayerIndex = findKozelHolder(hands);
  const startingLeaderIndex = nextPlayerIndex(state.dealerIndex);

  return {
    ...state,
    phase: 'DECLARING_KOZEL',
    players: state.players.map((p, i) => ({
      ...p,
      hand: hands[i]!,
      captured: [],
      roundScore: 0,
    })),
    turnIndex: kozelPlayerIndex,
    leadSuit: null,
    currentTrick: [],
    kozelPlayerIndex,
    isKozelDeclared: false,
    kozelDeclarationDeadline: now + KOZEL_DECLARATION_TIMEOUT_MS,
    trickWinnerIndex: null,
    multiplier: 1,
    roundNumber: state.roundNumber + 1,
    tricksPlayedInRound: 0,
    startingLeaderIndex,
    gameOver: false,
    losers: [],
    heartsBroken: false,
  };
}

export function declareKozel(state: GameState, playerIndex: number, declare: boolean): GameState {
  if (state.phase !== 'DECLARING_KOZEL') {
    throw new Error('Kozel can only be declared during the DECLARING_KOZEL phase');
  }
  if (playerIndex !== state.kozelPlayerIndex) {
    throw new Error('Only the player holding the Kozel may declare it');
  }
  return {
    ...state,
    phase: 'PLAYING_TRICK',
    isKozelDeclared: declare,
    kozelDeclarationDeadline: null,
    multiplier: declare ? 2 : 1,
    turnIndex: state.startingLeaderIndex,
    leadSuit: null,
  };
}

/**
 * Cards a player is allowed to play right now, enforcing the follow-suit rule and the
 * "hearts can't be led until broken" rule: a player may not lead with a HEARTS card until
 * one has already been discarded into some trick this round, unless HEARTS are all they have left.
 */
export function getValidCards(state: GameState, playerIndex: number): Card[] {
  const hand = state.players[playerIndex]!.hand;
  if (state.leadSuit === null) {
    if (state.heartsBroken) return hand;
    const nonHearts = hand.filter((c) => c.suit !== 'HEARTS');
    return nonHearts.length > 0 ? nonHearts : hand;
  }
  const followingSuit = hand.filter((c) => c.suit === state.leadSuit);
  return followingSuit.length > 0 ? followingSuit : hand;
}

function evaluateTrickWinner(trick: TrickEntry[], leadSuit: Suit): number {
  let winner = trick[0]!;
  for (const entry of trick.slice(1)) {
    if (entry.card.suit === leadSuit && isHigherRank(entry.card.rank, winner.card.rank)) {
      winner = entry;
    }
  }
  return winner.playerIndex;
}

function calculateRoundScores(players: PlayerState[], multiplier: 1 | 2): number[] {
  return players.map((p) => p.captured.flat().reduce((sum, c) => sum + cardPoints(c, multiplier), 0));
}

export function playCard(state: GameState, playerIndex: number, card: Card): GameState {
  if (state.phase !== 'PLAYING_TRICK') {
    throw new Error('Cards can only be played during the PLAYING_TRICK phase');
  }
  if (state.currentTrick.length >= PLAYER_COUNT) {
    throw new Error('Trick is already complete and waiting to be resolved');
  }
  if (state.turnIndex !== playerIndex) {
    throw new Error('It is not this player\'s turn');
  }
  const hand = state.players[playerIndex]!.hand;
  const inHand = hand.some((c) => cardsEqual(c, card));
  if (!inHand) {
    throw new Error('Player does not hold this card');
  }
  const validCards = getValidCards(state, playerIndex);
  if (!validCards.some((c) => cardsEqual(c, card))) {
    throw new Error('Player must follow the lead suit when possible');
  }

  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, hand: p.hand.filter((c) => !cardsEqual(c, card)) } : p
  );
  const currentTrick: TrickEntry[] = [...state.currentTrick, { playerIndex, card }];
  const leadSuit = state.leadSuit ?? card.suit;
  const heartsBroken = state.heartsBroken || card.suit === 'HEARTS';

  if (currentTrick.length < PLAYER_COUNT) {
    return {
      ...state,
      players,
      currentTrick,
      leadSuit,
      heartsBroken,
      turnIndex: nextPlayerIndex(playerIndex),
    };
  }

  // Trick complete: hold it on the table (all 4 cards stay visible, winner marked) so players
  // can see who won it and on which card. resolveTrick() clears it and starts the next trick.
  const winnerIndex = evaluateTrickWinner(currentTrick, leadSuit);
  return {
    ...state,
    players,
    currentTrick,
    leadSuit,
    heartsBroken,
    turnIndex: winnerIndex,
    trickWinnerIndex: winnerIndex,
  };
}

/** Clears a completed trick (see playCard), awarding it to its winner and starting the next trick or round-end. */
export function resolveTrick(state: GameState): GameState {
  if (state.currentTrick.length !== PLAYER_COUNT || state.trickWinnerIndex === null) {
    throw new Error('No completed trick waiting to be resolved');
  }
  const winnerIndex = state.trickWinnerIndex;
  const wonCards = state.currentTrick.map((t) => t.card);
  const playersAfterTrick = state.players.map((p, i) =>
    i === winnerIndex ? { ...p, captured: [...p.captured, wonCards] } : p
  );
  const tricksPlayedInRound = state.tricksPlayedInRound + 1;

  if (tricksPlayedInRound < TRICKS_PER_ROUND) {
    return {
      ...state,
      players: playersAfterTrick,
      currentTrick: [],
      leadSuit: null,
      turnIndex: winnerIndex,
      trickWinnerIndex: null,
      tricksPlayedInRound,
    };
  }

  // 8th trick resolved: finalize the round.
  const roundScores = calculateRoundScores(playersAfterTrick, state.multiplier);
  const finalPlayers = playersAfterTrick.map((p, i) => ({
    ...p,
    roundScore: roundScores[i]!,
    totalScore: p.totalScore + roundScores[i]!,
  }));

  const maxRoundScore = Math.max(...roundScores);
  const newDealerIndex = roundScores.indexOf(maxRoundScore);

  const maxTotalScore = Math.max(...finalPlayers.map((p) => p.totalScore));
  const gameOver = maxTotalScore >= WINNING_SCORE;
  const losers = gameOver
    ? finalPlayers.reduce<number[]>((acc, p, i) => (p.totalScore === maxTotalScore ? [...acc, i] : acc), [])
    : [];

  const roundHistory = [
    ...state.roundHistory,
    { roundNumber: state.roundNumber, multiplier: state.multiplier, scores: roundScores },
  ];

  return {
    ...state,
    players: finalPlayers,
    currentTrick: [],
    leadSuit: null,
    turnIndex: winnerIndex,
    trickWinnerIndex: null,
    tricksPlayedInRound,
    dealerIndex: newDealerIndex,
    phase: gameOver ? 'GAME_OVER' : 'ROUND_END',
    gameOver,
    losers,
    roundHistory,
  };
}

/** Number of povinné mečení for a losing player, per spec section 5. */
export function meckCount(totalScore: number): number {
  return Math.max(0, totalScore - WINNING_SCORE);
}
