import React from 'react';
import '../styles/ScoreBoard.css';

export default function ScoreBoard({ gameState, myId, onPlayAgain }) {
  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  // Build per-round history for each player
  const rounds = gameState.scores || [];

  return (
    <div className="scoreboard">
      <div className="scoreboard-card">
        <h1>Game Over</h1>
        <p className="subtitle">{gameState.round} rounds played</p>

        <div className="winner-banner">
          <span className="trophy">🏆</span>
          <span className="wname">{winner.name}</span>
          <span className="wins-label"> wins with {winner.score} pts!</span>
        </div>

        {/* Final leaderboard */}
        <table className="final-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th title="Rounds predicted correctly">✓ Correct</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const correctRounds = rounds.filter(r =>
                r.playerScores.find(ps => ps.id === p.id && ps.delta > 0)
              ).length;
              return (
                <tr key={p.id} className={p.id === myId ? 'me' : ''}>
                  <td className={`rank ${i === 0 ? 'first' : ''}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td>{p.name}</td>
                  <td className="correct-count">{correctRounds}/{rounds.length}</td>
                  <td className="total">{p.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Scoring legend */}
        <div className="score-legend">
          <span className="legend-hit">✓ Correct prediction → 10 + tricks (e.g. bid 3 = <strong>13 pts</strong>)</span>
          <span className="legend-miss">✗ Wrong prediction → <strong>0 pts</strong></span>
        </div>

        {/* Round-by-round history */}
        {rounds.length > 0 && (
          <details className="round-history">
            <summary>Round history</summary>
            <div className="history-scroll">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Round</th>
                    {sorted.map(p => <th key={p.id}>{p.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rounds.map(r => (
                    <tr key={r.round}>
                      <td>R{r.round}</td>
                      {sorted.map(p => {
                        const ps = r.playerScores.find(x => x.id === p.id);
                        if (!ps) return <td key={p.id}>—</td>;
                        const hit = ps.delta > 0;
                        return (
                          <td key={p.id} className={hit ? 'hit' : 'miss'}>
                            {ps.bid}/{ps.tricks}
                            <span className="pts">{hit ? `+${ps.delta}` : '0'}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <button className="btn btn-primary" onClick={onPlayAgain}>
          ↩ Back to Lobby
        </button>
      </div>
    </div>
  );
}
