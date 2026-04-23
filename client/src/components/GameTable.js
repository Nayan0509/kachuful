import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import BidPanel from './BidPanel';
import '../styles/GameTable.css';

const TURN_TIMEOUT = 15;

export default function GameTable({ socket, myId, roomId, gameState, trickWon, showToast }) {
  const [chatMsg, setChatMsg] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);
  const chatRef = useRef(null);
  const timerRef = useRef(null);

  const myHand = gameState.myHand || [];
  const isBidding = gameState.state === 'bidding';
  const isPlaying = gameState.state === 'playing';
  const myBid = gameState.bids[myId];
  const myTricks = gameState.tricks[myId] || 0;
  const isMyPlayTurn = isPlaying && gameState.currentPlayer === myId;
  const isMyBidTurn = isBidding && gameState.currentPlayer === myId && myBid === undefined;
  const isHost = gameState.host === myId;
  const opponents = gameState.players.filter(p => p.id !== myId);

  // ── Turn countdown ──────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [gameState.chat]);

  // Save roomId + socketId for rejoin
  useEffect(() => {
    if (roomId && myId) {
      sessionStorage.setItem('kachuful_room', roomId);
      sessionStorage.setItem('kachuful_pid', myId);
    }
  }, [roomId, myId]);

  const handlePlayCard = (card) => {
    if (!isMyPlayTurn) return showToast('Not your turn', 'error');
    socket.emit('playCard', { roomId, card });
  };

  const handleBid = (bid) => socket.emit('placeBid', { roomId, bid });
  const handleNextRound = () => socket.emit('nextRound', { roomId });
  const handleKick = (pid) => socket.emit('kickPlayer', { roomId, playerId: pid });

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    socket.emit('chatMessage', { roomId, message: chatMsg.trim() });
    setChatMsg('');
  };

  // Position opponents around the felt ellipse
  const getOpponentPosition = (idx, total) => {
    const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
    return {
      left: `${50 + 42 * Math.cos(angle)}%`,
      top:  `${50 + 32 * Math.sin(angle)}%`,
      transform: 'translate(-50%, -50%)'
    };
  };

  const getTrickCardPosition = (idx, total) => {
    const angle = (idx / total) * Math.PI * 2;
    const r = 55;
    return {
      left: `calc(50% + ${r * Math.cos(angle)}px)`,
      top:  `calc(50% + ${r * Math.sin(angle)}px)`,
      transform: 'translate(-50%, -50%)'
    };
  };

  const getTrickWinnerName = () => {
    if (!trickWon) return '';
    return gameState.players.find(p => p.id === trickWon.winnerId)?.name || '';
  };

  const timerPct = timeLeft !== null ? (timeLeft / TURN_TIMEOUT) * 100 : 100;
  const timerColor = timeLeft <= 5 ? '#e03030' : timeLeft <= 10 ? '#f0c040' : '#4caf50';

  const currentPlayerName = gameState.players.find(p => p.id === gameState.currentPlayer)?.name || '';

  return (
    <div className="game-table">

      {/* ── Header ── */}
      <div className="gt-header">
        <div className="gt-title">♠ Kachuful ♥</div>
        <div className="gt-round-info">
          Round {gameState.round}/{gameState.maxRounds}&nbsp;·&nbsp;
          <span style={{ color: 'var(--gold)' }}>
            {gameState.currentCards} card{gameState.currentCards !== 1 ? 's' : ''}
          </span>
          {gameState.roundSequence?.length > 0 && (() => {
            const max = Math.max(...gameState.roundSequence);
            const peakIdx = gameState.roundSequence.indexOf(max);
            const going = gameState.round - 1 <= peakIdx ? '▲' : '▼';
            return <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, marginLeft: 6 }}>{going}</span>;
          })()}
        </div>
        <div className="gt-trump">
          <span className="trump-label">Trump:</span>
          {gameState.trumpCard ? <Card card={gameState.trumpCard} small /> : <span>None</span>}
        </div>
      </div>

      {/* ── Turn timer bar — always in grid ── */}
      {timeLeft !== null ? (
        <div className="turn-timer-bar">
          <div
            className="turn-timer-fill"
            style={{ width: `${timerPct}%`, background: timerColor, position:'absolute', left:0, top:0, bottom:0, transition:'width .25s linear,background .5s' }}
          />
          <span className="turn-timer-label" style={{ color: timerColor, position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, textShadow:'0 1px 4px rgba(0,0,0,.8)', zIndex:1 }}>
            ⏱ {currentPlayerName}'s turn · {timeLeft}s
          </span>
        </div>
      ) : (
        <div className="turn-timer-bar-empty" />
      )}

      {/* ── Felt ── */}
      <div className="gt-felt">

        {/* My cards shown IN the felt at bottom — always face-up */}
        <div className="my-felt-hand">
          {myHand.map((card, i) => (
            <Card
              key={`${card.suit}-${card.rank}-${i}`}
              card={card}
              faceDown={false}
              onClick={isMyPlayTurn ? () => handlePlayCard(card) : undefined}
              disabled={!isMyPlayTurn}
              glow={isMyPlayTurn}
              style={{ animationDelay: `${i * 0.05}s` }}
            />
          ))}
        </div>

        {/* My status label */}
        <div className="my-felt-label">
          {isBidding && myBid === undefined && !isMyBidTurn && '⏳ Waiting to bid...'}
          {isBidding && myBid !== undefined && `Your bid: ${myBid}`}
          {isPlaying && myBid !== undefined && `Bid: ${myBid} · Tricks: ${myTricks}`}
          {isMyPlayTurn && '👆 Your turn!'}
        </div>

        {/* Opponents */}
        <div className="opponents-ring">
          {opponents.map((opp, i) => {
            const pos = getOpponentPosition(i, opponents.length);
            const oppBid = gameState.bids[opp.id];
            const oppTricks = gameState.tricks[opp.id] || 0;
            const isActive = gameState.currentPlayer === opp.id;
            return (
              <div key={opp.id} className="opponent-seat" style={pos}>
                <div className={`opponent-name ${isActive ? 'active-player' : ''} ${!opp.connected ? 'disconnected' : ''}`}>
                  {!opp.connected && '⚡ '}{opp.name}
                  {isBidding && isActive && ' 🤔'}
                  {isPlaying && isActive && ' 🃏'}
                </div>
                <div className="opponent-bid-badge">
                  {oppBid !== undefined
                    ? `${oppBid} / ${oppTricks}`
                    : isBidding ? 'bidding...' : ''}
                </div>
                <div className="opponent-cards">
                  {Array.from({ length: gameState.currentCards || 1 }).map((_, ci) => (
                    <Card key={ci} card={{ suit: '♠', rank: 'A' }} faceDown small />
                  ))}
                </div>
                {/* Host kick button — lobby only */}
                {isHost && gameState.state === 'lobby' && opp.id !== myId && (
                  <button className="kick-btn" onClick={() => handleKick(opp.id)} title="Remove player">✕</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Trick area */}
        <div className="trick-area">
          {gameState.currentTrick.map((t, i) => (
            <div key={i} className="trick-card-wrapper"
              style={getTrickCardPosition(i, gameState.players.length)}>
              <Card card={t.card} small />
            </div>
          ))}
          {trickWon && (
            <div className="trick-won-overlay">
              <div className="trick-won-text">{getTrickWinnerName()} wins! 🎉</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div className="gt-sidebar">
        <div className="sidebar-scores">
          <h3>Scores</h3>
          {gameState.players.map(p => {
            const bid = gameState.bids[p.id];
            const tricks = gameState.tricks[p.id] || 0;
            return (
              <div key={p.id} className={`score-row ${p.id === myId ? 'me' : ''} ${!p.connected ? 'offline' : ''}`}>
                <span className="sname">{!p.connected ? '⚡ ' : ''}{p.name}</span>
                {bid !== undefined && <span className="sbid">{bid}/{tricks}</span>}
                <span className="stotal">{p.score}</span>
                {isHost && gameState.state === 'lobby' && p.id !== myId && (
                  <button className="kick-btn-sm" onClick={() => handleKick(p.id)}>✕</button>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar-chat">
          <h3>Chat</h3>
          <div className="chat-messages" ref={chatRef}>
            {gameState.chat.map(msg => (
              <div key={msg.id} className="chat-msg">
                <span className="cname">{msg.name}:</span>
                <span className="ctext">{msg.message}</span>
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input className="input" placeholder="Say something..."
              value={chatMsg} onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()} maxLength={120} />
            <button className="chat-send" onClick={sendChat}>➤</button>
          </div>
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

      {/* ── Round end ── */}
      {gameState.state === 'roundEnd' && (
        <div className="round-end-overlay">
          <div className="round-end-panel">
            <h2>Round {gameState.round} Complete</h2>
            <table className="round-score-table">
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
              : <p className="waiting-msg">Waiting for host...</p>
            }
          </div>
        </div>
      )}
    </div>
  );
}
