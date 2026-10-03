import type { Card, ClientPlayerView, RoundHistoryEntry } from '@kozel/shared';
import { PLAYER_COUNT } from '@kozel/shared';
import { useEffect, useState } from 'react';
import { useKozelClient } from '../KozelClientProvider.js';
import { useRules } from '../RulesContext.js';
import { Avatar } from './Avatar.js';
import { CardView, RANK_FULL_LABEL, SUIT_LABEL } from './CardView.js';
import { ConfirmModal } from './ConfirmModal.js';

// Seats are laid out clockwise around the table: each next player (by turn order) sits to the viewer's left.
const SEAT_POSITION = ['bottom', 'left', 'top', 'right'] as const;

function getValidCards(hand: Card[], leadSuit: Card['suit'] | null, heartsBroken: boolean): Card[] {
  if (leadSuit === null) {
    if (heartsBroken) return hand;
    const nonHearts = hand.filter((c) => c.suit !== 'HEARTS');
    return nonHearts.length > 0 ? nonHearts : hand;
  }
  const following = hand.filter((c) => c.suit === leadSuit);
  return following.length > 0 ? following : hand;
}

export function GameScreen() {
  const { gameState, playerName, declareKozel, playCard, leaveRoom } = useKozelClient();
  const { openRules } = useRules();
  const [showMyTricks, setShowMyTricks] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  // The 4th card and trickComplete arrive in the very same state update, so a card freshly
  // mounted this render would get the "collect toward the winner" class immediately — a brand
  // new DOM node has no previous style to transition FROM, so it would just appear already
  // faded out instead of visibly sitting on the table first. Flipping this on a tick later, once
  // the card has had a render at its normal played position, gives the CSS transition something
  // to animate from.
  const [collecting, setCollecting] = useState(false);
  const trickCompleteNow = (gameState?.currentTrick.length ?? 0) >= PLAYER_COUNT && gameState?.trickWinnerIndex !== null;
  useEffect(() => {
    if (!trickCompleteNow) {
      setCollecting(false);
      return;
    }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setCollecting(true)));
    return () => cancelAnimationFrame(id);
  }, [trickCompleteNow]);
  if (!gameState) return null;

  const {
    phase,
    difficulty,
    viewerSeatIndex,
    players,
    turnIndex,
    leadSuit,
    heartsBroken,
    currentTrick,
    kozelPlayerIndex,
    isKozelDeclared,
    kozelDeclarationDeadline,
    multiplier,
    trickWinnerIndex,
    roundHistory,
  } = gameState;
  const me = players[viewerSeatIndex]!;
  // Once the 4th card is in, the trick is held on the table (winner highlighted) until the
  // server clears it a moment later — nobody can act again until then.
  const trickComplete = currentTrick.length >= PLAYER_COUNT && trickWinnerIndex !== null;
  const isMyTurn = phase === 'PLAYING_TRICK' && turnIndex === viewerSeatIndex && !trickComplete;
  const validCards = isMyTurn && me.hand ? getValidCards(me.hand, leadSuit, heartsBroken) : [];
  const isCardValid = (card: Card) => validCards.some((c) => c.suit === card.suit && c.rank === card.rank);
  const winningCard = trickComplete ? currentTrick.find((e) => e.playerIndex === trickWinnerIndex)?.card : undefined;
  const winnerPosition = trickComplete ? SEAT_POSITION[(trickWinnerIndex! - viewerSeatIndex + 4) % 4] : null;

  return (
    <div className="screen game-screen">
      <header className="screen__header">
        <h1>Kozel · kolo {gameState.roundNumber}</h1>
        <div className="row">
          <button type="button" className="secondary-button" onClick={openRules}>
            📜 <span className="btn-label">Pravidla</span>
          </button>
          <button type="button" className="link-button" onClick={() => setShowLeaveConfirm(true)}>
            🚪 <span className="btn-label">Opustit hru</span>
          </button>
        </div>
      </header>

      {showLeaveConfirm && (
        <ConfirmModal
          title="Opustit hru?"
          message="Opravdu chceš opustit rozehranou hru? Ostatní hráči budou pokračovat beze tebe."
          onConfirm={() => leaveRoom()}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}

      {isKozelDeclared && (
        <div className="kozel-banner">
          <span className="kozel-banner__icon">🐐</span>
          <span>Kozel byl nahlášen! Body za toto kolo se počítají 2×.</span>
        </div>
      )}

      <div className="table">
        {players.map((p, seatIndex) => {
          const offset = (seatIndex - viewerSeatIndex + 4) % 4;
          const position = SEAT_POSITION[offset]!;
          const justWon = trickComplete && seatIndex === trickWinnerIndex;
          return (
            <PlayerSlot
              key={seatIndex}
              player={p}
              position={position}
              isTurn={phase === 'PLAYING_TRICK' && turnIndex === seatIndex && !trickComplete}
              isSelf={seatIndex === viewerSeatIndex}
              isKozelHolder={kozelPlayerIndex === seatIndex}
              isTrickWinner={trickComplete && trickWinnerIndex === seatIndex}
              tricksWon={p.tricksWon + (justWon ? 1 : 0)}
              justWonTrick={justWon}
            />
          );
        })}

        <div className="trick-area">
          {currentTrick.map((entry) => (
            <div
              key={entry.playerIndex}
              className={[
                'trick-card',
                `trick-card--${SEAT_POSITION[(entry.playerIndex - viewerSeatIndex + 4) % 4]}`,
                trickComplete && entry.playerIndex === trickWinnerIndex ? 'trick-card--winner' : '',
                collecting && winnerPosition ? `trick-card--collect-${winnerPosition}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <CardView card={entry.card} />
            </div>
          ))}
          {currentTrick.length === 0 && phase === 'PLAYING_TRICK' && <span className="muted">Čeká se na výnos…</span>}
        </div>

        {trickComplete && winningCard && (
          <div className="trick-winner-banner">
            🏆 {players[trickWinnerIndex!]!.name} sebral štych na {RANK_FULL_LABEL[winningCard.rank]} {SUIT_LABEL[winningCard.suit]}
          </div>
        )}
      </div>

      {phase === 'DECLARING_KOZEL' && (
        <KozelDeclarationPanel
          isHolder={kozelPlayerIndex === viewerSeatIndex}
          deadline={kozelDeclarationDeadline}
          onDeclare={declareKozel}
        />
      )}

      {phase === 'ROUND_END' && <RoundEndPanel players={players} multiplier={multiplier} />}

      {phase === 'GAME_OVER' && <GameOverPanel players={players} losers={gameState.losers} onLeave={() => leaveRoom()} />}

      {(phase === 'PLAYING_TRICK' || phase === 'DECLARING_KOZEL') && (
        <div className="hand">
          <h2>{playerName} {isMyTurn && <span className="badge">Jsi na tahu</span>}</h2>
          <div className="hand__cards">
            {(me.hand ?? []).map((card) => (
              <CardView
                key={`${card.suit}-${card.rank}`}
                card={card}
                disabled={!isMyTurn || !isCardValid(card)}
                highlight={isMyTurn && isCardValid(card)}
                onClick={isMyTurn && isCardValid(card) ? () => playCard(card) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {me.captured && me.captured.length > 0 && (
        <div className="panel">
          <button type="button" className="secondary-button" onClick={() => setShowMyTricks((v) => !v)}>
            {showMyTricks ? 'Skrýt' : 'Zobrazit'} moje sebrané štychy ({me.captured.length})
          </button>
          {showMyTricks && (
            <div className="my-tricks">
              {me.captured.map((trick, i) => (
                <div key={i} className="my-tricks__trick">
                  <span className="muted">Štych {i + 1}:</span>
                  {trick.map((card) => (
                    <CardView key={`${card.suit}-${card.rank}`} card={card} size="small" />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Standings
        players={players}
        viewerSeatIndex={viewerSeatIndex}
        turnIndex={phase === 'PLAYING_TRICK' && !trickComplete ? turnIndex : null}
        roundHistory={roundHistory}
        currentRoundNumber={gameState.roundNumber}
        showCurrentRound={difficulty === 'EASY' && (phase === 'PLAYING_TRICK' || phase === 'DECLARING_KOZEL')}
      />
    </div>
  );
}

function PlayerSlot({
  player,
  position,
  isTurn,
  isSelf,
  isKozelHolder,
  isTrickWinner,
  tricksWon,
  justWonTrick,
}: {
  player: ClientPlayerView;
  position: (typeof SEAT_POSITION)[number];
  isTurn: boolean;
  isSelf: boolean;
  isKozelHolder: boolean;
  isTrickWinner: boolean;
  tricksWon: number;
  justWonTrick: boolean;
}) {
  return (
    <div
      className={[
        'player-slot',
        `player-slot--${position}`,
        isTurn ? 'player-slot--turn' : '',
        isKozelHolder ? 'player-slot--kozel' : '',
        isTrickWinner ? 'player-slot--trick-winner' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="player-slot__top-row">
        <div className="player-slot__identity">
          <Avatar avatarId={player.avatarId} size="large" className="player-slot__avatar" />
          <div className="player-slot__name">
            {player.name}
            {isSelf && ' (ty)'}
            {player.isBot && ' 🤖'}
            {!player.isBot && !player.connected && <span className="muted"> (odpojen, čeká se…)</span>}
            {isKozelHolder && <span className="kozel-tag">🐐 Kozel</span>}
            {isTrickWinner && <span className="trick-tag">🏆 Štych</span>}
          </div>
        </div>
        {tricksWon > 0 && (
          <div
            className={['trick-pile', justWonTrick ? 'trick-pile--just-won' : ''].filter(Boolean).join(' ')}
            title={`${player.name} — sebrané štychy v tomto kole: ${tricksWon}`}
          >
            <CardView card={{ suit: 'HEARTS', rank: '7' }} faceDown size="small" />
            <span className="trick-pile__count">×{tricksWon}</span>
          </div>
        )}
      </div>
      {!isSelf && (
        <div className="player-slot__meta">
          <span>{player.handCount} karet</span>
        </div>
      )}
    </div>
  );
}

function Standings({
  players,
  viewerSeatIndex,
  turnIndex,
  roundHistory,
  currentRoundNumber,
  showCurrentRound,
}: {
  players: ClientPlayerView[];
  viewerSeatIndex: number;
  turnIndex: number | null;
  roundHistory: RoundHistoryEntry[];
  currentRoundNumber: number;
  showCurrentRound: boolean;
}) {
  return (
    <div className="standings panel">
      <h2>Pořadí hráčů</h2>
      <div className="standings__scroll">
        <table className="standings__table">
          <thead>
            <tr>
              <th>Kolo</th>
              {players.map((p) => (
                <th key={p.seatIndex} className={p.seatIndex === turnIndex ? 'standings__th--turn' : ''}>
                  {p.name}
                  {p.seatIndex === viewerSeatIndex && <span className="standings__you-tag"> (ty)</span>}
                  {p.isBot && <span className="standings__bot-tag"> 🤖</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(roundHistory ?? []).map((entry) => (
              <tr key={entry.roundNumber}>
                <td>
                  {entry.roundNumber}
                  {entry.multiplier === 2 && ' 🐐'}
                </td>
                {players.map((p) => (
                  <td key={p.seatIndex}>{entry.scores[p.seatIndex]}</td>
                ))}
              </tr>
            ))}
            {showCurrentRound && (
              <tr className="standings__row--live">
                <td>{currentRoundNumber}</td>
                {players.map((p) => (
                  <td key={p.seatIndex}>{p.roundScore ?? '?'}</td>
                ))}
              </tr>
            )}
            <tr className="standings__row--total">
              <td>Celkem</td>
              {players.map((p) => (
                <td key={p.seatIndex}>{p.totalScore}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, [deadline]);
  if (deadline === null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function KozelDeclarationPanel({
  isHolder,
  deadline,
  onDeclare,
}: {
  isHolder: boolean;
  deadline: number | null;
  onDeclare: (declare: boolean) => void;
}) {
  const secondsLeft = useCountdown(deadline);

  return (
    <div className="panel panel--center">
      <div className="countdown">
        ⏳ Rozhodování o Kozlovi: <strong>{secondsLeft}s</strong>
      </div>
      {isHolder ? (
        <>
          <h2>Máš Kozla!</h2>
          <p>Chceš ho nahlásit? Zdvojnásobí to body za celé kolo. Pokud se nerozhodneš včas, zůstane v utajení.</p>
          <div className="row">
            <button type="button" onClick={() => onDeclare(true)}>
              Nahlásit (2× body)
            </button>
            <button type="button" onClick={() => onDeclare(false)}>
              Nechat v utajení
            </button>
          </div>
        </>
      ) : (
        <p className="muted">Probíhá rozhodování o Kozlovi…</p>
      )}
    </div>
  );
}

function RoundEndPanel({ players, multiplier }: { players: ClientPlayerView[]; multiplier: 1 | 2 }) {
  return (
    <div className="panel panel--center">
      <h2>Konec kola {multiplier === 2 ? '(Kozel byl nahlášen · 2× body)' : ''}</h2>
      <table className="score-table">
        <thead>
          <tr>
            <th>Hráč</th>
            <th>Body v kole</th>
            <th>Celkem</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.seatIndex}>
              <td>{p.name}</td>
              <td>{p.roundScore}</td>
              <td>{p.totalScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Další kolo začíná automaticky za chvíli…</p>
    </div>
  );
}

function GameOverPanel({
  players,
  losers,
  onLeave,
}: {
  players: ClientPlayerView[];
  losers: number[];
  onLeave: () => void;
}) {
  return (
    <div className="panel panel--center">
      <h2>Konec hry!</h2>
      <table className="score-table">
        <thead>
          <tr>
            <th>Hráč</th>
            <th>Celkem bodů</th>
            <th>Mečení</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const isLoser = losers.includes(p.seatIndex);
            const meckCount = isLoser ? Math.max(0, p.totalScore - 100) : 0;
            return (
              <tr key={p.seatIndex} className={isLoser ? 'score-table__row--loser' : ''}>
                <td>
                  {p.name} {isLoser && '🐐'}
                </td>
                <td>{p.totalScore}</td>
                <td>{isLoser ? `${meckCount}×` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" onClick={onLeave}>
        Zpět do lobby
      </button>
    </div>
  );
}
