import React, { useState, useEffect } from 'react';
import '../styles/Lobby.css';

export default function Lobby({ socket, myId, roomId, gameState, showToast }) {
  const [name, setName] = useState(() => localStorage.getItem('kachuful_name') || '');
  const [joinCode, setJoinCode] = useState('');
  const [joined, setJoined] = useState(false);

  // Read invite room from URL
  const inviteRoom = new URLSearchParams(window.location.search).get('room');

  useEffect(() => {
    if (inviteRoom) setJoinCode(inviteRoom.toUpperCase());
  }, [inviteRoom]);

  // If user already has a saved name AND there's an invite link → auto-join immediately
  useEffect(() => {
    if (inviteRoom && name.trim() && myId && !joined) {
      socket.emit('joinRoom', { roomId: inviteRoom.toUpperCase(), name: name.trim() });
    }
  }, [myId]); // fires once socket connects and myId is set

  useEffect(() => {
    if (roomId) setJoined(true);
  }, [roomId]);

  const saveName = (n) => {
    setName(n);
    localStorage.setItem('kachuful_name', n);
  };

  const handleCreate = () => {
    if (!name.trim()) return showToast('Enter your name first', 'error');
    socket.emit('createRoom', { name: name.trim() });
  };

  const handleJoin = () => {
    if (!name.trim()) return showToast('Enter your name first', 'error');
    if (!joinCode.trim()) return showToast('Enter a room code', 'error');
    socket.emit('joinRoom', { roomId: joinCode.trim().toUpperCase(), name: name.trim() });
  };

  // Join via invite link after typing name
  const handleInviteJoin = () => {
    if (!name.trim()) return showToast('Enter your name first', 'error');
    socket.emit('joinRoom', { roomId: inviteRoom.toUpperCase(), name: name.trim() });
  };

  const handleStart = () => {
    socket.emit('startGame', { roomId });
  };

  const copyInvite = () => {
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => showToast('Invite link copied!', 'success'));
  };

  const isHost = gameState?.host === myId;
  const players = gameState?.players || [];

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-title">
          <span className="suit">♠</span>
          <h1>Kachuful</h1>
          <span className="suit red">♥</span>
        </div>
        <p className="lobby-subtitle">The Ultimate Trick-Taking Card Game</p>

        {!joined ? (
          <div className="lobby-form">

            {/* Invite link detected — show focused join UI */}
            {inviteRoom ? (
              <>
                <div className="invite-banner">
                  🎴 You've been invited to room <strong>{inviteRoom}</strong>
                </div>
                <input
                  className="input"
                  placeholder="Enter your name to join"
                  value={name}
                  onChange={e => saveName(e.target.value)}
                  maxLength={20}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleInviteJoin()}
                />
                <button className="btn btn-primary" onClick={handleInviteJoin}>
                  ▶ Join Room {inviteRoom}
                </button>
                <div className="divider"><span>or</span></div>
                <button className="btn btn-secondary" onClick={handleCreate}>
                  Create a new room instead
                </button>
              </>
            ) : (
              <>
                <input
                  className="input"
                  placeholder="Your name"
                  value={name}
                  onChange={e => saveName(e.target.value)}
                  maxLength={20}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <button className="btn btn-primary" onClick={handleCreate}>
                  ✦ Create Room
                </button>
                <div className="divider"><span>or join</span></div>
                <div className="join-row">
                  <input
                    className="input"
                    placeholder="Room code"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  />
                  <button className="btn btn-secondary" onClick={handleJoin}>Join</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="lobby-room">
            <div className="room-code-box">
              <span className="room-label">Room Code</span>
              <span className="room-code">{roomId}</span>
              <button className="btn-icon" onClick={copyInvite} title="Copy invite link">
                🔗
              </button>
            </div>

            <div className="player-list">
              {players.map((p, i) => (
                <div key={p.id} className={`player-chip ${p.id === myId ? 'me' : ''}`}>
                  <span className="player-avatar">{p.name[0].toUpperCase()}</span>
                  <span>{p.name}</span>
                  {gameState?.host === p.id && <span className="crown">👑</span>}
                  {i === 0 && <span className="badge">Host</span>}
                </div>
              ))}
              {players.length < 7 && (
                <div className="player-chip empty">
                  <span className="player-avatar">+</span>
                  <span>Waiting...</span>
                </div>
              )}
            </div>

            <div className="lobby-info">
              <span>2–7 players · {players.length} joined</span>
            </div>

            {isHost && (
              <button
                className={`btn btn-primary btn-start ${players.length < 2 ? 'disabled' : ''}`}
                onClick={handleStart}
                disabled={players.length < 2}
              >
                {players.length < 2 ? 'Waiting for players...' : '▶ Start Game'}
              </button>
            )}
            {!isHost && (
              <p className="waiting-msg">Waiting for host to start...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
