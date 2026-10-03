import {
  Card,
  createInitialGameState,
  declareKozel as engineDeclareKozel,
  playCard as enginePlayCard,
  resolveTrick as engineResolveTrick,
  startNewRound,
} from '@kozel/shared';
import type { Difficulty, RoomData, RoomPublicView, RoomStatus, RoomSummary, SeatPlayer } from './types.js';

const MAX_PLAYERS = 4;

export class RoomManagerError extends Error {}

function roomStatus(room: RoomData): RoomStatus {
  if (!room.state) return 'LOBBY';
  if (room.state.phase === 'GAME_OVER') return 'FINISHED';
  return 'IN_PROGRESS';
}

export function toRoomSummary(room: RoomData): RoomSummary {
  return {
    id: room.id,
    name: room.name,
    playerCount: room.seats.filter((s) => s !== null).length,
    maxPlayers: MAX_PLAYERS,
    status: roomStatus(room),
    difficulty: room.difficulty,
  };
}

export function toRoomPublicView(room: RoomData): RoomPublicView {
  return {
    id: room.id,
    name: room.name,
    status: roomStatus(room),
    seats: room.seats.map((seat, seatIndex) => ({
      seatIndex,
      name: seat?.name ?? null,
      isBot: seat?.isBot ?? false,
      occupied: seat !== null,
    })),
  };
}

export class RoomManager {
  private rooms = new Map<string, RoomData>();

  listRooms(): RoomSummary[] {
    return [...this.rooms.values()]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(toRoomSummary);
  }

  getRoom(roomId: string): RoomData | undefined {
    return this.rooms.get(roomId);
  }

  createRoom(
    name: string,
    creator: { playerId: string; socketId: string; name: string },
    difficulty: Difficulty = 'HARD'
  ): RoomData {
    const id = crypto.randomUUID();
    const seats: Array<SeatPlayer | null> = [null, null, null, null];
    seats[0] = { playerId: creator.playerId, socketId: creator.socketId, name: creator.name, isBot: false, connected: true };
    const room: RoomData = { id, name, seats, state: null, createdAt: Date.now(), difficulty };
    this.rooms.set(id, room);
    return room;
  }

  joinRoom(roomId: string, player: { playerId: string; socketId: string; name: string }): { room: RoomData; seatIndex: number } {
    const room = this.requireRoom(roomId);

    // A player already seated here (even if the game is in progress) is reconnecting, not joining fresh.
    const existingSeatIndex = room.seats.findIndex((s) => s?.playerId === player.playerId);
    if (existingSeatIndex !== -1) {
      room.seats[existingSeatIndex] = {
        ...room.seats[existingSeatIndex]!,
        socketId: player.socketId,
        connected: true,
      };
      return { room, seatIndex: existingSeatIndex };
    }

    if (room.state) throw new RoomManagerError('Hra v této místnosti již probíhá');

    const freeSeatIndex = room.seats.findIndex((s) => s === null);
    if (freeSeatIndex === -1) throw new RoomManagerError('Místnost je plná');

    room.seats[freeSeatIndex] = {
      playerId: player.playerId,
      socketId: player.socketId,
      name: player.name,
      isBot: false,
      connected: true,
    };
    return { room, seatIndex: freeSeatIndex };
  }

  /** Only the player seated at index 0 (the room's founder) may add bots, and only before the game starts. */
  addBot(roomId: string, requesterPlayerId: string): RoomData {
    const room = this.requireRoom(roomId);
    if (room.state) throw new RoomManagerError('Do rozehrané hry už nelze přidávat hráče');
    if (room.seats[0]?.playerId !== requesterPlayerId) {
      throw new RoomManagerError('Pouze zakladatel místnosti může přidávat AI hráče');
    }
    const freeSeatIndex = room.seats.findIndex((s) => s === null);
    if (freeSeatIndex === -1) throw new RoomManagerError('Místnost je plná');

    const botNumber = room.seats.filter((s) => s?.isBot).length + 1;
    room.seats[freeSeatIndex] = {
      playerId: `bot-${crypto.randomUUID()}`,
      socketId: '',
      name: `Bot ${botNumber}`,
      isBot: true,
      connected: true,
    };
    return room;
  }

