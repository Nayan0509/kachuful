import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import BidPanel from './BidPanel';
import '../styles/GameTable.css';

// Fallback timeouts (used only if the server didn't broadcast turnDuration)
const BID_TIMEOUT_SEC  = 8;
const PLAY_TIMEOUT_SEC = 5;

// Hand-tuned seat positions for 1-6 opponents
const SEAT_POSITIONS_FIXED = {
  1: [[50, 12]],
  2: [[24, 16], [76, 16]],
  3: [[8, 48], [50, 8], [92, 48]],
  4: [[8, 48], [30, 10], [70, 10], [92, 48]],
  5: [[8, 48], [20, 20], [50, 8], [80, 20], [92, 48]],
  6: [[8, 44], [17, 18], [37, 7], [63, 7], [83, 18], [92, 44]]
};

// Distribute N opponents along an arc above the table center.
// Used for 7+ opponents (no hand-tuned layout); also for any count when needed.
function generateSeatPositions(n) {
  if (n <= 0) return [];
  if (SEAT_POSITIONS_FIXED[n]) return SEAT_POSITIONS_FIXED[n];
  const positions = [];
  const cx = 50, cy = 36;     // arc center
  const rx = 44, ry = 28;     // arc radii (% of table)
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const angle = Math.PI - t * Math.PI;  // π (left) → 0 (right), arcing over the top
    const x = cx + Math.cos(angle) * rx;
    const y = cy - Math.sin(angle) * ry;
    positions.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  return positions;
}

// Detect portrait orientation (responsive layout switch).
function useIsPortrait() {
  const get = () => typeof window !== 'undefined'
    && window.matchMedia('(orientation: portrait)').matches;
  const [isPortrait, setIsPortrait] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const handler = (e) => setIsPortrait(e.matches);
    // Use both for cross-browser support
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);
  return isPortrait;
}

// One distinct color gradient per player index (0-6)
const AVATAR_COLORS = [
  'linear-gradient(135deg, #2563eb, #1d4ed8)',
  'linear-gradient(135deg, #9333ea, #7c3aed)',
  'linear-gradient(135deg, #dc2626, #b91c1c)',
  'linear-gradient(135deg, #059669, #047857)',
  'linear-gradient(135deg, #d97706, #b45309)',
  'linear-gradient(135deg, #db2777, #be185d)',
  'linear-gradient(135deg, #0891b2, #0e7490)',
];

const IS_RED = s => s === '♥' || s === '♦';

