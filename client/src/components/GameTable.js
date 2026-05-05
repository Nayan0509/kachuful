import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import BidPanel from './BidPanel';
import '../styles/GameTable.css';

const TURN_TIMEOUT = 15;

// Format coin amounts like the game: 1.5 Lac, 3.64 Cr, etc.
function formatCoins(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(2) + ' Lac';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

// Suit display name for HUKAM badge
const SUIT_NAME = { '♠': 'SPADES', '♥': 'HEARTS', '♦': 'DIAMONDS', '♣': 'CLUBS' };
const SUIT_COLOR = { '♠': '#1a1a2e', '♥': '#dc2626', '♦': '#dc2626', '♣': '#1a1a2e' };

export default function GameTable({ socket, myId, roomId, gameState, trickWon, showToast }) {
  const [timeLeft, setTimeLeft] = useState(null);
  const [showBootAnim, setShowBootAnim] = useState(false);
  const timerRef = useRef(null);
  const prevStateRef = useRef(null);

  const myHand = gameState.myHand || [];
  const isBidding = gameState.state === 'bidding';
  const isPlaying = gameState.state === 'playing';
  const myBid = gameState.bids[myId];
  const myTricks = gameState.tricks[myId] || 0;
  const isMyPlayTurn = isPlaying && gameState.currentPlayer === myId;
  const isMyBidTurn = isBidding && gameState.currentPlayer === myId && myBid === undefined;
  const isHost = gameState.host === myId;

  // Separate players into positions: me (bottom), and up to 3 opponents
  const me = gameState.players.find(p => p.id === myId);
  const opponents = gameState.players.filter(p => p.id !== myId);
  // Assign positions: top, left, right based on count
  const positionMap = ['top', 'left', 'right'];
  const positionedOpponents = opponents.map((opp, i) => ({
    ...opp,
    position: positionMap[i] || 'top'
  }));

  // Turn countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!gameState.turnDeadline) { setTimeLeft(null); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((gameState.turnDeadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) clearInterval(timerRef.current);
    };
    tick();
    timerRef.current = setInterval(tick, 250);
    return () => clearInterval(timerRef.current);
  }, [gameState.turnDeadline, gameState.currentPlayer]);

  // Boot amount animation when round starts
  useEffect(() => {
    if (prevStateRef.current === 'lobby' && gameState.state === 'bidding') {
      setShowBootAnim(true);
      setTimeout(() => setShowBootAnim(false), 2500);
    }
    prevStateRef.current = gameState.state;
  }, [gameState.state]);

  // Save session
  useEffect(() => {
    if (roomId && myId) {
      localStorage.setItem('kachuful_room', roomId);
      localStorage.setItem('kachuful_pid', myId);
    }
  }, [roomId, myId]);

  const handlePlayCard = (card) => {
    if (!isMyPlayTurn) return showToast('Not your turn', 'error');
    socket.emit('playCard', { roomId, card });
  };

  // Follow-suit: if lead suit exists and player has that suit, only those cards are legal
  const getCardLegality = (card) => {
    if (!isMyPlayTurn) return 'disabled';
    const leadSuit = gameState.leadSuit;
    if (!leadSuit) return 'legal'; // first card of trick — anything goes
    const hasSuit = myHand.some(c => c.suit === leadSuit);
    if (hasSuit && card.suit !== leadSuit) return 'illegal';
    return 'legal';
  };

  const handleBid = (bid) => socket.emit('placeBid', { roomId, bid });
  const handleNextRound = () => socket.emit('nextRound', { roomId });
  const handleKick = (pid) => socket.emit('kickPlayer', { roomId, playerId: pid });

  const getTrickCardPosition = (idx, total) => {
    const angle = (idx / total) * Math.PI * 2;
    const r = 52;
    return {
      left: `calc(50% + ${r * Math.cos(angle)}px)`,
      top: `calc(50% + ${r * Math.sin(angle)}px)`,
      transform: 'translate(-50%, -50%)'
    };
  };

  const getTrickWinnerName = () => {
    if (!trickWon) return '';
    return gameState.players.find(p => p.id === trickWon.winnerId)?.name || '';
  };

  const timerPct = timeLeft !== null ? (timeLeft / TURN_TIMEOUT) * 100 : 100;
  const timerColor = timeLeft <= 5 ? '#ef4444' : timeLeft <= 10 ? '#f59e0b' : '#10b981';
  const trumpSuit = gameState.trumpCard?.suit;

  return (
    <div className="gt-root">

      {/* ── Top bar ── */}
      <div className="gt-topbar">
        <div className="gt-topbar-left">
          <button className="gt-icon-btn" title="Back">←</button>
          <div className="gt-coins-display">
            <span className="gt-coin-icon">🪙</span>
            <span className="gt-coin-amount">{formatCoins(gameState.pot || 0)}</span>
          </div>
        </div>
        <div className="gt-topbar-center">
          <span className="gt-round-badge">Round : {gameState.round}/{gameState.maxRounds}</span>
        </div>
        <div className="gt-topbar-right">
          {trumpSuit && (
            <div className="gt-hukam-badge" style={{ background: SUIT_COLOR[trumpSuit] }}>
              <span className="gt-hukam-suit">{trumpSuit}</span>
              <span className="gt-hukam-label">HUKAM</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Turn timer ── */}
      {timeLeft !== null && (
        <div className="gt-timer-bar">
          <div
            className="gt-timer-fill"
            style={{ width: `${timerPct}%`, background: timerColor }}
          />
        </div>
      )}

      {/* ── Main table ── */}
      <div className="gt-table">

        {/* Diamond felt background */}
        <div className="gt-felt-diamond" />

        {/* ── Top player ── */}
        {positionedOpponents.filter(o => o.position === 'top').map(opp => (
          <PlayerSeat
            key={opp.id}
            player={opp}
            position="top"
            bid={gameState.bids[opp.id]}
            tricks={gameState.tricks[opp.id] || 0}
            isActive={gameState.currentPlayer === opp.id}
            isBidding={isBidding}
            cardCount={gameState.currentCards || 1}
            isHost={isHost}
            myId={myId}
            onKick={handleKick}
          />
        ))}

        {/* ── Left player ── */}
        {positionedOpponents.filter(o => o.position === 'left').map(opp => (
          <PlayerSeat
            key={opp.id}
            player={opp}
            position="left"
            bid={gameState.bids[opp.id]}
            tricks={gameState.tricks[opp.id] || 0}
            isActive={gameState.currentPlayer === opp.id}
            isBidding={isBidding}
            cardCount={gameState.currentCards || 1}
            isHost={isHost}
            myId={myId}
            onKick={handleKick}
          />
        ))}

        {/* ── Right player ── */}
        {positionedOpponents.filter(o => o.position === 'right').map(opp => (
          <PlayerSeat
            key={opp.id}
            player={opp}
            position="right"
            bid={gameState.bids[opp.id]}
            tricks={gameState.tricks[opp.id] || 0}
            isActive={gameState.currentPlayer === opp.id}
            isBidding={isBidding}
            cardCount={gameState.currentCards || 1}
            isHost={isHost}
            myId={myId}
            onKick={handleKick}
          />
        ))}

        {/* ── Center area: trick cards or status ── */}
        <div className="gt-center">
          {showBootAnim ? (
            <div className="gt-boot-anim">
              <div className="gt-boot-text">Collecting Boot Amount..</div>
              <div className="gt-boot-coins">🪙</div>
            </div>
          ) : (
            <div className="gt-trick-area">
              {gameState.currentTrick.map((t, i) => (
                <div
                  key={i}
                  className="gt-trick-card"
                  style={getTrickCardPosition(i, gameState.players.length)}
                >
                  <Card card={t.card} small />
                </div>
              ))}
              {trickWon && (
                <div className="gt-trick-won">
                  <span>{getTrickWinnerName()} wins! 🎉</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom: my seat ── */}
        <div className="gt-my-seat">
          {/* My bid speech bubble */}
          {myBid !== undefined && (
            <div className="gt-my-bid-bubble">
              {isBidding ? `I Bid ${myBid}` : `Bid: ${myBid} · Tricks: ${myTricks}`}
            </div>
          )}
          {isMyBidTurn && (
            <div className="gt-my-bid-bubble waiting">Waiting to bid...</div>
          )}

          {/* My avatar */}
          <div className={`gt-avatar-wrap ${gameState.currentPlayer === myId ? 'active' : ''}`}>
            <div className="gt-avatar gt-avatar-me">
              <span className="gt-avatar-initial">{me?.name?.[0]?.toUpperCase() || '?'}</span>
            </div>
            <div className="gt-player-name">{me?.name || 'You'}</div>
            <div className="gt-player-coins">
              <span className="gt-coin-icon-sm">🪙</span>
              {formatCoins(me?.score || 0)}
            </div>
          </div>
        </div>

        {/* ── My hand cards ── */}
        <div className="gt-my-hand">
          {/* Lead suit hint */}
          {isMyPlayTurn && gameState.leadSuit && myHand.some(c => c.suit === gameState.leadSuit) && (
            <div className="gt-lead-hint">
              Must play <span style={{ color: ['♥','♦'].includes(gameState.leadSuit) ? '#ef4444' : '#fff' }}>
                {gameState.leadSuit}
              </span>
            </div>
          )}
          {myHand.map((card, i) => {
            const legality = getCardLegality(card);
            const isIllegal = legality === 'illegal';
            const isDisabled = legality === 'disabled';
            return (
              <Card
                key={`${card.suit}-${card.rank}-${i}`}
                card={card}
                faceDown={false}
                onClick={(!isDisabled && !isIllegal) ? () => handlePlayCard(card) : undefined}
                disabled={isDisabled || isIllegal}
                glow={isMyPlayTurn && !isIllegal}
                style={{
                  animationDelay: `${i * 0.05}s`,
                  ...(isIllegal ? { opacity: 0.35, filter: 'grayscale(60%)' } : {})
                }}
              />
            );
          })}
        </div>

      </div>

      {/* ── Bid panel ── */}
      {isMyBidTurn && (
        <BidPanel
          roundNumber={gameState.currentCards}
          trumpCard={gameState.trumpCard}
          myHand={myHand}
          forbiddenBid={gameState.forbiddenBid}
          onBid={handleBid}
        />
      )}

      {/* ── Right scorecard ── */}
      <div className="gt-scorecard">
        <div className="gt-scorecard-title">SCORES</div>
        {[...gameState.players]
          .sort((a, b) => b.score - a.score)
          .map((p, rankIdx) => {
            const bid    = gameState.bids[p.id];
            const tricks = gameState.tricks[p.id] || 0;
            const isMe   = p.id === myId;
            const isActive = gameState.currentPlayer === p.id;
            const rank = rankIdx + 1;
            const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            return (
              <div key={p.id} className={`gt-scorecard-row ${isMe ? 'me' : ''} ${isActive ? 'active' : ''} ${!p.connected ? 'offline' : ''}`}>
                <span className="gt-sc-rank">{rankEmoji}</span>
                <div className="gt-sc-name">
                  {isActive && <span className="gt-sc-dot" />}
                  {!p.connected && '⚡ '}
                  {p.name}
                </div>
                <div className="gt-sc-right">
                  {bid !== undefined && (
                    <span className="gt-sc-bid">{bid}/{tricks}</span>
                  )}
                  <span className="gt-sc-total">{p.score}</span>
                </div>
              </div>
            );
          })}
      </div>

      {/* ── Round end overlay ── */}
      {gameState.state === 'roundEnd' && (
        <div className="gt-round-end-overlay">
          <div className="gt-round-end-panel">
            <h2>Round {gameState.round} Complete</h2>
            <table className="gt-score-table">
              <thead>
                <tr><th>Player</th><th>Bid</th><th>Tricks</th><th>Points</th><th>Total</th></tr>
              </thead>
              <tbody>
                {gameState.scores[gameState.scores.length - 1]?.playerScores.map(ps => (
                  <tr key={ps.id} className={ps.id === myId ? 'me' : ''}>
                    <td>{ps.name}</td>
                    <td>{ps.bid}</td>
                    <td>{ps.tricks}</td>
                    <td className={ps.delta > 0 ? 'delta-pos' : 'delta-zero'}>
                      {ps.delta > 0 ? `+${ps.delta}` : '0'}
                    </td>
                    <td>{ps.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {isHost
              ? <button className="btn btn-primary" onClick={handleNextRound}>Next Round ▶</button>
              : <p className="gt-waiting-msg">Waiting for host...</p>
            }
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Player Seat Component ── */
function PlayerSeat({ player, position, bid, tricks, isActive, isBidding, cardCount, isHost, myId, onKick }) {
  const initials = player.name?.[0]?.toUpperCase() || '?';

  return (
    <div className={`gt-player-seat gt-seat-${position}`}>
      <div className={`gt-avatar-wrap ${isActive ? 'active' : ''} ${!player.connected ? 'offline' : ''}`}>
        <div className="gt-avatar">
          <span className="gt-avatar-initial">{initials}</span>
        </div>
        <div className="gt-player-name">
          {!player.connected && '⚡ '}{player.name}
        </div>
        <div className="gt-player-coins">
          <span className="gt-coin-icon-sm">🪙</span>
          {bid !== undefined
            ? `${bid} / ${tricks}`
            : isBidding ? 'bidding...' : String(player.score || 0)}
        </div>
      </div>

      {/* Face-down cards */}
      <div className={`gt-opp-cards gt-opp-cards-${position}`}>
        {Array.from({ length: Math.min(cardCount, 5) }).map((_, ci) => (
          <Card key={ci} card={{ suit: '♠', rank: 'A' }} faceDown small />
        ))}
      </div>

      {isHost && player.id !== myId && (
        <button className="gt-kick-btn" onClick={() => onKick(player.id)}>✕</button>
      )}
    </div>
  );
}
