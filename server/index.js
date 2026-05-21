const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const {
  buildRoundSequence, dealRound, determineTrickWinner, calcScore
} = require('./gameEngine');

const app = express();
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const BUILD_DIR = path.join(__dirname, 'public');
app.use(express.static(BUILD_DIR));

const server = http.createServer(app);
const io = new Server(server, {
  path: '/api/socket',
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] }
});

const rooms = {};
const turnTimers = {};

// Per-phase auto-act timeouts
const BID_TIMEOUT  = 8000;   // 8s to choose a bid, else auto-bid 0 (or 1 if 0 forbidden)
const PLAY_TIMEOUT = 5000;   // 5s to play a card, else auto-throw
const TRICK_PAUSE  = 1500;   // matches client trickWon overlay, so the next 5s timer feels honest

function timeoutForState(state) {
  if (state === 'bidding') return BID_TIMEOUT;
  if (state === 'playing') return PLAY_TIMEOUT;
  return 0;
}

function clearTurnTimer(roomId) {
  if (turnTimers[roomId]) {
    clearTimeout(turnTimers[roomId].timer);
    delete turnTimers[roomId];
  }
}

function startTurnTimer(roomId) {
  clearTurnTimer(roomId);
  const room = rooms[roomId];
  if (!room) return;
  const duration = timeoutForState(room.state);
  if (!duration) return;
  const deadline = Date.now() + duration;
  turnTimers[roomId] = {
    deadline,
    duration,
    timer: setTimeout(() => autoAct(roomId), duration)
  };
  io.to(roomId).emit('turnTimer', { deadline, duration, playerId: room.currentPlayer });
}

function autoAct(roomId) {
  try {
    const room = rooms[roomId];
    if (!room) return;
    const currentPlayer = room.players.find(p => p.id === room.currentPlayer);
    const playerName = currentPlayer?.name || 'Player';

    if (room.state === 'bidding') {
      // Don't double-bid if a placeBid sneaked in before this timer fired
      if (room.bids[room.currentPlayer] !== undefined) {
        broadcastRoom(roomId);
        return;
      }
      const forbidden = getForbiddenBid(room);
      const autoBid = forbidden === 0 ? 1 : 0;
      room.bids[room.currentPlayer] = autoBid;
      io.to(roomId).emit('autoActed', {
        playerId: room.currentPlayer,
        playerName,
        action: `bid ${autoBid}`
      });
      nextBidder(roomId);
    } else if (room.state === 'playing') {
      const hand = room.hands[room.currentPlayer] || [];
      if (hand.length === 0) return;
      // Pick a legal card: prefer matching lead suit, otherwise hand[0]
      let card = hand[0];
      if (room.leadSuit) {
        const suited = hand.find(c => c.suit === room.leadSuit);
        if (suited) card = suited;
      }
      io.to(roomId).emit('autoActed', {
        playerId: room.currentPlayer,
        playerName,
        action: 'played a card'
      });
      const result = playCard(roomId, room.currentPlayer, card);
      if (result?.error) {
        // Last-resort: just throw the first card in hand — should always be legal here
        console.warn(`autoAct playCard failed (${result.error}); falling back to hand[0]`);
        const fallback = playCard(roomId, room.currentPlayer, hand[0]);
        if (fallback?.error) {
          // Game is in an inconsistent state — restart the timer so we don't get stuck
          console.error(`autoAct fallback also failed (${fallback.error}); restarting turn timer`);
          startTurnTimer(roomId);
        }
      }
    }
  } catch (err) {
    console.error('autoAct crashed:', err);
    // Make sure the room doesn't end up timer-less
    if (rooms[roomId]) startTurnTimer(roomId);
  }
}

function getForbiddenBid(room) {
  // Only the last player to bid has a restriction
  const unbid = room.players.filter(p => !(p.id in room.bids));
  if (unbid.length === 1) {
    const totalSoFar = Object.values(room.bids).reduce((a, b) => a + b, 0);
    const f = room.roundSequence[room.round - 1] - totalSoFar;
    return f >= 0 ? f : null;
  }
  return null;
}

// ─── Room helpers ─────────────────────────────────────────────────────────────
function createRoom(hostId, hostName) {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  rooms[roomId] = {
    id: roomId, host: hostId,
    players: [{ id: hostId, name: hostName, score: 0, connected: true }],
    state: 'lobby', round: 0,
    roundSequence: [], maxRounds: 0,
    hands: {}, trumpCard: null, trumpSuit: null,
    bids: {}, tricks: {}, currentTrick: [],
    leadSuit: null, currentPlayer: null,
    dealerIndex: 0, scores: [], chat: [],
    rejoinMap: {}
  };
  return roomId;
}

