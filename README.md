# ♠ Kachuful

Multiplayer trick-taking card game. React + Node.js. No database, no external services.

## Quick Start

```
1. Double-click  install.bat   (first time only)
2. Double-click  start.bat     (every time)
3. Open          http://localhost:3000
```

## How to Play

- **Create a room** → share the 6-letter code or invite link
- **2–7 players** per room
- Each round, cards dealt = round number (round 1 = 1 card, round 2 = 2 cards...)
- **Bid** how many tricks you'll win
- **Hit your bid exactly** → +10 + (bid × 2) pts
- **Bid 0 and win 0** → +5 pts
- **Miss your bid** → −2 × difference

## Stack

| Layer  | Tech |
|--------|------|
| Server | Node.js, Express, Socket.io |
| Client | React 18, CSS animations |
| State  | In-memory (no DB needed) |
