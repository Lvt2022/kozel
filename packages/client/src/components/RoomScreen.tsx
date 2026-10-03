import { useKozelClient } from '../KozelClientProvider.js';

export function RoomScreen() {
  const { room, seatIndex, startGame, addBot, leaveRoom } = useKozelClient();
  if (!room) return null;

  const occupiedCount = room.seats.filter((s) => s.occupied).length;
  const canStart = occupiedCount === room.seats.length;
  const isFounder = seatIndex === 0;
  const hasFreeSeat = occupiedCount < room.seats.length;

  return (
    <div className="screen">
      <header className="screen__header">
        <h1>{room.name}</h1>
        <button type="button" className="link-button" onClick={() => leaveRoom()}>
          Opustit místnost
        </button>
      </header>

      <div className="panel">
        <h2>Hráči u stolu ({occupiedCount}/4)</h2>
        <ul className="seat-list">
          {room.seats.map((seat) => (
            <li key={seat.seatIndex} className={`seat ${seat.occupied ? 'seat--occupied' : 'seat--empty'}`}>
              <span className="seat__index">{seat.seatIndex + 1}.</span>
              {seat.occupied ? (
                <span>
                  {seat.name}
                  {seat.isBot && ' 🤖'}
                  {seat.seatIndex === seatIndex && ' (ty)'}
                </span>
              ) : (
                <span className="muted">Volné místo…</span>
              )}
            </li>
          ))}
        </ul>

        {isFounder && hasFreeSeat && (
          <button type="button" className="secondary-button" onClick={() => addBot()}>
            + Přidat AI hráče
          </button>
        )}

        {canStart ? (
          <button type="button" onClick={() => startGame()}>
            Zahájit hru
          </button>
        ) : (
          <p className="muted">
            {isFounder ? 'Čeká se na 4 hráče — doplň zbytek AI, nebo počkej na další lidi.' : 'Čeká se, až se připojí 4 hráči.'}
          </p>
        )}
      </div>
    </div>
  );
}
