import type { AckResult, AvatarId, Card, ClientGameState, Difficulty, RoomPublicView, RoomSummary } from '@kozel/shared';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';

const PLAYER_NAME_KEY = 'kozel:playerName';
const PLAYER_AVATAR_KEY = 'kozel:playerAvatar';
const PLAYER_ID_KEY = 'kozel:playerId';
const ROOM_ID_KEY = 'kozel:roomId';

// sessionStorage (not localStorage): playerId/roomId must stay unique per tab, otherwise opening
// a second tab for another seat at the same table would reuse the first tab's identity and seat.
function getOrCreatePlayerId(): string {
  const existing = sessionStorage.getItem(PLAYER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(PLAYER_ID_KEY, id);
  return id;
}

function emitAck<T extends object = Record<string, never>>(event: string, payload?: unknown): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(event, (ack: AckResult<T>) => resolve(ack));
    else socket.emit(event, payload, (ack: AckResult<T>) => resolve(ack));
  });
}

interface KozelClientValue {
  connected: boolean;
  playerName: string;
  setPlayerName: (name: string) => void;
  avatarId: AvatarId | null;
  setAvatarId: (avatarId: AvatarId | null) => void;
  rooms: RoomSummary[];
  room: RoomPublicView | null;
  seatIndex: number | null;
  gameState: ClientGameState | null;
  error: string | null;
  clearError: () => void;
  refreshLobby: () => void;
  createRoom: (roomName: string, difficulty: Difficulty) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  startGame: () => Promise<void>;
  addBot: () => Promise<void>;
  nextRound: () => Promise<void>;
  declareKozel: (declare: boolean) => Promise<void>;
  playCard: (card: Card) => Promise<void>;
}

const KozelClientContext = createContext<KozelClientValue | null>(null);

export function KozelClientProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(socket.connected);
  const [playerName, setPlayerNameState] = useState(() => localStorage.getItem(PLAYER_NAME_KEY) ?? '');
  const [avatarId, setAvatarIdState] = useState<AvatarId | null>(
    () => (localStorage.getItem(PLAYER_AVATAR_KEY) as AvatarId | null) ?? null
  );
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<RoomPublicView | null>(null);
  const [seatIndex, setSeatIndex] = useState<number | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const playerIdRef = useRef<string>(getOrCreatePlayerId());

  const setPlayerName = useCallback((name: string) => {
    localStorage.setItem(PLAYER_NAME_KEY, name);
    setPlayerNameState(name);
  }, []);

  const setAvatarId = useCallback((id: AvatarId | null) => {
    if (id) localStorage.setItem(PLAYER_AVATAR_KEY, id);
    else localStorage.removeItem(PLAYER_AVATAR_KEY);
    setAvatarIdState(id);
  }, []);

  const refreshLobby = useCallback(() => {
    socket.emit('lobby:list', (list: RoomSummary[]) => setRooms(list));
  }, []);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      setError(null);
      refreshLobby();

      // Picks back up a room this player was in before a refresh or dropped connection,
      // reclaiming the same seat (even mid-game) since the server recognizes the stored playerId.
      const savedRoomId = sessionStorage.getItem(ROOM_ID_KEY);
      const savedPlayerName = localStorage.getItem(PLAYER_NAME_KEY);
      const savedAvatarId = localStorage.getItem(PLAYER_AVATAR_KEY) as AvatarId | null;
      if (savedRoomId && savedPlayerName) {
        emitAck<{ roomId: string; seatIndex: number }>('room:join', {
          playerName: savedPlayerName,
          roomId: savedRoomId,
          playerId: playerIdRef.current,
          avatarId: savedAvatarId,
        }).then((ack) => {
          if (ack.ok) {
            roomIdRef.current = ack.roomId;
            setSeatIndex(ack.seatIndex);
          } else {
            sessionStorage.removeItem(ROOM_ID_KEY);
          }
        });
      }
    }
    function onDisconnect() {
      setConnected(false);
      setRoom(null);
      setGameState(null);
      setSeatIndex(null);
      setError('Spojení se serverem bylo přerušeno. Zkouším se znovu připojit…');
    }
    function onLobbyRooms(list: RoomSummary[]) {
      setRooms(list);
    }
    function onRoomUpdate(view: RoomPublicView) {
      setRoom(view);
      roomIdRef.current = view.id;
      sessionStorage.setItem(ROOM_ID_KEY, view.id);
      if (view.status === 'LOBBY') setGameState(null);
    }
    function onGameState(state: ClientGameState) {
      setGameState(state);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lobby:rooms', onLobbyRooms);
    socket.on('room:update', onRoomUpdate);
    socket.on('game:state', onGameState);

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby:rooms', onLobbyRooms);
      socket.off('room:update', onRoomUpdate);
      socket.off('game:state', onGameState);
    };
  }, [refreshLobby]);

  const withErrorHandling = useCallback(async (action: () => Promise<AckResult>) => {
    const ack = await action();
    if (!ack.ok) setError(ack.error);
  }, []);

  const createRoom = useCallback(
    (roomName: string, difficulty: Difficulty) =>
      withErrorHandling(async () => {
        const ack = await emitAck<{ roomId: string; seatIndex: number }>('room:create', {
          playerName,
          roomName,
          playerId: playerIdRef.current,
          difficulty,
          avatarId,
        });
        if (ack.ok) {
          roomIdRef.current = ack.roomId;
          setSeatIndex(ack.seatIndex);
        }
        return ack;
      }),
    [playerName, avatarId, withErrorHandling]
  );

  const joinRoom = useCallback(
    (roomId: string) =>
      withErrorHandling(async () => {
        const ack = await emitAck<{ roomId: string; seatIndex: number }>('room:join', {
          playerName,
          roomId,
          playerId: playerIdRef.current,
          avatarId,
        });
        if (ack.ok) {
          roomIdRef.current = ack.roomId;
          setSeatIndex(ack.seatIndex);
        }
        return ack;
      }),
    [playerName, avatarId, withErrorHandling]
  );

  const leaveRoom = useCallback(
    () =>
      withErrorHandling(async () => {
        const ack = await emitAck('room:leave');
        setRoom(null);
        setGameState(null);
        setSeatIndex(null);
        roomIdRef.current = null;
        sessionStorage.removeItem(ROOM_ID_KEY);
        return ack;
      }),
    [withErrorHandling]
  );

  const startGame = useCallback(() => withErrorHandling(() => emitAck('game:start')), [withErrorHandling]);
  const addBot = useCallback(() => withErrorHandling(() => emitAck('room:addBot')), [withErrorHandling]);
  const nextRound = useCallback(() => withErrorHandling(() => emitAck('game:nextRound')), [withErrorHandling]);
  const declareKozel = useCallback(
    (declare: boolean) => withErrorHandling(() => emitAck('game:declareKozel', { declare })),
    [withErrorHandling]
  );
  const playCard = useCallback(
    (card: Card) => withErrorHandling(() => emitAck('game:playCard', { card })),
    [withErrorHandling]
  );

  const value: KozelClientValue = {
    connected,
    playerName,
    setPlayerName,
    avatarId,
    setAvatarId,
    rooms,
    room,
    seatIndex,
    gameState,
    error,
    clearError: () => setError(null),
    refreshLobby,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    addBot,
    nextRound,
    declareKozel,
    playCard,
  };

  return <KozelClientContext.Provider value={value}>{children}</KozelClientContext.Provider>;
}

export function useKozelClient(): KozelClientValue {
  const ctx = useContext(KozelClientContext);
  if (!ctx) throw new Error('useKozelClient must be used within KozelClientProvider');
  return ctx;
}