function getPublicRoom(room) {
  const bidders = Object.keys(room.bids);
  const remaining = room.players.filter(p => !bidders.includes(p.id));
  let forbiddenBid = null;
  if (room.state === 'bidding' && remaining.length === 1) {
    const totalSoFar = Object.values(room.bids).reduce((a, b) => a + b, 0);
    const f = (room.roundSequence[room.round - 1] || 0) - totalSoFar;
    forbiddenBid = f >= 0 ? f : null;
  }
  const timer = turnTimers[room.id];
  const totalTricksPlayed = Object.values(room.tricks).reduce((a, b) => a + b, 0);

  return {
    id: room.id, host: room.host,
    players: room.players.map(p => ({
      id: p.id, name: p.name, score: p.score, connected: p.connected
    })),
    state: room.state, round: room.round, maxRounds: room.maxRounds,
    roundSequence: room.roundSequence,
    currentCards: room.roundSequence[room.round - 1] || 0,
    trumpCard: room.trumpCard, trumpSuit: room.trumpSuit,
    bids: room.bids, tricks: room.tricks,
    totalTricksPlayed,
    currentTrick: room.currentTrick, leadSuit: room.leadSuit,
    currentPlayer: room.currentPlayer, dealerIndex: room.dealerIndex,
    scores: room.scores, chat: room.chat.slice(-50),
    forbiddenBid,
    turnDeadline: timer ? timer.deadline : null,
    turnDuration: timer ? timer.duration : null
  };
}

function broadcastRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const pub = getPublicRoom(room);
  room.players.forEach(p => {
    io.to(p.id).emit('gameState', { ...pub, myHand: room.hands[p.id] || [] });
  });
}

function startRound(roomId) {
  const room = rooms[roomId];
  room.round += 1;
  const cardsThisRound = room.roundSequence[room.round - 1];
  const { hands, trumpCard, trumpSuit } = dealRound(room.players, cardsThisRound);
  room.hands = hands;
  room.trumpCard = trumpCard;
  room.trumpSuit = trumpSuit;
  room.bids = {};
  room.tricks = Object.fromEntries(room.players.map(p => [p.id, 0]));
  room.currentTrick = [];
  room.leadSuit = null;
  room.state = 'bidding';
  room.currentPlayer = room.players[(room.dealerIndex + 1) % room.players.length].id;
  broadcastRoom(roomId);
  startTurnTimer(roomId);
}

// Fixed: properly follows circular seating order from current player
function nextBidder(roomId) {
  const room = rooms[roomId];
  const bidCount = Object.keys(room.bids).length;

  if (bidCount >= room.players.length) {
    // All players have bid — start playing
    room.state = 'playing';
    room.currentPlayer = room.players[(room.dealerIndex + 1) % room.players.length].id;
  } else {
    // Advance circularly from current player to find next unbid player
    const currentIdx = room.players.findIndex(p => p.id === room.currentPlayer);
    let nextIdx = (currentIdx + 1) % room.players.length;
    // Skip players who have already bid
    while (room.bids[room.players[nextIdx].id] !== undefined) {
      nextIdx = (nextIdx + 1) % room.players.length;
    }
    room.currentPlayer = room.players[nextIdx].id;
  }
  broadcastRoom(roomId);
  startTurnTimer(roomId);
}

