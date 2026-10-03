import { useState } from 'react';
import { useKozelClient } from '../KozelClientProvider.js';

export function NameGate() {
  const { setPlayerName } = useKozelClient();
  const [value, setValue] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length > 0) setPlayerName(trimmed);
  }

  return (
    <div className="screen screen--centered">
      <form className="panel" onSubmit={submit}>
        <h1>Kozel</h1>
        <p>Zadej svou přezdívku pro vstup do hry.</p>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Tvoje jméno"
          maxLength={20}
        />
        <button type="submit" disabled={value.trim().length === 0}>
          Pokračovat
        </button>
      </form>
    </div>
  );
}
