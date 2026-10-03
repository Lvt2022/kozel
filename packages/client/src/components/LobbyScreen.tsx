import type { Difficulty } from '@kozel/shared';
import { useEffect, useState } from 'react';
import { useKozelClient } from '../KozelClientProvider.js';
import { useRules } from '../RulesContext.js';

const STATUS_LABEL: Record<string, string> = {
  LOBBY: 'Čeká se na hráče',
  IN_PROGRESS: 'Hra probíhá',
  FINISHED: 'Hra skončila',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  EASY: 'Lehká (vidíš body nasbírané v kole)',
  HARD: 'Těžká (body v kole si musíš pamatovat sám)',
};

export function LobbyScreen() {
  const { playerName, rooms, refreshLobby, createRoom, joinRoom } = useKozelClient();
  const { openRules } = useRules();
  const [roomName, setRoomName] = useState(`${playerName}ova herna`);
  const [difficulty, setDifficulty] = useState<Difficulty>('HARD');

  useEffect(() => {
    refreshLobby();
    const interval = setInterval(refreshLobby, 4000);
    return () => clearInterval(interval);
  }, [refreshLobby]);

  return (
    <div className="screen">
      <header className="screen__header">
        <h1>Kozel</h1>
        <div className="row">
          <span className="player-badge">Hraješ jako {playerName}</span>
          <button type="button" className="secondary-button" onClick={openRules}>
            📜 Pravidla
          </button>
        </div>
      </header>

      <div className="panel">
        <h2>Nová místnost</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (roomName.trim()) createRoom(roomName.trim(), difficulty);
          }}
        >
          <input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={30} />
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </select>
          <button type="submit">Založit místnost</button>
        </form>
      </div>

      <div className="panel">
        <h2>Otevřené místnosti</h2>
        {rooms.length === 0 && <p className="muted">Zatím žádné místnosti. Založ první!</p>}
        <ul className="room-list">
          {rooms.map((r) => (
            <li key={r.id} className="room-list__item">
              <div>
                <strong>{r.name}</strong>
                <div className="muted">
                  {r.playerCount}/{r.maxPlayers} hráčů · {STATUS_LABEL[r.status] ?? r.status} ·{' '}
                  {r.difficulty === 'EASY' ? 'Lehká' : 'Těžká'} obtížnost
                </div>
              </div>
              <button
                type="button"
                disabled={r.status !== 'LOBBY' || r.playerCount >= r.maxPlayers}
                onClick={() => joinRoom(r.id)}
              >
                Připojit se
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