function playCard(roomId, playerId, card) {
  const room = rooms[roomId];
  if (room.state !== 'playing') return { error: 'Not playing phase' };
  if (room.currentPlayer !== playerId) return { error: 'Not your turn' };
  const hand = room.hands[playerId];
  const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (idx === -1) return { error: 'Card not in hand' };

  // Follow-suit enforcement
  if (room.currentTrick.length > 0 && room.leadSuit) {
    const hasSuit = hand.some(c => c.suit === room.leadSuit);
    if (hasSuit && card.suit !== room.leadSuit) return { error: 'Must follow suit' };
  }

  hand.splice(idx, 1);
  if (room.currentTrick.length === 0) room.leadSuit = card.suit;
  room.currentTrick.push({ playerId, card });

  if (room.currentTrick.length === room.players.length) {
    // Trick complete — determine winner
    const winnerId = determineTrickWinner(room.currentTrick, room.trumpSuit, room.leadSuit);
    room.tricks[winnerId] = (room.tricks[winnerId] || 0) + 1;
    const snap = [...room.currentTrick];
    // IMPORTANT: do NOT clear room.currentTrick yet — we want every player to see
    // the final card sit on the table during the trickWon animation.

    const winnerName = room.players.find(p => p.id === winnerId)?.name || 'Player';
    io.to(roomId).emit('trickWon', { winnerId, winnerName, trick: snap });

    const totalTricks = Object.values(room.tricks).reduce((a, b) => a + b, 0);
    const roundComplete = totalTricks === room.roundSequence[room.round - 1];

    // Clear the active turn timer immediately so no one is on a countdown during the pause.
    clearTurnTimer(roomId);
    // Move turn pointer to winner so the UI highlights them — but currentTrick still on table.
    room.currentPlayer = winnerId;
    broadcastRoom(roomId);  // cards still visible at this point

    // Hold cards on the table for TRICK_PAUSE so the losing/non-acting player(s) can see them.
    setTimeout(() => {
      const r = rooms[roomId];
      if (!r) return;
      // Now clear the trick and continue
      r.currentTrick = [];
      r.leadSuit = null;

      if (roundComplete) {
        endRound(roomId);              // endRound broadcasts the roundEnd state
      } else {
        if (r.state !== 'playing' || r.currentPlayer !== winnerId) return;
        startTurnTimer(roomId);
        broadcastRoom(roomId);         // fresh state with cleared trick + new turn deadline
      }
    }, TRICK_PAUSE);
  } else {
    // Next player in circular order
    const i = room.players.findIndex(p => p.id === playerId);
    room.currentPlayer = room.players[(i + 1) % room.players.length].id;
    broadcastRoom(roomId);
    startTurnTimer(roomId);
  }
  return { ok: true };
}

function endRound(roomId) {
  const room = rooms[roomId];
  room.state = 'roundEnd';
  const playerScores = room.players.map(p => {
    const bid = room.bids[p.id] ?? 0;
    const tricks = room.tricks[p.id] ?? 0;
    const delta = calcScore(bid, tricks);
    p.score += delta;
    return { id: p.id, name: p.name, bid, tricks, delta, total: p.score };
  });
  room.scores.push({ round: room.round, cardsDealt: room.roundSequence[room.round - 1], playerScores });
  room.dealerIndex = (room.dealerIndex + 1) % room.players.length;
  if (room.round >= room.maxRounds) room.state = 'gameOver';
  broadcastRoom(roomId);
}

