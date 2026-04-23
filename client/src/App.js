import React, { useState, useEffect, useCallback } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import ScoreBoard from './components/ScoreBoard';
import Toast from './components/Toast';
import './styles/App.css';

export default function App() {
  const [screen, setScreen] = useState('lobby'); // lobby | game | gameOver
  const [gameState, setGameState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [toast, setToast] = useState(null);
  const [trickWon, setTrickWon] = useState(null);

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type, id: Date.now() });
  }, []);

  useEffect(() => {
    socket.connect();
    socket.on('connect', () => setMyId(socket.id));

    socket.on('roomCreated', ({ roomId }) => setRoomId(roomId));
    socket.on('roomJoined',  ({ roomId }) => setRoomId(roomId));

    socket.on('gameState', (state) => {
      setGameState(state);
      if (state.state === 'gameOver') setScreen('gameOver');
      else if (state.state !== 'lobby') setScreen('game');
      else setScreen('lobby');
    });

    socket.on('trickWon', ({ winnerId, trick }) => {
      setTrickWon({ winnerId, trick });
      setTimeout(() => setTrickWon(null), 1800);
    });

    socket.on('error', ({ message }) => showToast(message, 'error'));

    // Handle invite link
    const params = new URLSearchParams(window.location.search);
    const inviteRoom = params.get('room');
    if (inviteRoom) {
      sessionStorage.setItem('inviteRoom', inviteRoom);
    }

    return () => socket.disconnect();
  }, [showToast]);

  return (
    <div className="app">
      <div className="stars" />
      <div className="stars2" />

      {screen === 'lobby' && (
        <Lobby
          socket={socket}
          myId={myId}
          roomId={roomId}
          gameState={gameState}
          showToast={showToast}
        />
      )}

      {screen === 'game' && gameState && (
        <GameTable
          socket={socket}
          myId={myId}
          roomId={roomId}
          gameState={gameState}
          trickWon={trickWon}
          showToast={showToast}
        />
      )}

      {screen === 'gameOver' && gameState && (
        <ScoreBoard
          gameState={gameState}
          myId={myId}
          onPlayAgain={() => {
            setScreen('lobby');
            setGameState(null);
            setRoomId(null);
          }}
        />
      )}

      {toast && <Toast key={toast.id} msg={toast.msg} type={toast.type} />}
    </div>
  );
}