  /**
   * Removes a player. If a game is in progress, their seat is handed to a bot instead of being
   * emptied, since an empty seat mid-game would freeze the table forever (nobody left to act on
   * that turn, and nobody left to click "next round"). A room with no humans left — all seats
   * either empty or bots — is pointless to keep around, so it is deleted instead.
   */
  leaveRoom(roomId: string, playerId: string): RoomData | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const seatIndex = room.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIndex === -1) return room;

    if (room.state) return this.convertSeatToBot(room, seatIndex);

    room.seats[seatIndex] = null;
    return this.deleteIfHumanless(room);
  }

  /** Keeps the seat reserved (does not remove the player) so they can reconnect into a game in progress. */
  markDisconnected(roomId: string, playerId: string): RoomData | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const seatIndex = room.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIndex === -1) return undefined;
    room.seats[seatIndex] = { ...room.seats[seatIndex]!, socketId: '', connected: false };
    return room;
  }

  /** Called once the reconnect grace period expires; hands the disconnected player's seat to a bot so the game can continue. */
  replaceDisconnectedWithBot(roomId: string, playerId: string): RoomData | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    const seatIndex = room.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIndex === -1) return undefined;
    const seat = room.seats[seatIndex]!;
    if (seat.connected) return undefined; // reconnected already; nothing to do

    return this.convertSeatToBot(room, seatIndex);
  }

  private convertSeatToBot(room: RoomData, seatIndex: number): RoomData | undefined {
    const seat = room.seats[seatIndex];
    if (!seat) return room;
    room.seats[seatIndex] = { ...seat, playerId: `bot-${crypto.randomUUID()}`, socketId: '', isBot: true, connected: true };
    if (room.state) {
      const statePlayer = room.state.players[seatIndex];
      if (statePlayer) statePlayer.isBot = true;
    }
    return this.deleteIfHumanless(room);
  }

  private deleteIfHumanless(room: RoomData): RoomData | undefined {
    const hasHuman = room.seats.some((s) => s !== null && !s.isBot);
    if (hasHuman) return room;
    this.rooms.delete(room.id);
    return undefined;
  }

  findRoomBySocketId(socketId: string): { room: RoomData; seatIndex: number } | undefined {
    for (const room of this.rooms.values()) {
      const seatIndex = room.seats.findIndex((s) => s?.socketId === socketId);
      if (seatIndex !== -1) return { room, seatIndex };
    }
    return undefined;
  }

  startGame(roomId: string): RoomData {
    const room = this.requireRoom(roomId);
    if (room.state) throw new RoomManagerError('Hra již byla zahájena');
    if (room.seats.some((s) => s === null)) {
      throw new RoomManagerError('Pro zahájení hry je potřeba 4 hráčů');
    }

    const players = room.seats.map((s) => ({ id: s!.playerId, name: s!.name, isBot: s!.isBot }));
    const dealerIndex = Math.floor(Math.random() * MAX_PLAYERS);
    const initial = createInitialGameState(players, dealerIndex);
    room.state = startNewRound(initial);
    return room;
  }

  startNextRound(roomId: string): RoomData {
    const room = this.requireRoom(roomId);
    if (!room.state || room.state.phase !== 'ROUND_END') {
      throw new RoomManagerError('Další kolo lze zahájit až po skončení předchozího');
    }
    room.state = startNewRound(room.state);
    return room;
  }

  declareKozel(roomId: string, playerId: string, declare: boolean): RoomData {
    const room = this.requireRoomInProgress(roomId);
    const seatIndex = this.requireSeatIndex(room, playerId);
    room.state = engineDeclareKozel(room.state!, seatIndex, declare);
    return room;
  }

  playCard(roomId: string, playerId: string, card: Card): RoomData {
    const room = this.requireRoomInProgress(roomId);
    const seatIndex = this.requireSeatIndex(room, playerId);
    room.state = enginePlayCard(room.state!, seatIndex, card);
    return room;
  }

  /** Clears a completed trick once its reveal period has elapsed (see socketServer's scheduleTrickResolution). */
  resolveTrick(roomId: string): RoomData {
    const room = this.requireRoomInProgress(roomId);
    room.state = engineResolveTrick(room.state!);
    return room;
  }

  private requireRoom(roomId: string): RoomData {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomManagerError('Místnost nenalezena');
    return room;
  }

  private requireRoomInProgress(roomId: string): RoomData {
    const room = this.requireRoom(roomId);
    if (!room.state) throw new RoomManagerError('Hra v této místnosti ještě nezačala');
    return room;
  }

  private requireSeatIndex(room: RoomData, playerId: string): number {
    const seatIndex = room.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIndex === -1) throw new RoomManagerError('Hráč není členem této místnosti');
    return seatIndex;
  }
}
