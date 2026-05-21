import React from 'react';
import Card from './Card';
import '../styles/BidPanel.css';

const IS_RED = s => s === '♥' || s === '♦';

// Standard rank order (low → high) used to sort the visible hand
const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_ORDER = ['♠', '♥', '♦', '♣'];

export default function BidPanel({ roundNumber, trumpCard, myHand, forbiddenBid, onBid }) {
  const bids = Array.from({ length: roundNumber + 1 }, (_, i) => i);
  const isLastBidder = forbiddenBid !== null && forbiddenBid !== undefined;

  // Sort the hand so it's easy to read: trump suit first, then by suit, then by rank desc
  const trumpSuit = trumpCard?.suit;
  const sortedHand = (myHand || []).slice().sort((a, b) => {
    const aTrump = a.suit === trumpSuit ? 0 : 1;
    const bTrump = b.suit === trumpSuit ? 0 : 1;
    if (aTrump !== bTrump) return aTrump - bTrump;
    const sA = SUIT_ORDER.indexOf(a.suit);
    const sB = SUIT_ORDER.indexOf(b.suit);
    if (sA !== sB) return sA - sB;
    return RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank);
  });
  const trumpCount = trumpSuit ? sortedHand.filter(c => c.suit === trumpSuit).length : 0;

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

        {/* Your hand — visible while choosing a bid */}
        {sortedHand.length > 0 && (
          <div className="bid-hand-block">
            <div className="bid-hand-label">
              <span>YOUR HAND</span>
              <span className="bid-hand-meta">
                {sortedHand.length} card{sortedHand.length !== 1 ? 's' : ''}
                {trumpSuit && (
                  <>
                    {' · '}
                    <span className={`bid-hand-trump-count ${IS_RED(trumpSuit) ? 'red' : 'blk'}`}>
                      {trumpCount} {trumpSuit}
                    </span>
                  </>
                )}
              </span>
            </div>
            <div className="bid-hand-strip">
              {sortedHand.map((card, i) => {
                const isTrump = trumpSuit && card.suit === trumpSuit;
                return (
                  <div
                    key={`${card.suit}-${card.rank}-${i}`}
                    className={`bid-hand-card-wrap ${isTrump ? 'trump' : ''}`}
                    style={{ '--bi': i }}
                  >
                    <Card card={card} small />
                  </div>
                );
              })}
            </div>
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
