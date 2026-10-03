import { getValidCards, KOZEL_DECLARATION_TIMEOUT_MS, PLAYER_COUNT, type AckResult, type Card } from '@kozel/shared';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { chooseBotCard, chooseBotKozelDeclaration } from './bot.js';
import { RoomManager, RoomManagerError, toRoomPublicView } from './roomManager.js';
import { sanitizeStateForViewer } from './sanitize.js';
import type { RoomData } from './types.js';

// eslint-disable-next-line @typescript-eslint/ban-types
type Ack<T extends object = {}> = (result: AckResult<T>) => void;

const BOT_MOVE_DELAY_MS = 700;
const BOT_KOZEL_DECISION_DELAY_MS = 1200;
const RECONNECT_GRACE_MS = 60_000;
/** How long a completed trick stays on the table, winner highlighted, before the next one starts. */
const TRICK_RESOLVE_DELAY_MS = 2800;

interface SocketData {
  playerId?: string;
  roomId?: string;
}

function socketData(socket: Socket): SocketData {
  return socket.data as SocketData;
}

function errorMessage(err: unknown): string {
  if (err instanceof RoomManagerError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Neznámá chyba';
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, { cors: { origin: '*' } });
  const roomManager = new RoomManager();
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function disconnectTimerKey(roomId: string, playerId: string): string {
    return `${roomId}:${playerId}`;
  }

  function clearDisconnectTimer(roomId: string, playerId: string): void {
    const key = disconnectTimerKey(roomId, playerId);
    const timer = disconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(key);
    }
  }

  function broadcastLobby(): void {
    io.emit('lobby:rooms', roomManager.listRooms());
  }

  function broadcastGameState(room: RoomData): void {
    if (!room.state) return;
    room.seats.forEach((seat, seatIndex) => {
      if (!seat || seat.isBot) return;
      const view = sanitizeStateForViewer(room.state!, seatIndex, room.seats, room.difficulty);
      io.to(seat.socketId).emit('game:state', view);
    });
  }

  function broadcastRoom(room: RoomData): void {
    io.to(room.id).emit('room:update', toRoomPublicView(room));
    broadcastGameState(room);
    broadcastLobby();
    scheduleKozelResolution(room);
    scheduleTrickResolution(room);
    scheduleBotCardPlay(room);
  }

  /** Auto-resolves the Kozel declaration once its deadline passes (or sooner, for a bot holder). */
  function scheduleKozelResolution(room: RoomData): void {
    if (!room.state || room.state.phase !== 'DECLARING_KOZEL') return;
    const holderSeat = room.state.kozelPlayerIndex;
    const holder = holderSeat !== null ? room.seats[holderSeat] : null;
    if (!holder) return;
    const delay = holder.isBot ? BOT_KOZEL_DECISION_DELAY_MS : KOZEL_DECLARATION_TIMEOUT_MS;

    const timer = setTimeout(() => {
      const current = roomManager.getRoom(room.id);
      if (!current?.state || current.state.phase !== 'DECLARING_KOZEL') return;
      const currentHolderSeat = current.state.kozelPlayerIndex;
      const currentHolder = currentHolderSeat !== null ? current.seats[currentHolderSeat] : null;
      if (!currentHolder) return;
      const declare = currentHolder.isBot ? chooseBotKozelDeclaration() : false;
      try {
        const updated = roomManager.declareKozel(room.id, currentHolder.playerId, declare);
        broadcastRoom(updated);
      } catch {
        // Player already declared in the meantime; nothing to do.
      }
    }, delay);
    timer.unref?.();
  }

  /** Clears a completed trick after TRICK_RESOLVE_DELAY_MS so its winner stays visible for a beat. */
  function scheduleTrickResolution(room: RoomData): void {
    if (!room.state || room.state.phase !== 'PLAYING_TRICK') return;
    if (room.state.currentTrick.length < PLAYER_COUNT || room.state.trickWinnerIndex === null) return;
    // Identifies *this* held trick, so a stale duplicate timer (another broadcastRoom fired
    // during the hold, e.g. from a reconnect) can tell it's no longer looking at the same trick.
    const { roundNumber, tricksPlayedInRound } = room.state;

    const timer = setTimeout(() => {
      const current = roomManager.getRoom(room.id);
      if (!current?.state || current.state.currentTrick.length < PLAYER_COUNT || current.state.trickWinnerIndex === null) return;
      if (current.state.roundNumber !== roundNumber || current.state.tricksPlayedInRound !== tricksPlayedInRound) return;
      try {
        const updated = roomManager.resolveTrick(room.id);
        broadcastRoom(updated);
      } catch {
        // Already resolved somehow (e.g. room emptied); nothing to do.
      }
    }, TRICK_RESOLVE_DELAY_MS);
    timer.unref?.();
  }

  /** Lets a bot whose turn it is play a random valid card after a short, human-feeling delay. */
  function scheduleBotCardPlay(room: RoomData): void {
    if (!room.state || room.state.phase !== 'PLAYING_TRICK') return;
    // A completed trick is held on the table for scheduleTrickResolution to clear; nobody
    // (bot or human) can act again until that happens, even if the winner is a bot.
    if (room.state.currentTrick.length >= PLAYER_COUNT) return;
    const seat = room.seats[room.state.turnIndex];
    if (!seat?.isBot) return;

    const timer = setTimeout(() => {
      const current = roomManager.getRoom(room.id);
      if (!current?.state || current.state.phase !== 'PLAYING_TRICK') return;
      // The trick may have filled up (and the winner — possibly this very bot — be mid-hold)
      // since this timer was scheduled; nobody's hand has a card to play in that case.
      if (current.state.currentTrick.length >= PLAYER_COUNT) return;
      const seatNow = current.seats[current.state.turnIndex];
      if (!seatNow?.isBot) return;
      const hand = current.state.players[current.state.turnIndex]!.hand;
      const valid = getValidCards(current.state, current.state.turnIndex);
      const card = chooseBotCard(valid.length > 0 ? valid : hand);
      try {
        const updated = roomManager.playCard(room.id, seatNow.playerId, card);
        broadcastRoom(updated);
      } catch {
        // State moved on already (e.g. room emptied); nothing to do.
      }
    }, BOT_MOVE_DELAY_MS);
    timer.unref?.();
  }

  io.on('connection', (socket: Socket) => {
    socket.on('lobby:list', (cb: (rooms: ReturnType<RoomManager['listRooms']>) => void) => {
      cb(roomManager.listRooms());
    });

    socket.on(
      'room:create',
      (
        {
          playerName,
          roomName,
          playerId: clientPlayerId,
          difficulty,
        }: { playerName: string; roomName: string; playerId?: string; difficulty?: 'EASY' | 'HARD' },
        cb: Ack<{ roomId: string; seatIndex: number }>
      ) => {
        try {
          const playerId = clientPlayerId || socket.id;
          const room = roomManager.createRoom(roomName, { playerId, socketId: socket.id, name: playerName }, difficulty);
          Object.assign(socketData(socket), { playerId, roomId: room.id });
          socket.join(room.id);
          broadcastRoom(room);
          cb({ ok: true, roomId: room.id, seatIndex: 0 });
        } catch (err) {
          cb({ ok: false, error: errorMessage(err) });
        }
      }
    );

    socket.on(
      'room:join',
      ({ playerName, roomId, playerId: clientPlayerId }: { playerName: string; roomId: string; playerId?: string }, cb: Ack<{ roomId: string; seatIndex: number }>) => {
        try {
          const playerId = clientPlayerId || socket.id;
          const { room, seatIndex } = roomManager.joinRoom(roomId, { playerId, socketId: socket.id, name: playerName });
          clearDisconnectTimer(room.id, playerId);
          Object.assign(socketData(socket), { playerId, roomId: room.id });
          socket.join(room.id);
          broadcastRoom(room);
          cb({ ok: true, roomId: room.id, seatIndex });
        } catch (err) {
          cb({ ok: false, error: errorMessage(err) });
        }
      }
    );

    socket.on('room:addBot', (cb: Ack) => {
      try {
        const { roomId, playerId } = requireInRoom(socket);
        const room = roomManager.addBot(roomId, playerId);
        broadcastRoom(room);
        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('room:leave', (cb?: Ack) => {
      handleExplicitLeave(socket);
      cb?.({ ok: true });
    });

    socket.on('game:start', (cb: Ack) => {
      try {
        const { roomId } = requireInRoom(socket);
        const room = roomManager.startGame(roomId);
        broadcastRoom(room);
        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('game:nextRound', (cb: Ack) => {
      try {
        const { roomId } = requireInRoom(socket);
        const room = roomManager.startNextRound(roomId);
        broadcastRoom(room);
        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('game:declareKozel', ({ declare }: { declare: boolean }, cb: Ack) => {
      try {
        const { roomId, playerId } = requireInRoom(socket);
        const room = roomManager.declareKozel(roomId, playerId, declare);
        broadcastRoom(room);
        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('game:playCard', ({ card }: { card: Card }, cb: Ack) => {
      try {
        const { roomId, playerId } = requireInRoom(socket);
        const room = roomManager.playCard(roomId, playerId, card);
        broadcastRoom(room);
        cb({ ok: true });
      } catch (err) {
        cb({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('disconnect', () => handleDisconnect(socket));
  });

  function requireInRoom(socket: Socket): { roomId: string; playerId: string } {
    const { roomId, playerId } = socketData(socket);
    if (!roomId || !playerId) throw new RoomManagerError('Nejste připojeni k žádné místnosti');
    return { roomId, playerId };
  }

  /** The player chose to leave: always free their seat right away, win or lose, started or not. */
  function handleExplicitLeave(socket: Socket): void {
    const data = socketData(socket);
    const { roomId, playerId } = data;
    if (!roomId || !playerId) return;
    socket.leave(roomId);
    data.roomId = undefined;
    clearDisconnectTimer(roomId, playerId);
    const room = roomManager.leaveRoom(roomId, playerId);
    if (room) broadcastRoom(room);
    else broadcastLobby();
  }

  /**
   * The socket dropped unexpectedly (refresh, lost connection, closed tab). If no game has
   * started yet there is nothing to preserve, so the seat is freed immediately like an explicit
   * leave. If a game is in progress, the seat is kept reserved for RECONNECT_GRACE_MS so the
   * player can rejoin with the same playerId and pick up where they left off; only once that
   * grace period elapses without a reconnect does a bot take over the seat.
   */
  function handleDisconnect(socket: Socket): void {
    const { roomId, playerId } = socketData(socket);
    if (!roomId || !playerId) return;
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // If this socket already reconnected on a new connection before this stale socket's
    // disconnect event arrived, the seat no longer belongs to this socket — leave it alone.
    const seat = room.seats.find((s) => s?.playerId === playerId);
    if (!seat || seat.socketId !== socket.id) return;

    if (!room.state) {
      const updated = roomManager.leaveRoom(roomId, playerId);
      if (updated) broadcastRoom(updated);
      else broadcastLobby();
      return;
    }

    const updated = roomManager.markDisconnected(roomId, playerId);
    if (updated) broadcastRoom(updated);

    const key = disconnectTimerKey(roomId, playerId);
    const timer = setTimeout(() => {
      disconnectTimers.delete(key);
      const replaced = roomManager.replaceDisconnectedWithBot(roomId, playerId);
      if (replaced) broadcastRoom(replaced);
      else broadcastLobby();
    }, RECONNECT_GRACE_MS);
    timer.unref?.();
    disconnectTimers.set(key, timer);
  }

  return io;
}