// ─── Socket handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('createRoom', ({ name }) => {
    const roomId = createRoom(socket.id, name);
    socket.join(roomId);
    socket.join(socket.id);
    socket.emit('roomCreated', { roomId });
    broadcastRoom(roomId);
  });

  socket.on('joinRoom', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.state !== 'lobby') return socket.emit('error', { message: 'Game already started' });
    if (room.players.find(p => p.id === socket.id)) return;
    // Deduplicate name
    let finalName = name;
    let attempt = 2;
    while (room.players.find(p => p.name.toLowerCase() === finalName.toLowerCase())) {
      finalName = `${name}${attempt++}`;
    }
    room.players.push({ id: socket.id, name: finalName, score: 0, connected: true });
    socket.join(roomId);
    socket.join(socket.id);
    socket.emit('roomJoined', { roomId, name: finalName });
    broadcastRoom(roomId);
  });

  socket.on('rejoinRoom', ({ roomId, oldId, name }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', { message: 'Room not found' });

    let player = room.players.find(p => p.id === oldId);
    if (!player && name) player = room.players.find(p => p.name === name && !p.connected);
    if (!player) return socket.emit('error', { message: 'Player not found in room' });

    const oldSocketId = player.id;
    player.id = socket.id;
    player.connected = true;

    // Remap all game state keyed by socket id
    if (room.hands[oldSocketId]) { room.hands[socket.id] = room.hands[oldSocketId]; delete room.hands[oldSocketId]; }
    if (room.bids[oldSocketId] !== undefined) { room.bids[socket.id] = room.bids[oldSocketId]; delete room.bids[oldSocketId]; }
    if (room.tricks[oldSocketId] !== undefined) { room.tricks[socket.id] = room.tricks[oldSocketId]; delete room.tricks[oldSocketId]; }
    if (room.currentPlayer === oldSocketId) room.currentPlayer = socket.id;
    if (room.host === oldSocketId) room.host = socket.id;

    socket.join(roomId);
    socket.join(socket.id);
    socket.emit('roomJoined', { roomId });
    broadcastRoom(roomId);
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return socket.emit('error', { message: 'Only host can start' });
    if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players' });
    room.roundSequence = buildRoundSequence(room.players.length);
    room.maxRounds = room.roundSequence.length;
    room.round = 0;
    startRound(roomId);
  });

  socket.on('placeBid', ({ roomId, bid }) => {
    const room = rooms[roomId];
    if (!room || room.state !== 'bidding') return;
    if (room.currentPlayer !== socket.id) return;
    const forbidden = getForbiddenBid(room);
    if (bid === forbidden) {
      return socket.emit('error', {
        message: `Cannot bid ${forbidden} — total bids would equal ${room.roundSequence[room.round - 1]}`
      });
    }
    room.bids[socket.id] = bid;
    nextBidder(roomId);
  });

  socket.on('playCard', ({ roomId, card }) => {
    const result = playCard(roomId, socket.id, card);
    if (result?.error) socket.emit('error', { message: result.error });
  });

  socket.on('nextRound', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id || room.state !== 'roundEnd') return;
    startRound(roomId);
  });

  socket.on('kickPlayer', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return socket.emit('error', { message: 'Only host can kick' });
    if (playerId === socket.id) return socket.emit('error', { message: 'Cannot kick yourself' });
    const victim = room.players.find(p => p.id === playerId);
    if (!victim) return;

    // Notify and remove
    io.to(playerId).emit('kicked', { message: 'You were removed from the room' });
    const wasIdx = room.players.findIndex(p => p.id === playerId);
    room.players = room.players.filter(p => p.id !== playerId);
    delete room.hands[playerId];
    delete room.bids[playerId];
    delete room.tricks[playerId];

    // Keep dealerIndex in range
    if (room.players.length > 0) {
      if (room.dealerIndex >= room.players.length) {
        room.dealerIndex = room.dealerIndex % room.players.length;
      } else if (wasIdx >= 0 && wasIdx < room.dealerIndex) {
        // Kicked seat was before the dealer → shift dealer back one to keep pointing at same person
        room.dealerIndex = Math.max(0, room.dealerIndex - 1);
      }
    }

    // If game was in progress and now has <2 players → end the game.
    if (room.state !== 'lobby' && room.players.length < 2) {
      clearTurnTimer(roomId);
      room.state = 'gameOver';
      broadcastRoom(roomId);
      return;
    }

    // Drop any pending cards this player had on the table (their current-trick contribution).
    room.currentTrick = room.currentTrick.filter(t => t.playerId !== playerId);

    // If it was their turn, auto-advance.
    if (room.currentPlayer === playerId) {
      clearTurnTimer(roomId);
      if (room.state === 'bidding') {
        // Find the next un-bid player in circular order from the kicked seat
        // (using players list AFTER removal)
        // Pick the player immediately following the dealer who hasn't bid yet
        const start = (room.dealerIndex + 1) % room.players.length;
        let pickIdx = -1;
        for (let i = 0; i < room.players.length; i++) {
          const idx = (start + i) % room.players.length;
          if (room.bids[room.players[idx].id] === undefined) { pickIdx = idx; break; }
        }
        if (pickIdx === -1) {
          // Everyone remaining has bid → start playing
          room.state = 'playing';
          room.currentPlayer = room.players[(room.dealerIndex + 1) % room.players.length].id;
        } else {
          room.currentPlayer = room.players[pickIdx].id;
        }
        broadcastRoom(roomId);
        startTurnTimer(roomId);
      } else if (room.state === 'playing') {
        // If the kick caused all remaining players to have played to this trick, resolve it.
        if (room.currentTrick.length === room.players.length && room.players.length > 0) {
          // Force trick resolution by replaying playCard logic with the last card on top
          // — easier: just advance to next player who hasn't played
          const playedIds = new Set(room.currentTrick.map(t => t.playerId));
          const next = room.players.find(p => !playedIds.has(p.id));
          room.currentPlayer = next ? next.id : room.players[0].id;
        } else {
          // Advance to next player in seating order
          const next = room.players[0]; // fallback
          room.currentPlayer = next.id;
        }
        broadcastRoom(roomId);
        startTurnTimer(roomId);
      } else {
        broadcastRoom(roomId);
      }
    } else {
      // Host re-pointer if host got kicked (shouldn't happen — they kicked themselves check above).
      broadcastRoom(roomId);
    }
  });

  // Client self-heal: re-push the room state to a possibly-stale client
  socket.on('requestState', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (!room.players.find(p => p.id === socket.id)) return;
    const pub = getPublicRoom(room);
    socket.emit('gameState', { ...pub, myHand: room.hands[socket.id] || [] });
  });

  socket.on('chatMessage', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const msg = { id: uuidv4(), name: player.name, message, ts: Date.now() };
    room.chat.push(msg);
    io.to(roomId).emit('chatMessage', msg);
  });

  socket.on('disconnect', () => {
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.connected = false;
        room.rejoinMap[player.name] = { oldId: socket.id, score: player.score };
        broadcastRoom(roomId);
      }
    }
  });
});

app.get('/room/:id', (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Not found' });
  res.json({ id: room.id, players: room.players.length, state: room.state });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Kachuful server on :${PORT}`));
