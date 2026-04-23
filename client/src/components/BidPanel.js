import React from 'react';
import Card from './Card';

export default function BidPanel({ roundNumber, trumpCard, onBid }) {
  const bids = Array.from({ length: roundNumber + 1 }, (_, i) => i);

  return (
    <div className="bid-overlay">
      <div className="bid-panel">
        <h2>Place Your Bid</h2>
        <p>
          Round {roundNumber} · Trump:&nbsp;
          {trumpCard
            ? <strong style={{ color: ['♥','♦'].includes(trumpCard.suit) ? '#e03030' : '#fff' }}>
                {trumpCard.suit} {trumpCard.rank}
              </strong>
            : 'No trump'}
        </p>
        {trumpCard && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <Card card={trumpCard} small />
          </div>
        )}
        <div className="bid-buttons">
          {bids.map(b => (
            <button key={b} className="bid-btn" onClick={() => onBid(b)}>
              {b}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
