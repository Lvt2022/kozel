import { describe, expect, it } from 'vitest';
import { RoomManager, RoomManagerError } from './roomManager.js';

function seatRoom(rm: RoomManager, roomId: string, names: string[]): void {
  for (let i = 1; i < names.length; i++) {
    rm.joinRoom(roomId, { playerId: `p${i}`, socketId: `s${i}`, name: names[i]! });
  }
}

describe('RoomManager', () => {
  it('creates a room with the creator seated at index 0', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'Alice' });
    expect(room.seats[0]?.name).toBe('Alice');
    expect(room.seats.filter((s) => s !== null)).toHaveLength(1);
  });

  it('seats joining players in the next free seat, in order', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'Alice' });
    const { seatIndex: i1 } = rm.joinRoom(room.id, { playerId: 'p1', socketId: 's1', name: 'Bob' });
    const { seatIndex: i2 } = rm.joinRoom(room.id, { playerId: 'p2', socketId: 's2', name: 'Carol' });
    expect(i1).toBe(1);
    expect(i2).toBe(2);
  });

  it('rejects joining a full room', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    seatRoom(rm, room.id, ['A', 'B', 'C', 'D']);
    expect(() => rm.joinRoom(room.id, { playerId: 'p4', socketId: 's4', name: 'E' })).toThrow(RoomManagerError);
  });

  it('removes the room once the last player leaves', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    rm.leaveRoom(room.id, 'p0');
    expect(rm.getRoom(room.id)).toBeUndefined();
  });

  it('refuses to start a game with fewer than 4 players', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    rm.joinRoom(room.id, { playerId: 'p1', socketId: 's1', name: 'B' });
    expect(() => rm.startGame(room.id)).toThrow(RoomManagerError);
  });

  it('starts a game once 4 players are seated and deals 8 cards each', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    seatRoom(rm, room.id, ['A', 'B', 'C', 'D']);
    const started = rm.startGame(room.id);
    expect(started.state?.phase).toBe('DECLARING_KOZEL');
    for (const p of started.state!.players) expect(p.hand).toHaveLength(8);
  });

  it('routes declareKozel and playCard through the seated player\'s seat index', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    seatRoom(rm, room.id, ['A', 'B', 'C', 'D']);
    let started = rm.startGame(room.id);
    const kozelSeat = started.state!.kozelPlayerIndex!;
    const kozelPlayerId = started.seats[kozelSeat]!.playerId;

    const afterDeclare = rm.declareKozel(room.id, kozelPlayerId, true);
    expect(afterDeclare.state!.multiplier).toBe(2);

    // A different (wrong) player trying to play out of turn should fail.
    const wrongSeat = (afterDeclare.state!.turnIndex + 1) % 4;
    const wrongPlayerId = afterDeclare.seats[wrongSeat]!.playerId;
    expect(() => rm.playCard(room.id, wrongPlayerId, afterDeclare.state!.players[wrongSeat]!.hand[0]!)).toThrow();
  });

  it('throws when an unknown player acts in a room', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    seatRoom(rm, room.id, ['A', 'B', 'C', 'D']);
    rm.startGame(room.id);
    expect(() => rm.declareKozel(room.id, 'ghost', true)).toThrow(RoomManagerError);
  });

  it('reconnecting with the same playerId reclaims the same seat even mid-game', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    seatRoom(rm, room.id, ['A', 'B', 'C', 'D']);
    rm.startGame(room.id);

    const { room: rejoined, seatIndex } = rm.joinRoom(room.id, { playerId: 'p1', socketId: 'new-socket', name: 'Bob' });
    expect(seatIndex).toBe(1);
    expect(rejoined.seats[1]?.playerId).toBe('p1');
    expect(rejoined.seats[1]?.socketId).toBe('new-socket');
    expect(rejoined.state).not.toBeNull();
  });

  it('refuses a brand-new player trying to join a room whose game already started', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    seatRoom(rm, room.id, ['A', 'B', 'C', 'D']);
    rm.startGame(room.id);
    expect(() => rm.joinRoom(room.id, { playerId: 'stranger', socketId: 's9', name: 'E' })).toThrow(RoomManagerError);
  });

  it('hands a leaving player\'s seat to a bot mid-game instead of freezing the table', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    seatRoom(rm, room.id, ['A', 'B', 'C', 'D']);
    rm.startGame(room.id);

    const updated = rm.leaveRoom(room.id, 'p1')!;
    expect(updated.seats[1]?.isBot).toBe(true);
    expect(updated.state).not.toBeNull();
  });

  it('deletes the room once every human has left a game in progress', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'A' });
    seatRoom(rm, room.id, ['A', 'B', 'C', 'D']);
    rm.startGame(room.id);

    rm.leaveRoom(room.id, 'p0');
    rm.leaveRoom(room.id, 'p1');
    rm.leaveRoom(room.id, 'p2');
    const after = rm.leaveRoom(room.id, 'p3');
    expect(after).toBeUndefined();
    expect(rm.getRoom(room.id)).toBeUndefined();
  });

  describe('addBot', () => {
    it('lets only the founder (seat 0) add a bot to a free seat', () => {
      const rm = new RoomManager();
      const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'Alice' });
      rm.joinRoom(room.id, { playerId: 'p1', socketId: 's1', name: 'Bob' });

      const updated = rm.addBot(room.id, 'p0');
      const botSeat = updated.seats.find((s) => s?.isBot);
      expect(botSeat?.name).toBe('Bot 1');

      expect(() => rm.addBot(room.id, 'p1')).toThrow(RoomManagerError);
    });

    it('numbers multiple bots sequentially and refuses once the room is full', () => {
      const rm = new RoomManager();
      const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'Alice' });
      rm.addBot(room.id, 'p0');
      rm.addBot(room.id, 'p0');
      const updated = rm.addBot(room.id, 'p0');
      const botNames = updated.seats.filter((s) => s?.isBot).map((s) => s!.name);
      expect(botNames).toEqual(['Bot 1', 'Bot 2', 'Bot 3']);

      expect(() => rm.addBot(room.id, 'p0')).toThrow(RoomManagerError);
    });

    it('refuses to add a bot once the game has started', () => {
      const rm = new RoomManager();
      const room = rm.createRoom('Herna 1', { playerId: 'p0', socketId: 's0', name: 'Alice' });
      rm.addBot(room.id, 'p0');
      rm.addBot(room.id, 'p0');
      rm.addBot(room.id, 'p0');
      rm.startGame(room.id);
      expect(() => rm.addBot(room.id, 'p0')).toThrow(RoomManagerError);
    });
  });
});
