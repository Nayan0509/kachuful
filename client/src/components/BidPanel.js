import React from 'react';
import '../styles/BidPanel.css';

export default function BidPanel({ roundNumber, trumpCard, myHand, forbiddenBid, onBid, onRedeal }) {
  const bids = Array.from({ length: roundNumber + 1 }, (_, i) => i);
  const isLastBidder = forbiddenBid !== null && forbiddenBid !== undefined;

  const trumpSuitName = {
    '♠': 'SPADES', '♥': 'HEARTS', '♦': 'DIAMONDS', '♣': 'CLUBS'
  };

  return (
    <div className="bid-overlay">
      <div className="bid-panel-mobile">

        {/* Purple ribbon header */}
        <div className="bid-title-ribbon">
          <span>SELECT BID</span>
        </div>

        {/* Bid number grid */}
        <div className="bid-grid-container">
          {isLastBidder && (
            <div className="bid-forbidden-notice">
              Cannot bid <strong>{forbiddenBid}</strong>
            </div>
          )}
          <div className="bid-grid">
            {bids.map(b => {
              const isForbidden = isLastBidder && b === forbiddenBid;
              return (
                <button
                  key={b}
                  className={`bid-tile ${isForbidden ? 'forbidden' : ''}`}
                  onClick={() => !isForbidden && onBid(b)}
                  disabled={isForbidden}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </div>

        {/* Re-Deal button */}
        {onRedeal && (
          <button className="redeal-btn" onClick={onRedeal}>
            <span className="redeal-icon">🎬</span> Re-Deal
          </button>
        )}
      </div>
    </div>
  );
}
