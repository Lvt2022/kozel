import type { ClientGameState } from './types.js';
import { createServer, type Server as HttpServer } from 'node:http';
import { type AddressInfo } from 'node:net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSocketServer } from './socketServer.js';

type Ack = { ok: true; roomId?: string; seatIndex?: number } | { ok: false; error: string };

function emitAck<T extends Ack>(socket: ClientSocket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(event, (ack: T) => resolve(ack));
    else socket.emit(event, payload, (ack: T) => resolve(ack));
  });
}

function waitForState(socket: ClientSocket, predicate: (s: ClientGameState) => boolean): Promise<ClientGameState> {
  return new Promise((resolve) => {
    const handler = (state: ClientGameState) => {
      if (predicate(state)) {
        socket.off('game:state', handler);
        resolve(state);
      }
    };
    socket.on('game:state', handler);
  });
}

describe('Kozel socket server (integration)', () => {
  let httpServer: HttpServer;
  let port: number;
  let clients: ClientSocket[] = [];

  beforeEach(async () => {
    httpServer = createServer();
    createSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
    clients = [];
  });

  afterEach(async () => {
    for (const c of clients) c.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(): Promise<ClientSocket> {
    return new Promise((resolve) => {
      const socket = ioClient(`http://localhost:${port}`, { transports: ['websocket'] });
      socket.on('connect', () => resolve(socket));
      clients.push(socket);
    });
  }

  it('lets 4 players create/join a room, start a game, declare Kozel and play a card', async () => {
    const [a, b, c, d] = await Promise.all([connect(), connect(), connect(), connect()]);

    const created = await emitAck<Extract<Ack, { ok: true }>>(a!, 'room:create', { playerName: 'Alice', roomName: 'Herna' });
    expect(created.ok).toBe(true);
    const roomId = (created as { roomId: string }).roomId;

    for (const [socket, name] of [[b, 'Bob'], [c, 'Carol'], [d, 'Dave']] as const) {
      const joined = await emitAck<Ack>(socket!, 'room:join', { playerName: name, roomId });
      expect(joined.ok).toBe(true);
    }

    const lobby = await emitAck<never>(a!, 'lobby:list');
    expect(Array.isArray(lobby)).toBe(true);

    const statePromises = [a, b, c, d].map((s) => waitForState(s!, (st) => st.phase === 'DECLARING_KOZEL'));
    const startAck = await emitAck<Ack>(a!, 'game:start');
    expect(startAck.ok).toBe(true);
    const states = await Promise.all(statePromises);

    // Exactly one player should see themselves as the (hidden) Kozel holder.
    const holderViews = states.filter((s) => s.kozelPlayerIndex === s.viewerSeatIndex);
    expect(holderViews).toHaveLength(1);
    const holderSeat = holderViews[0]!.viewerSeatIndex;
    const holderSocket = [a, b, c, d][holderSeat]!;

    const afterDeclarePromises = [a, b, c, d].map((s) => waitForState(s!, (st) => st.phase === 'PLAYING_TRICK'));
    const declareAck = await emitAck<Ack>(holderSocket, 'game:declareKozel', { declare: false });
    expect(declareAck.ok).toBe(true);
    const playingStates = await Promise.all(afterDeclarePromises);

    expect(playingStates.every((s) => s.multiplier === 1)).toBe(true);
    const turnSeat = playingStates[0]!.turnIndex;
    const turnSocket = [a, b, c, d][turnSeat]!;
    const turnState = playingStates[turnSeat]!;
    const hand = turnState.players[turnSeat]!.hand!;
    // Leading with HEARTS before any have been broken is rejected (see the gameEngine hearts
    // rule), so pick a non-HEARTS card to lead with, falling back to hand[0] on an all-hearts hand.
    const cardToPlay = hand.find((c) => c.suit !== 'HEARTS') ?? hand[0]!;

    const afterPlayPromises = [a, b, c, d].map((s) =>
      waitForState(s!, (st) => st.currentTrick.length === 1 || st.turnIndex !== turnSeat)
    );
    const playAck = await emitAck<Ack>(turnSocket, 'game:playCard', { card: cardToPlay });
    expect(playAck.ok).toBe(true);
    const afterPlayStates = await Promise.all(afterPlayPromises);

    expect(afterPlayStates.every((s) => s.turnIndex === (turnSeat + 1) % 4)).toBe(true);
    expect(afterPlayStates[0]!.players[turnSeat]!.handCount).toBe(7);
  });

  it('rejects starting a game with fewer than 4 players', async () => {
    const [a, b] = await Promise.all([connect(), connect()]);
    const created = await emitAck<Extract<Ack, { ok: true }>>(a!, 'room:create', { playerName: 'Alice', roomName: 'Herna' });
    const roomId = (created as { roomId: string }).roomId;
    await emitAck<Ack>(b!, 'room:join', { playerName: 'Bob', roomId });

    const startAck = await emitAck<Ack>(a!, 'game:start');
    expect(startAck.ok).toBe(false);
  });

  it('lets the founder fill empty seats with bots, which then play on their own', async () => {
    const [a] = await Promise.all([connect()]);
    const created = await emitAck<Extract<Ack, { ok: true }>>(a!, 'room:create', { playerName: 'Alice', roomName: 'Herna' });
    const roomId = (created as { roomId: string }).roomId;

    for (let i = 0; i < 3; i++) {
      const botAck = await emitAck<Ack>(a!, 'room:addBot');
      expect(botAck.ok).toBe(true);
    }

    const declaringPromise = waitForState(a!, (st) => st.phase === 'DECLARING_KOZEL');
    const startAck = await emitAck<Ack>(a!, 'game:start');
    expect(startAck.ok).toBe(true);
    const declaringState = await declaringPromise;

    // Either Alice holds the Kozel and must act, or a bot holds it and resolves it on its own.
    const playingPromise = waitForState(a!, (st) => st.phase === 'PLAYING_TRICK');
    if (declaringState.kozelPlayerIndex === declaringState.viewerSeatIndex) {
      await emitAck<Ack>(a!, 'game:declareKozel', { declare: false });
    }
    const playingState = await playingPromise;
    expect(playingState.phase).toBe('PLAYING_TRICK');

    // If it's a bot's turn, nobody acts -- the server should still advance the trick on its own.
    if (playingState.turnIndex !== playingState.viewerSeatIndex) {
      const advanced = await waitForState(a!, (st) => st.turnIndex !== playingState.turnIndex || st.currentTrick.length > 0);
      const botPlayed = advanced.turnIndex !== playingState.turnIndex || advanced.currentTrick.length > 0;
      expect(botPlayed).toBe(true);
    }
  });

  it('lets a player reconnect with the same playerId and reclaim their seat mid-game', async () => {
    const [a] = await Promise.all([connect()]);
    const playerId = 'persistent-player-x';
    const created = await emitAck<Extract<Ack, { ok: true }>>(a!, 'room:create', { playerName: 'Alice', roomName: 'Herna', playerId });
    const roomId = (created as { roomId: string }).roomId;

    for (let i = 0; i < 3; i++) {
      await emitAck<Ack>(a!, 'room:addBot');
    }
    await emitAck<Ack>(a!, 'game:start');

    a!.disconnect();
    // Give the server's disconnect handler a tick to run before the "reconnect" arrives.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const b = await connect();
    const statePromise = waitForState(b, () => true);
    const rejoined = await emitAck<Extract<Ack, { ok: true }>>(b, 'room:join', { playerName: 'Alice', roomId, playerId });
    expect(rejoined.ok).toBe(true);
    expect(rejoined.seatIndex).toBe(0);

    const state = await statePromise;
    expect(state.viewerSeatIndex).toBe(0);
  });
});
