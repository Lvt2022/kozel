import type { Difficulty, GameState } from '@kozel/shared';

export type { ClientGameState, ClientPlayerView, Difficulty, RoomPublicView, RoomStatus, RoomSummary, SeatPublicView } from '@kozel/shared';

export interface SeatPlayer {
  playerId: string;
  socketId: string;
  name: string;
  isBot: boolean;
  connected: boolean;
}

export interface RoomData {
  id: string;
  name: string;
  seats: Array<SeatPlayer | null>;
  state: GameState | null;
  createdAt: number;
  difficulty: Difficulty;
}
