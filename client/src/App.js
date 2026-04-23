import React, { useState, useEffect, useCallback } from 'react';
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

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type, id: Date.now() });
  }, []);

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      const newId = socket.id;
      setMyId(newId);

      // Attempt rejoin if we have saved session
      const savedRoom = sessionStorage.getItem('kachuful_room');
      const savedPid  = sessionStorage.getItem('kachuful_pid');
      const savedName = localStorage.getItem('kachuful_name');
      if (savedRoom && savedPid && savedName) {
        socket.emit('rejoinRoom', { roomId: savedRoom, oldId: savedPid, name: savedName });
      }
    });

    socket.on('roomCreated', ({ roomId }) => {
      setRoomId(roomId);
      sessionStorage.setItem('kachuful_room', roomId);
    });
    socket.on('roomJoined', ({ roomId }) => {
      setRoomId(roomId);
      sessionStorage.setItem('kachuful_room', roomId);
    });

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

    socket.on('autoActed', ({ playerId, action }) => {
      // find player name from gameState if available
      showToast(`⏱ Auto: ${action}`, 'info');
    });

    socket.on('kicked', ({ message }) => {
      showToast(message, 'error');
      sessionStorage.removeItem('kachuful_room');
      sessionStorage.removeItem('kachuful_pid');
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
            sessionStorage.removeItem('kachuful_room');
            sessionStorage.removeItem('kachuful_pid');
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
