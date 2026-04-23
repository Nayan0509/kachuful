import React from 'react';
import '../styles/Card.css';

const RED_SUITS = ['♥', '♦'];

export default function Card({
  card,
  onClick,
  disabled,
  selected,
  faceDown,
  small,
  glow,
  style = {}
}) {
  if (!card) return null;
  const isRed = RED_SUITS.includes(card.suit);

  return (
    <div
      className={[
        'card',
        isRed ? 'red' : 'black',
        faceDown ? 'face-down' : '',
        disabled ? 'disabled' : '',
        selected ? 'selected' : '',
        small ? 'small' : '',
        glow ? 'glow' : '',
        onClick && !disabled ? 'clickable' : ''
      ].filter(Boolean).join(' ')}
      onClick={!disabled && onClick ? onClick : undefined}
      style={style}
    >
      {faceDown ? (
        <div className="card-back">
          <div className="card-back-pattern" />
        </div>
      ) : (
        <>
          <div className="card-corner top-left">
            <span className="card-rank">{card.rank}</span>
            <span className="card-suit">{card.suit}</span>
          </div>
          <div className="card-center">{card.suit}</div>
          <div className="card-corner bottom-right">
            <span className="card-rank">{card.rank}</span>
            <span className="card-suit">{card.suit}</span>
          </div>
        </>
      )}
    </div>
  );
}
