import React from 'react';
import Card from './Card';

export default function BidPanel({ roundNumber, trumpCard, myHand, forbiddenBid, onBid }) {
  const bids = Array.from({ length: roundNumber + 1 }, (_, i) => i);
  const isLastBidder = forbiddenBid !== null && forbiddenBid !== undefined;

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

        {/* Show player's own cards */}
        {myHand && myHand.length > 0 && (
          <div className="bid-hand-preview">
            <span className="bid-hand-label">Your cards — decide your bid:</span>
            <div className="bid-hand-cards">
              {myHand.map((card, i) => (
                <Card key={`${card.suit}-${card.rank}-${i}`} card={card} faceDown={false} />
              ))}
            </div>
          </div>
        )}

        {/* Last bidder warning */}
        {isLastBidder && (
          <div className="forbidden-notice">
            ⚠️ You cannot bid <strong>{forbiddenBid}</strong> — total bids must not equal {roundNumber}
          </div>
        )}

        <div className="bid-buttons">
          {bids.map(b => {
            const isForbidden = isLastBidder && b === forbiddenBid;
            return (
              <button
                key={b}
                className={`bid-btn ${isForbidden ? 'forbidden' : ''}`}
                onClick={() => !isForbidden && onBid(b)}
                disabled={isForbidden}
                title={isForbidden ? `Cannot bid ${b}` : `Bid ${b}`}
              >
                {b}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
