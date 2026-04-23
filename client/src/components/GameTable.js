import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import BidPanel from './BidPanel';
import '../styles/GameTable.css';

export default function GameTable({ socket, myId, roomId, gameState, trickWon, showToast }) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [chatMsg, setChatMsg] = useState('');
  const chatRef = useRef(null);

  const myHand = gameState.myHand || [];
  const isMyTurn = gameState.currentPlayer === myId;
  const myBid = gameState.bids[myId];
  const myTricks = gameState.tricks[myId] || 0;
  const me = gameState.players.find(p => p.id === myId);
  const opponents = gameState.players.filter(p => p.id !== myId);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [gameState.chat]);

  const handlePlayCard = (card) => {
    if (!isMyTurn) return showToast('Not your turn', 'error');
    socket.emit('playCard', { roomId, card });
    setSelectedCard(null);
  };

  const handleBid = (bid) => {
    socket.emit('placeBid', { roomId, bid });
  };

  const handleNextRound = () => {
    socket.emit('nextRound', { roomId });
  };

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    socket.emit('chatMessage', { roomId, message: chatMsg.trim() });
    setChatMsg('');
  };

  // Position opponents around table
  const getOpponentPosition = (idx, total) => {
    const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
    const rx = 42, ry = 30;
    const x = 50 + rx * Math.cos(angle);
    const y = 50 + ry * Math.sin(angle);
    return { left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' };
  };

  // Position trick cards
  const getTrickCardPosition = (idx, total) => {
    const angle = (idx / total) * Math.PI * 2;
    const r = 60;
    const x = r * Math.cos(angle);
    const y = r * Math.sin(angle);
    return { left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, transform: 'translate(-50%, -50%)' };
  };

  const getTrickWinnerName = () => {
    if (!trickWon) return '';
    const winner = gameState.players.find(p => p.id === trickWon.winnerId);
    return winner ? winner.name : '';
  };

  return (
    <div className="game-table">
      {/* Header */}
      <div className="gt-header">
        <div className="gt-title">♠ Kachuful ♥</div>
        <div className="gt-round-info">
          Round {gameState.round} of {gameState.maxRounds}
        </div>
        <div className="gt-trump">
          <span className="trump-label">Trump:</span>
          {gameState.trumpCard ? (
            <Card card={gameState.trumpCard} small />
          ) : (
            <span>No trump</span>
          )}
        </div>
      </div>

      {/* Felt */}
      <div className="gt-felt">
        {/* Opponents */}
        <div className="opponents-ring">
          {opponents.map((opp, i) => {
            const pos = getOpponentPosition(i, opponents.length);
            const oppBid = gameState.bids[opp.id];
            const oppTricks = gameState.tricks[opp.id] || 0;
            const isActive = gameState.currentPlayer === opp.id;
            return (
              <div key={opp.id} className="opponent-seat" style={pos}>
                <div className={`opponent-name ${isActive ? 'active-player' : ''}`}>
                  {opp.name}
                </div>
                {oppBid !== undefined && (
                  <div className="opponent-bid-badge">
                    {oppBid} / {oppTricks}
                  </div>
                )}
                <div className="opponent-cards">
                  {Array.from({ length: myHand.length }).map((_, ci) => (
                    <Card key={ci} card={{ suit: '♠', rank: 'A' }} faceDown small />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Trick area */}
        <div className="trick-area">
          {gameState.currentTrick.map((t, i) => {
            const pos = getTrickCardPosition(i, gameState.players.length);
            return (
              <div key={i} className="trick-card-wrapper" style={pos}>
                <Card card={t.card} small />
              </div>
            );
          })}
          {trickWon && (
            <div className="trick-won-overlay">
              <div className="trick-won-text">
                {getTrickWinnerName()} wins!
              </div>
            </div>
          )}
        </div>
      </div>

      {/* My hand */}
      <div className="gt-hand">
        <div className="hand-label">
          <span>Your Hand</span>
          {myBid !== undefined && (
            <span className="my-bid-info">
              Bid: {myBid} · Tricks: {myTricks}
            </span>
          )}
        </div>
        <div className="hand-cards">
          {myHand.map((card, i) => (
            <Card
              key={`${card.suit}-${card.rank}`}
              card={card}
              onClick={() => handlePlayCard(card)}
              disabled={!isMyTurn}
              selected={selectedCard === card}
              glow={isMyTurn}
            />
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div className="gt-sidebar">
        {/* Scores */}
        <div className="sidebar-scores">
          <h3>Scores</h3>
          {gameState.players.map(p => {
            const bid = gameState.bids[p.id];
            const tricks = gameState.tricks[p.id] || 0;
            return (
              <div key={p.id} className={`score-row ${p.id === myId ? 'me' : ''}`}>
                <span className="sname">{p.name}</span>
                {bid !== undefined && (
                  <span className="sbid">{bid}/{tricks}</span>
                )}
                <span className="stotal">{p.score}</span>
              </div>
            );
          })}
        </div>

        {/* Chat */}
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
            <input
              className="input"
              placeholder="Say something..."
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              maxLength={120}
            />
            <button className="chat-send" onClick={sendChat}>➤</button>
          </div>
        </div>
      </div>

      {/* Bid panel */}
      {gameState.state === 'bidding' && gameState.currentPlayer === myId && myBid === undefined && (
        <BidPanel
          roundNumber={gameState.round}
          trumpCard={gameState.trumpCard}
          onBid={handleBid}
        />
      )}

      {/* Round end */}
      {gameState.state === 'roundEnd' && (
        <div className="round-end-overlay">
          <div className="round-end-panel">
            <h2>Round {gameState.round} Complete</h2>
            <table className="round-score-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Bid</th>
                  <th>Tricks</th>
                  <th>Points</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {gameState.scores[gameState.scores.length - 1]?.playerScores.map(ps => (
                  <tr key={ps.id} className={ps.id === myId ? 'me' : ''}>
                    <td>{ps.name}</td>
                    <td>{ps.bid}</td>
                    <td>{ps.tricks}</td>
                    <td className={ps.delta >= 0 ? 'delta-pos' : 'delta-neg'}>
                      {ps.delta >= 0 ? '+' : ''}{ps.delta}
                    </td>
                    <td>{ps.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {gameState.host === myId && (
              <button className="btn btn-primary" onClick={handleNextRound}>
                Next Round ▶
              </button>
            )}
            {gameState.host !== myId && (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', fontSize: 13 }}>
                Waiting for host...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
