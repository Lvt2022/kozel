import type { Rank as CardRank, Suit as CardSuit } from '@kozel/shared';
import { RANKS } from '@kozel/shared';
import type { CSSProperties } from 'react';

const SPRITE_SHEET_URL = '/cards/mariasky-sprite.png';

const GRID_COLS = 8;
const GRID_ROWS = 4;

// Sprite sheet row order, top to bottom (verified against the actual image — not the same
// order as the original spec text, which had Hearts/Acorns/Leaves/Bells).
const SUIT_ROW: Record<CardSuit, number> = {
  BELLS: 0,
  HEARTS: 1,
  LEAVES: 2,
  ACORNS: 3,
};

// Columns, left to right: 7, 8, 9, 10, J (Spodek), Q (Svršek), K (Král), A (Eso) —
// this already matches the shared RANKS order, so no separate lookup table is needed.
function rankColumn(rank: CardRank): number {
  return RANKS.indexOf(rank);
}

/**
 * Background-image CSS for one sprite cell. Percentage-based position/size positions the
 * (col, row) cell regardless of the sheet's real pixel dimensions, as long as the grid stays
 * GRID_COLS x GRID_ROWS — so this keeps working even if the sheet image is ever re-exported
 * at a different resolution.
 */
export function cardSpriteStyle(suit: CardSuit, rank: CardRank): CSSProperties {
  const col = rankColumn(rank);
  const row = SUIT_ROW[suit];

  return {
    backgroundImage: `url(${SPRITE_SHEET_URL})`,
    backgroundSize: `${GRID_COLS * 100}% ${GRID_ROWS * 100}%`,
    backgroundPosition: `${(col / (GRID_COLS - 1)) * 100}% ${(row / (GRID_ROWS - 1)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export interface CardProps {
  suit: CardSuit;
  rank: CardRank;
  /** Shows the card back instead of its face. */
  isFaceDown?: boolean;
  /** Rendered width in px; height follows the sprite sheet's card aspect ratio. */
  width?: number;
  className?: string;
  onClick?: () => void;
}

// The sheet's actual pixel dimensions (1408x1117) aren't round multiples of the 8x4 grid, so a
// single cell works out to 176 x 279.25 px — this ratio is what a rendered card should match,
// independent of the percentage-based background math below (which only needs the grid counts).
const CARD_ASPECT_RATIO = 1117 / 4 / (1408 / 8);

export function Card({ suit, rank, isFaceDown = false, width = 100, className, onClick }: CardProps) {
  const height = width * CARD_ASPECT_RATIO;

  const baseStyle: CSSProperties = {
    width,
    height,
    borderRadius: Math.max(2, width * 0.06),
    border: '1px solid rgba(0,0,0,0.25)',
    boxShadow: '1px 1px 3px rgba(0,0,0,0.35)',
    backgroundColor: '#fffceb',
    cursor: onClick ? 'pointer' : 'default',
    padding: 0,
  };

  if (isFaceDown) {
    return (
      <div
        className={className}
        style={{
          ...baseStyle,
          backgroundImage:
            'repeating-linear-gradient(45deg, #8b1e1e, #8b1e1e 6px, #241409 6px 12px)',
        }}
        role="img"
        aria-label="Zakrytá karta"
      />
    );
  }

  const style: CSSProperties = { ...baseStyle, ...cardSpriteStyle(suit, rank) };

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={className}
      style={style}
      onClick={onClick}
      aria-label={`${suit} ${rank}`}
    />
  );
}
