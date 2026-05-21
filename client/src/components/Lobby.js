import React, { useState, useEffect } from 'react';
import { getOrCreateUsername, saveUsername } from '../utils/username';
import '../styles/Lobby.css';

const ADJECTIVES = ['Swift','Bold','Clever','Lucky','Sharp','Brave','Sly','Wild','Cool','Calm','Fierce','Royal'];
const NOUNS      = ['Fox','Ace','Wolf','King','Hawk','Bear','Lion','Rook','Jack','Duke','Joker','Queen'];

function randomName() {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return adj + noun + Math.floor(Math.random() * 900 + 100);
}

export default function Lobby({ socket, myId, roomId, gameState, showToast }) {
  const [name,     setName]     = useState(() => getOrCreateUsername());
  const [joinCode, setJoinCode] = useState('');
  const [joined,   setJoined]   = useState(false);

  const inviteRoom = new URLSearchParams(window.location.search).get('room');

  useEffect(() => {
    if (inviteRoom) setJoinCode(inviteRoom.toUpperCase());
  }, [inviteRoom]);

  // Auto-join if arriving via invite link
  useEffect(() => {
    if (inviteRoom && name.trim() && myId && !joined) {
      socket.emit('joinRoom', { roomId: inviteRoom.toUpperCase(), name: name.trim() });
    }
  }, [myId]); // eslint-disable-line

  useEffect(() => {
    if (roomId) setJoined(true);
  }, [roomId]);

  const saveName = (n) => {
    setName(n);
    saveUsername(n);
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

  const handleInviteJoin = () => {
    if (!name.trim()) return showToast('Enter your name first', 'error');
    socket.emit('joinRoom', { roomId: inviteRoom.toUpperCase(), name: name.trim() });
  };

  const handleStart = () => socket.emit('startGame', { roomId });

  const copyInvite = () => {
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => showToast('Invite link copied!', 'success'));
  };

  const isHost  = gameState?.host === myId;
  const players = gameState?.players || [];

  return (
    <div className="lobby">

      {/* Decorative suit corner accents */}
      <span className="lobby-corner lobby-corner-tl">♠</span>
      <span className="lobby-corner lobby-corner-tr">♥</span>
      <span className="lobby-corner lobby-corner-bl">♣</span>
      <span className="lobby-corner lobby-corner-br">♦</span>

      <div className="lobby-card">

        {/* Logo / Title */}
        <div className="lobby-logo">
          <span className="lobby-suit black">♠</span>
          <div className="lobby-brand">
            <h1 className="lobby-title">Kachuful</h1>
            <p className="lobby-tagline">The Ultimate Trick-Taking Card Game</p>
          </div>
          <span className="lobby-suit red">♥</span>
        </div>

        <div className="lobby-divider" />

        {!joined ? (
          <div className="lobby-form">

            {inviteRoom ? (
              /* ── Invite flow ── */
              <>
                <div className="invite-banner">
                  <span className="invite-icon">🎴</span>
                  <div>
                    <div className="invite-title">You've been invited!</div>
                    <div className="invite-room">Room: <strong>{inviteRoom}</strong></div>
                  </div>
                </div>

                <div className="name-field">
                  <label className="field-label">Your Name</label>
                  <div className="name-row">
                    <input
                      className="input"
                      placeholder="Enter your name"
                      value={name}
                      onChange={e => saveName(e.target.value)}
                      maxLength={20}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleInviteJoin()}
                    />
                    <button
                      className="btn-dice"
                      onClick={() => saveName(randomName())}
                      title="Random name"
                    >🎲</button>
                  </div>
                  <p className="field-hint">Auto-generated — feel free to edit</p>
                </div>

                <button className="btn btn-primary btn-join-big" onClick={handleInviteJoin}>
                  ▶ Join Room {inviteRoom}
                </button>

                <div className="or-divider"><span>or</span></div>

                <button className="btn btn-ghost" onClick={handleCreate}>
                  Create a new room instead
                </button>
              </>
            ) : (
              /* ── Normal flow ── */
              <>
                <div className="name-field">
                  <label className="field-label">Your Name</label>
                  <div className="name-row">
                    <input
                      className="input"
                      placeholder="Enter your name"
                      value={name}
                      onChange={e => saveName(e.target.value)}
                      maxLength={20}
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                    <button
                      className="btn-dice"
                      onClick={() => saveName(randomName())}
                      title="Random name"
                    >🎲</button>
                  </div>
                  <p className="field-hint">Auto-generated — feel free to edit</p>
                </div>

                <button className="btn btn-primary btn-create" onClick={handleCreate}>
                  ✦ Create New Room
                </button>

                <div className="or-divider"><span>or join existing</span></div>

                <div className="join-row">
                  <input
                    className="input"
                    placeholder="Room code (e.g. ABC123)"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  />
                  <button className="btn btn-secondary btn-join" onClick={handleJoin}>
                    Join
                  </button>
                </div>
              </>
            )}

            {/* Game info strip */}
            <div className="lobby-info-strip">
              <div className="info-item">
                <span className="info-icon">👥</span>
                <span>2+ players</span>
              </div>
              <div className="info-item">
                <span className="info-icon">🃏</span>
                <span>Trick-taking</span>
              </div>
              <div className="info-item">
                <span className="info-icon">⚡</span>
                <span>Real-time</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── Joined room view ── */
          <div className="lobby-room">

            {/* Room code block */}
            <div className="room-block">
              <div className="room-block-label">Room Code</div>
              <div className="room-block-code-row">
                <span className="room-code">{roomId}</span>
                <button className="btn-copy" onClick={copyInvite} title="Copy invite link">
                  🔗 Copy Invite
                </button>
              </div>
            </div>

            {/* Player list */}
            <div className="player-list-wrap">
              <div className="player-list-header">
                <span className="player-list-title">Players</span>
                <span className="player-count-badge">{players.length} joined</span>
              </div>

              <div className="player-list">
                {players.map((p) => (
                  <div key={p.id} className={`player-chip ${p.id === myId ? 'me' : ''}`}>
                    <div
                      className="player-avatar"
                      style={{ background: `hsl(${p.name.charCodeAt(0) * 37 % 360}, 60%, 42%)` }}
                    >
                      {p.name[0].toUpperCase()}
                    </div>
                    <span className="player-chip-name">{p.name}</span>
                    {gameState?.host === p.id && (
                      <span className="host-badge">👑 Host</span>
                    )}
                    {p.id === myId && <span className="you-badge">You</span>}
                    {isHost && p.id !== myId && (
                      <button
                        className="player-chip-kick"
                        title={`Remove ${p.name}`}
                        onClick={() => socket.emit('kickPlayer', { roomId, playerId: p.id })}
                      >×</button>
                    )}
                  </div>
                ))}

                {/* Always show the "waiting" slot so the host knows more can join */}
                <div className="player-chip empty">
                  <div className="player-avatar empty-avatar">+</div>
                  <span className="player-chip-name">Waiting for player…</span>
                </div>
              </div>
            </div>

            {/* Start / waiting section */}
            {isHost ? (
              <div className="host-actions">
                <button
                  className={`btn btn-primary btn-start ${players.length < 2 ? 'disabled' : ''}`}
                  onClick={handleStart}
                  disabled={players.length < 2}
                >
                  {players.length < 2 ? '⏳ Waiting for players…' : '▶ Start Game'}
                </button>
                <p className="host-hint">
                  {players.length < 2
                    ? 'Share the invite link for others to join'
                    : `Ready! ${players.length} player${players.length > 1 ? 's' : ''} joined`}
                </p>
              </div>
            ) : (
              <div className="waiting-block">
                <div className="waiting-spinner" />
                <p className="waiting-msg">Waiting for host to start the game…</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
