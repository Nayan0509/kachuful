import React, { useState, useEffect, useCallback, useRef } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import ScoreBoard from './components/ScoreBoard';
import Toast from './components/Toast';
import './styles/App.css';

export default function App() {
  const [screen, setScreen] = useState('lobby');
  const [gameState, setGameState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [toast, setToast] = useState(null);
  const [trickWon, setTrickWon] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((msg, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type, id: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      const newId = socket.id;
      setMyId(newId);

      const savedRoom = localStorage.getItem('kachuful_room');
      const savedPid  = localStorage.getItem('kachuful_pid');
      const savedName = localStorage.getItem('kachuful_name');
      if (savedRoom && savedPid && savedName) {
        socket.emit('rejoinRoom', { roomId: savedRoom, oldId: savedPid, name: savedName });
      }
    });

    socket.on('roomCreated', ({ roomId }) => {
      setRoomId(roomId);
      localStorage.setItem('kachuful_room', roomId);
    });

    socket.on('roomJoined', ({ roomId, name }) => {
      setRoomId(roomId);
      localStorage.setItem('kachuful_room', roomId);
      if (name) localStorage.setItem('kachuful_name', name);
    });

    socket.on('gameState', (state) => {
      setGameState(state);
      if (state.state === 'gameOver') setScreen('gameOver');
      else if (state.state !== 'lobby') setScreen('game');
      else setScreen('lobby');
    });

    socket.on('trickWon', ({ winnerId, winnerName, trick }) => {
      setTrickWon({ winnerId, winnerName, trick });
      setTimeout(() => setTrickWon(null), 1800);
    });

    socket.on('autoActed', ({ playerId, playerName, action }) => {
      showToast(`⏱ ${playerName || 'Player'}: ${action}`, 'info');
    });

    socket.on('kicked', ({ message }) => {
      showToast(message, 'error');
      localStorage.removeItem('kachuful_room');
      localStorage.removeItem('kachuful_pid');
      setScreen('lobby');
      setGameState(null);
      setRoomId(null);
    });

    socket.on('error', ({ message }) => showToast(message, 'error'));

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
            localStorage.removeItem('kachuful_room');
            localStorage.removeItem('kachuful_pid');
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
