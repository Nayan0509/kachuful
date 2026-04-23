import React from 'react';
import '../styles/ScoreBoard.css';

export default function ScoreBoard({ gameState, myId, onPlayAgain }) {
  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return (
    <div className="scoreboard">
      <div className="scoreboard-card">
        <h1>Game Over</h1>
        <p className="subtitle">{gameState.round} rounds played</p>

        <div className="winner-banner">
          <span className="trophy">🏆</span>
          <span className="wname">{winner.name}</span>
          <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 14 }}> wins with {winner.score} pts!</span>
        </div>

        <table className="final-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={p.id} className={p.id === myId ? 'me' : ''}>
                <td className={`rank ${i === 0 ? 'first' : ''}`}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td>{p.name}</td>
                <td className="total">{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="btn btn-primary" onClick={onPlayAgain}>
          ↩ Back to Lobby
        </button>
      </div>
    </div>
  );
}
