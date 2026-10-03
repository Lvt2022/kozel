import { ErrorBanner } from './components/ErrorBanner.js';
import { GameScreen } from './components/GameScreen.js';
import { LobbyScreen } from './components/LobbyScreen.js';
import { NameGate } from './components/NameGate.js';
import { RoomScreen } from './components/RoomScreen.js';
import { RulesModal } from './components/RulesModal.js';
import { useKozelClient } from './KozelClientProvider.js';
import { useRules } from './RulesContext.js';

export function App() {
  const { connected, playerName, room, gameState } = useKozelClient();
  const { showRules, closeRules } = useRules();

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
      {showRules && <RulesModal onClose={closeRules} />}
      {!playerName ? <NameGate /> : !room ? <LobbyScreen /> : !gameState ? <RoomScreen /> : <GameScreen />}
    </>
  );
}