export default function GameTable({ socket, myId, roomId, gameState, trickWon, showToast }) {
  const [timeLeft, setTimeLeft] = useState(null);
  // Local "in-flight action" lock so the user gets immediate feedback after clicking
  // a card or bid. Cleared whenever gameState.currentPlayer or gameState.state changes.
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);
  const healTimerRef = useRef(null);

  const myHand     = gameState.myHand || [];
  const isBidding  = gameState.state === 'bidding';
  const isPlaying  = gameState.state === 'playing';
  const myBid      = gameState.bids[myId];
  const myTricks   = gameState.tricks[myId] || 0;
  const isMyBidTurn  = isBidding && gameState.currentPlayer === myId && myBid === undefined && !submitting;
  const isMyPlayTurn = isPlaying && gameState.currentPlayer === myId && !submitting;
  const isHost     = gameState.host === myId;

  // Clear the submit lock whenever the server has advanced (different turn / phase / hand size).
  useEffect(() => {
    setSubmitting(false);
  }, [gameState.currentPlayer, gameState.state, gameState.currentTrick.length, myHand.length]);

  const me        = gameState.players.find(p => p.id === myId);
  const opponents = gameState.players.filter(p => p.id !== myId);
  const positions = generateSeatPositions(opponents.length);
  const isPortrait = useIsPortrait();

  // How many cards each player still holds this trick-sequence
  const totalTricksPlayed = gameState.totalTricksPlayed ??
    Object.values(gameState.tricks || {}).reduce((a, b) => a + b, 0);
  const cardsRemaining = Math.max(0, (gameState.currentCards || 0) - totalTricksPlayed);

  const getPlayerColor = (playerId) => {
    const idx = gameState.players.findIndex(p => p.id === playerId);
    return AVATAR_COLORS[idx % AVATAR_COLORS.length];
  };

  // Countdown timer — ticks at 100ms for a smooth bar on the short play timer.
  // Self-heal: if the local clock hits 0 and the server hasn't pushed a new
  // gameState within 2s, request a fresh state. Recovers from any desync.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (healTimerRef.current) clearTimeout(healTimerRef.current);
    if (!gameState.turnDeadline) { setTimeLeft(null); return; }
    const tick = () => {
      const left = Math.max(0, (gameState.turnDeadline - Date.now()) / 1000);
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(timerRef.current);
        // Wait 2s for the server's auto-act broadcast; if nothing arrives, ask for state.
        healTimerRef.current = setTimeout(() => {
          if (socket && roomId) socket.emit('requestState', { roomId });
        }, 2000);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 100);
    return () => {
      clearInterval(timerRef.current);
      if (healTimerRef.current) clearTimeout(healTimerRef.current);
    };
  }, [gameState.turnDeadline, gameState.currentPlayer, socket, roomId]);

  // Persist session for rejoin
  useEffect(() => {
    if (roomId && myId) {
      localStorage.setItem('kachuful_room', roomId);
      localStorage.setItem('kachuful_pid', myId);
    }
  }, [roomId, myId]);

  const handlePlayCard = (card) => {
    if (!isMyPlayTurn) return showToast('Not your turn', 'error');
    setSubmitting(true);
    socket.emit('playCard', { roomId, card });
    // Safety: if the server doesn't acknowledge in 3s, release the lock so the user can retry.
    setTimeout(() => setSubmitting(false), 3000);
  };

  // Returns 'legal' | 'illegal' | 'disabled'
  const getCardLegality = (card) => {
    if (!isMyPlayTurn) return 'disabled';
    const ls = gameState.leadSuit;
    if (!ls) return 'legal';
    const hasSuit = myHand.some(c => c.suit === ls);
    if (hasSuit && card.suit !== ls) return 'illegal';
    return 'legal';
  };

  const handleBid = (bid) => {
    setSubmitting(true);
    socket.emit('placeBid', { roomId, bid });
    setTimeout(() => setSubmitting(false), 3000);
  };
  const handleNextRound = () => socket.emit('nextRound', { roomId });

  // Pick the timer cap from server-provided duration if present; otherwise fall back per phase.
  const timerCap = gameState.turnDuration
    ? gameState.turnDuration / 1000
    : (isBidding ? BID_TIMEOUT_SEC : PLAY_TIMEOUT_SEC);
  const timerPct   = timeLeft !== null ? Math.min(100, (timeLeft / timerCap) * 100) : 100;
  // Color thresholds scale with the cap: red in the last 30%, amber in the next 30%, green otherwise.
  const timerColor = timeLeft <= timerCap * 0.3
    ? '#ef4444'
    : timeLeft <= timerCap * 0.6
      ? '#f59e0b'
      : '#10b981';

  const currentPlayerName = gameState.players.find(p => p.id === gameState.currentPlayer)?.name || '';

  const phaseLabel = isBidding ? 'BIDDING' : isPlaying ? 'PLAYING' : gameState.state === 'roundEnd' ? 'ROUND END' : '';
  const phaseClass = isBidding ? 'bidding' : isPlaying ? 'playing' : 'roundend';

  return (
    <div className="gt-root">

      {/* ── Top bar ── */}
      <div className="gt-topbar">
        <div className="gt-topbar-left">
          <div className="gt-room-pill">
            <span className="gt-room-label">ROOM</span>
            <span className="gt-room-code">{roomId}</span>
          </div>
          <div className="gt-player-count">{gameState.players.length} players</div>
        </div>

        <div className="gt-topbar-center">
          <span className="gt-round-text">Round</span>
          <span className="gt-round-number">{gameState.round}</span>
          <span className="gt-round-sep">of</span>
          <span className="gt-round-total">{gameState.maxRounds}</span>
          {phaseLabel && (
            <span className={`gt-phase-chip gt-phase-${phaseClass}`}>{phaseLabel}</span>
          )}
        </div>

        <div className="gt-topbar-right">
          {gameState.trumpCard ? (
            // key forces a remount + replay of trumpPulse each round
            <div
              key={`trump-r${gameState.round}-${gameState.trumpCard.suit}${gameState.trumpCard.rank}`}
              className="gt-trump-pill"
              title={`Trump suit for round ${gameState.round}: ${gameState.trumpCard.suit}`}
            >
              <span className="gt-trump-label-sm">TRUMP</span>
              <span className={`gt-trump-suit ${IS_RED(gameState.trumpCard.suit) ? 'red' : ''}`}>
                {gameState.trumpCard.suit}
              </span>
              <span className="gt-trump-rank">{gameState.trumpCard.rank}</span>
            </div>
          ) : (
            <div
              key={`trump-r${gameState.round}-none`}
              className="gt-trump-pill gt-trump-pill-none"
              title="No-trump round"
            >
              <span className="gt-trump-label-sm">NO TRUMP</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Turn timer bar ── */}
      {timeLeft !== null && (
        <div className="gt-timer-wrap">
          <div className="gt-timer-bar">
            <div className="gt-timer-fill" style={{ width: `${timerPct}%`, background: timerColor }} />
          </div>
          <div className="gt-timer-info">
            <span className="gt-timer-player" style={{ color: timerColor }}>
              {currentPlayerName}{gameState.currentPlayer === myId ? ' (You)' : ''}
            </span>
            <span className="gt-timer-secs" style={{ color: timerColor }}>{Math.ceil(timeLeft)}s</span>
          </div>
        </div>
      )}

      {/* ── Content: table + sidebar ── */}
      <div className="gt-content">

        {/* ── Game table ── */}
        <div className={`gt-table ${isPortrait ? 'portrait' : 'landscape'}`}>

          {/* Felt surface with oval shape */}
          <div className="gt-felt" />

          {/* ── Opponent seats ── */}
          <div className="gt-opponents">
            {opponents.map((opp, i) => {
              const pos = positions[i] || [50, 12];
              return (
                <PlayerSeat
                  key={opp.id}
                  player={opp}
                  leftPct={pos[0]}
                  topPct={pos[1]}
                  bid={gameState.bids[opp.id]}
                  tricks={gameState.tricks[opp.id] || 0}
                  isActive={gameState.currentPlayer === opp.id}
                  isBidding={isBidding}
                  cardsRemaining={cardsRemaining}
                  avatarColor={getPlayerColor(opp.id)}
                  isHostUser={isHost}
                  onKick={(pid) => socket.emit('kickPlayer', { roomId, playerId: pid })}
                />
              );
            })}
          </div>

          {/* ── Center area ── */}
          <div className="gt-center">

            {/* Trump card on display during bidding */}
            {isBidding && gameState.trumpCard && (
              <div className="gt-trump-center">
                <div className="gt-trump-center-label">TRUMP CARD</div>
                <Card card={gameState.trumpCard} />
              </div>
            )}

            {/* Current trick cards */}
            {!isBidding && gameState.currentTrick.length > 0 && (
              <div className="gt-trick-pile">
                {gameState.currentTrick.map((t, i) => {
                  const pName = gameState.players.find(p => p.id === t.playerId)?.name || '?';
                  return (
                    <div key={i} className="gt-trick-slot" style={{ '--i': i }}>
                      <Card card={t.card} small />
                      <div className="gt-trick-name">{pName.slice(0, 8)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty center hint during playing */}
            {isPlaying && gameState.currentTrick.length === 0 && !trickWon && (
              <div className="gt-center-hint">
                {isMyPlayTurn ? 'Play a card' : `${currentPlayerName} to play`}
              </div>
            )}

            {/* Trick won overlay */}
            {trickWon && (
              <div className="gt-trick-won">
                <div className="gt-trick-won-icon">🎉</div>
                <div className="gt-trick-won-text">
                  {trickWon.winnerName || gameState.players.find(p => p.id === trickWon.winnerId)?.name || 'Player'} wins!
                </div>
              </div>
            )}
          </div>

          {/* ── My seat (bottom) ── */}
          <div className={`gt-my-seat ${gameState.currentPlayer === myId ? 'active' : ''}`}>

            {/* Bid/status bubble — only show once a final bid is placed.
                The bid panel handles "your turn to bid" state. */}
            {myBid !== undefined && (
              <div className="gt-bubble">
                {isBidding
                  ? `Bid: ${myBid}`
                  : `${myBid} bid · ${myTricks} won`}
              </div>
            )}

            <div className="gt-my-avatar" style={{ background: getPlayerColor(myId) }}>
              <span className="gt-avatar-letter">{me?.name?.[0]?.toUpperCase() || '?'}</span>
            </div>
            <div className="gt-my-name">{me?.name || 'You'}</div>
            <div className="gt-my-score">{me?.score ?? 0} pts</div>
          </div>

          {/* ── My hand cards ── */}
          <div className="gt-my-hand">
            {isMyPlayTurn && gameState.leadSuit && myHand.some(c => c.suit === gameState.leadSuit) && (
              <div className={`gt-lead-hint ${IS_RED(gameState.leadSuit) ? 'red' : ''}`}>
                Follow suit: <span className="gt-lead-suit">{gameState.leadSuit}</span>
              </div>
            )}
            {myHand.map((card, i) => {
              const legality  = getCardLegality(card);
              const isIllegal = legality === 'illegal';
              const isDisabled = legality === 'disabled';
              return (
                <Card
                  key={`${card.suit}-${card.rank}-${i}`}
                  card={card}
                  onClick={(!isDisabled && !isIllegal) ? () => handlePlayCard(card) : undefined}
                  disabled={isDisabled}
                  illegal={isIllegal}
                  glow={isMyPlayTurn && !isIllegal}
                  style={{ '--card-i': i }}
                />
              );
            })}
          </div>
        </div>

        {/* ── Sidebar: live scoreboard ── */}
        <div className="gt-sidebar">
          <div className="gt-sb-header">
            <span className="gt-sb-title">SCORES</span>
            <span className="gt-sb-round">{gameState.currentCards} cards</span>
          </div>

          <div className="gt-sb-list">
            {[...gameState.players]
              .sort((a, b) => b.score - a.score)
              .map((p, rankIdx) => {
                const bid     = gameState.bids[p.id];
                const tricks  = gameState.tricks[p.id] || 0;
                const isMe    = p.id === myId;
                const isActive = gameState.currentPlayer === p.id;
                const rankEmoji = rankIdx === 0 ? '🥇' : rankIdx === 1 ? '🥈' : rankIdx === 2 ? '🥉' : `#${rankIdx + 1}`;
                const bidHit  = bid !== undefined && bid === tricks;

                return (
                  <div
                    key={p.id}
                    className={[
                      'gt-sb-row',
                      isMe     ? 'me'      : '',
                      isActive ? 'active'  : '',
                      !p.connected ? 'offline' : ''
                    ].filter(Boolean).join(' ')}
                  >
                    <span className="gt-sb-rank">{rankEmoji}</span>
                    <div className="gt-sb-info">
                      <div className="gt-sb-name">
                        {isActive && <span className="gt-sb-dot" />}
                        {!p.connected && <span className="gt-sb-dc">⚡</span>}
                        <span className="gt-sb-nametxt">{p.name}</span>
                      </div>
                      {bid !== undefined && (
                        <div className={`gt-sb-bid ${bidHit ? 'hit' : 'miss'}`}>
                          {bid} bid · {tricks} won
                        </div>
                      )}
                    </div>
                    <div className="gt-sb-score">{p.score}</div>
                  </div>
                );
              })}
          </div>

          {/* Scoring legend */}
          <div className="gt-sb-legend">
            <div className="gt-sb-legend-row hit">✓ Exact → 10 + tricks</div>
            <div className="gt-sb-legend-row miss">✗ Wrong → 0 pts</div>
          </div>
        </div>
      </div>

      {/* ── Bid panel (modal overlay) ── */}
      {isMyBidTurn && (
        <BidPanel
          roundNumber={gameState.currentCards}
          trumpCard={gameState.trumpCard}
          myHand={myHand}
          forbiddenBid={gameState.forbiddenBid}
          onBid={handleBid}
        />
      )}

      {/* ── Round end overlay ── */}
      {gameState.state === 'roundEnd' && (
        <div className="gt-ree-overlay">
          <div className="gt-ree-panel">
            <div className="gt-ree-header">
              <div className="gt-ree-title">Round {gameState.round} Complete</div>
              <div className="gt-ree-sub">
                {gameState.currentCards} card{gameState.currentCards !== 1 ? 's' : ''} dealt
              </div>
            </div>

            <table className="gt-ree-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Bid</th>
                  <th>Won</th>
                  <th>Pts</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(gameState.scores[gameState.scores.length - 1]?.playerScores || [])
                  .slice()
                  .sort((a, b) => b.delta - a.delta || b.total - a.total)
                  .map(ps => (
                    <tr
                      key={ps.id}
                      className={[
                        ps.id === myId ? 'me' : '',
                        ps.delta > 0 ? 'hit' : 'miss'
                      ].filter(Boolean).join(' ')}
                    >
                      <td className="gt-ree-name">{ps.name}</td>
                      <td>{ps.bid}</td>
                      <td>{ps.tricks}</td>
                      <td className={`gt-ree-delta ${ps.delta > 0 ? 'pos' : 'zero'}`}>
                        {ps.delta > 0 ? `+${ps.delta}` : '—'}
                      </td>
                      <td className="gt-ree-total">{ps.total}</td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {isHost ? (
              <button className="btn btn-primary gt-ree-next" onClick={handleNextRound}>
                Next Round →
              </button>
            ) : (
              <div className="gt-ree-wait">Waiting for host to start next round…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* PlayerSeat: renders one opponent's seat at an absolute position    */
/* ─────────────────────────────────────────────────────────────────── */
function PlayerSeat({
  player, leftPct, topPct,
  bid, tricks, isActive, isBidding,
  cardsRemaining, avatarColor, isHostUser, onKick
}) {
  const initial  = player.name?.[0]?.toUpperCase() || '?';
  const hasBid   = bid !== undefined;
  const bidHit   = hasBid && bid === tricks && !isBidding;

  return (
    <div
      className={[
        'gt-seat',
        isActive      ? 'active'  : '',
        !player.connected ? 'offline' : ''
      ].filter(Boolean).join(' ')}
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
    >
      {/* Face-down cards above avatar */}
      {!isBidding && cardsRemaining > 0 && (
        <div className="gt-seat-cards">
          {Array.from({ length: Math.min(cardsRemaining, 5) }).map((_, ci) => (
            <Card key={ci} card={{ suit: '♠', rank: 'A' }} faceDown small />
          ))}
        </div>
      )}

      {/* Avatar circle */}
      <div className={`gt-seat-avatar ${isActive ? 'active' : ''}`} style={{ background: avatarColor }}>
        <span className="gt-seat-letter">{initial}</span>
      </div>

      {/* Name + bid info */}
      <div className="gt-seat-label">
        <div className="gt-seat-name">
          {!player.connected && <span className="gt-dc-icon">⚡</span>}
          {player.name}
        </div>
        {hasBid ? (
          <div className={`gt-seat-bid ${bidHit ? 'hit' : ''}`}>
            {bid} bid · {tricks} won
          </div>
        ) : (
          <div className="gt-seat-score">{player.score} pts</div>
        )}
      </div>

      {/* Host kick button */}
      {isHostUser && (
        <button
          className="gt-kick-btn"
          onClick={() => onKick(player.id)}
          title={`Kick ${player.name}`}
        >×</button>
      )}
    </div>
  );
}
