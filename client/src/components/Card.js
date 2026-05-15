import React from 'react';
import '../styles/Card.css';

const RED_SUITS = ['♥', '♦'];

export default function Card({
  card,
  onClick,
  disabled,
  illegal,
  selected,
  faceDown,
  small,
  glow,
  style = {}
}) {
  if (!card) return null;
  const isRed = RED_SUITS.includes(card.suit);

  const classes = [
    'card',
    isRed    ? 'red'       : 'black',
    faceDown ? 'face-down' : '',
    disabled ? 'disabled'  : '',
    illegal  ? 'illegal'   : '',
    selected ? 'selected'  : '',
    small    ? 'small'     : '',
    glow     ? 'glow'      : '',
    onClick && !disabled && !illegal ? 'clickable' : ''
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      onClick={onClick && !disabled && !illegal ? onClick : undefined}
      style={style}
    >
      {faceDown ? (
        <div className="card-back">
          <div className="card-back-inner">
            <div className="card-back-pattern" />
          </div>
        </div>
      ) : (
        <>
          <div className="card-corner top-left">
            <span className="card-rank">{card.rank}</span>
            <span className="card-suit-sm">{card.suit}</span>
          </div>
          <div className="card-center">
            <span className="card-suit-lg">{card.suit}</span>
          </div>
          <div className="card-corner bottom-right">
            <span className="card-rank">{card.rank}</span>
            <span className="card-suit-sm">{card.suit}</span>
          </div>
        </>
      )}
    </div>
  );
}
