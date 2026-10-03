import type { Card, Suit } from '@kozel/shared';
import { cardSpriteStyle } from './CardSprite.js';

export const SUIT_LABEL: Record<Suit, string> = {
  HEARTS: 'Červené',
  BELLS: 'Kule',
  ACORNS: 'Žaludy',
  LEAVES: 'Zelené',
};

// Mariáš rank names, not poker's J/Q/K/A.
export const RANK_FULL_LABEL: Record<Card['rank'], string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'Spodek',
  Q: 'Svršek',
  K: 'Král',
  A: 'Eso',
};

interface CardViewProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  faceDown?: boolean;
  highlight?: boolean;
  size?: 'normal' | 'small';
}

export function CardView({ card, onClick, disabled, faceDown, highlight, size = 'normal' }: CardViewProps) {
  const isKozel = card.suit === 'LEAVES' && card.rank === 'Q';
  const className = [
    'card',
    size === 'small' ? 'card--small' : '',
    disabled ? 'card--disabled' : '',
    highlight ? 'card--highlight' : '',
    isKozel ? 'card--kozel' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (faceDown) {
    return <div className={`${className} card--back`} aria-label="Zakrytá karta" />;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled || !onClick}
      title={`${SUIT_LABEL[card.suit]} — ${RANK_FULL_LABEL[card.rank]}${isKozel ? ' — Kozel' : ''}`}
    >
      <span className="card__art" style={cardSpriteStyle(card.suit, card.rank)} />
    </button>
  );
}
