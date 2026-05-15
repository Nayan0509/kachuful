import React, { useState } from 'react';
import '../styles/ScoreBoard.css';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function ScoreBoard({ gameState, myId, onPlayAgain }) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const rounds  = gameState.scores || [];

  return (
    <div className="sb-root">

      {/* Decorative corners */}
      <span className="sb-corner sb-tl">♠</span>
      <span className="sb-corner sb-tr">♥</span>
      <span className="sb-corner sb-bl">♣</span>
      <span className="sb-corner sb-br">♦</span>

      <div className="sb-card">

        {/* ── Header ── */}
        <div className="sb-header">
          <div className="sb-game-over">GAME OVER</div>
          <div className="sb-rounds-played">{rounds.length} rounds played</div>
        </div>

        {/* ── Winner banner ── */}
        <div className="sb-winner">
          <div className="sb-trophy">🏆</div>
          <div className="sb-winner-name">{winner.name}</div>
          <div className="sb-winner-score">{winner.score} points</div>
          {winner.id === myId && <div className="sb-you-won">That's you! 🎉</div>}
        </div>

        {/* ── Final leaderboard ── */}
        <div className="sb-section-label">Final Rankings</div>
        <table className="sb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th title="Rounds predicted correctly">✓ Correct</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              const correctRounds = rounds.filter(r =>
                r.playerScores.find(ps => ps.id === p.id && ps.delta > 0)
              ).length;
              const isMe = p.id === myId;

              return (
                <tr key={p.id} className={isMe ? 'me' : ''}>
                  <td className="sb-rank">
                    {i < 3 ? MEDAL[i] : <span className="sb-rank-num">{i + 1}</span>}
                  </td>
                  <td className="sb-player-name">
                    {p.name}
                    {isMe && <span className="sb-you-chip">you</span>}
                  </td>
                  <td className="sb-correct">
                    <span className="sb-correct-num">{correctRounds}</span>
                    <span className="sb-correct-den">/{rounds.length}</span>
                  </td>
                  <td className="sb-score">{p.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ── Scoring legend ── */}
        <div className="sb-legend">
          <div className="sb-legend-hit">✓ Exact prediction → 10 + tricks won (bid 3 = <strong>13 pts</strong>)</div>
          <div className="sb-legend-miss">✗ Wrong prediction → <strong>0 pts</strong></div>
        </div>

        {/* ── Round history (expandable) ── */}
        {rounds.length > 0 && (
          <div className="sb-history">
            <button
              className="sb-history-toggle"
              onClick={() => setHistoryOpen(v => !v)}
            >
              {historyOpen ? '▲' : '▼'} Round History
            </button>

            {historyOpen && (
              <div className="sb-history-scroll">
                <table className="sb-hist-table">
                  <thead>
                    <tr>
                      <th>Rd</th>
                      <th>Cards</th>
                      {sorted.map(p => (
                        <th key={p.id}>{p.name.slice(0, 7)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.map(r => (
                      <tr key={r.round}>
                        <td className="sb-hist-round">R{r.round}</td>
                        <td className="sb-hist-cards">{r.cardsDealt}</td>
                        {sorted.map(p => {
                          const ps = r.playerScores.find(x => x.id === p.id);
                          if (!ps) return <td key={p.id}>—</td>;
                          const hit = ps.delta > 0;
                          return (
                            <td key={p.id} className={hit ? 'hit' : 'miss'}>
                              <span className="sb-hist-cell">
                                <span className="sb-hist-bid">{ps.bid}/{ps.tricks}</span>
                                <span className="sb-hist-pts">{hit ? `+${ps.delta}` : '0'}</span>
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Play again ── */}
        <button className="btn btn-primary sb-play-again" onClick={onPlayAgain}>
          ↩ Back to Lobby
        </button>
      </div>
    </div>
  );
}
