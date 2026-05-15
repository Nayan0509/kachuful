import React from 'react';
import Card from './Card';
import '../styles/BidPanel.css';

const IS_RED = s => s === '♥' || s === '♦';

export default function BidPanel({ roundNumber, trumpCard, myHand, forbiddenBid, onBid }) {
  const bids = Array.from({ length: roundNumber + 1 }, (_, i) => i);
  const isLastBidder = forbiddenBid !== null && forbiddenBid !== undefined;

  return (
    <div className="bid-overlay">
      <div className="bid-panel">

        {/* Header — trump + title */}
        <div className="bid-header">
          <div className="bid-trump-block">
            {trumpCard ? (
              <>
                <span className="bid-trump-tag">TRUMP</span>
                <span className={`bid-trump-sym ${IS_RED(trumpCard.suit) ? 'red' : 'blk'}`}>
                  {trumpCard.suit}
                </span>
                <span className="bid-trump-rnk">{trumpCard.rank}</span>
              </>
            ) : (
              <span className="bid-trump-tag">NO TRUMP</span>
            )}
          </div>

          <div className="bid-title-block">
            <div className="bid-title">SELECT YOUR BID</div>
            <div className="bid-sub">
              {roundNumber} card{roundNumber !== 1 ? 's' : ''} this round
            </div>
          </div>

          {/* Trump card thumbnail */}
          {trumpCard && (
            <div className="bid-trump-card-wrap">
              <Card card={trumpCard} small />
            </div>
          )}
        </div>

        {/* Forbidden notice */}
        {isLastBidder && (
          <div className="bid-forbidden">
            ⚠ You cannot bid <strong>{forbiddenBid}</strong>
            <span className="bid-forbidden-why"> (total bids would equal round cards)</span>
          </div>
        )}

        {/* Bid grid */}
        <div className="bid-grid">
          {bids.map(b => {
            const isForbidden = isLastBidder && b === forbiddenBid;
            return (
              <button
                key={b}
                className={`bid-tile ${isForbidden ? 'forbidden' : ''}`}
                onClick={() => !isForbidden && onBid(b)}
                disabled={isForbidden}
                title={isForbidden ? `Cannot bid ${b}` : `Bid ${b}`}
              >
                {b}
              </button>
            );
          })}
        </div>

        <div className="bid-hint">
          Tap a number to place your bid
        </div>
      </div>
    </div>
  );
}
