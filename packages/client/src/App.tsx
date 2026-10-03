import { useState } from 'react';
import { ErrorBanner } from './components/ErrorBanner.js';
import { GameScreen } from './components/GameScreen.js';
import { LobbyScreen } from './components/LobbyScreen.js';
import { NameGate } from './components/NameGate.js';
import { RoomScreen } from './components/RoomScreen.js';
import { RulesModal } from './components/RulesModal.js';
import { useKozelClient } from './KozelClientProvider.js';

export function App() {
  const { connected, playerName, room, gameState } = useKozelClient();
  const [showRules, setShowRules] = useState(false);

  if (!connected) {
    return (
      <div className="screen screen--centered">
        <p>Připojování k serveru…</p>
      </div>
    );
  }

  return (
    <>
      <ErrorBanner />
      <button type="button" className="secondary-button rules-button" onClick={() => setShowRules(true)}>
        📜 Pravidla
      </button>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {!playerName ? <NameGate /> : !room ? <LobbyScreen /> : !gameState ? <RoomScreen /> : <GameScreen />}
    </>
  );
}
