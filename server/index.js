const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const {
  maxRound, dealRound, determineTrickWinner, calcScore
} = require('./gameEngine');

const app = express();
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// ─── Serve React build ────────────────────────────────────────────────────────
const BUILD_DIR = path.join(__dirname, 'public');
app.use(express.static(BUILD_DIR));

const server = http.createServer(app);

const io = new Server(server, {
  path: '/api/socket',
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] }
});

// ─── In-memory state ─────────────────────────────────────────────────────────
const rooms = {}; // roomId -> Room

function createRoom(hostId, hostName) {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  rooms[roomId] = {
    id: roomId,
    host: hostId,
    players: [{ id: hostId, name: hostName, score: 0, connected: true }],
    state: 'lobby',   // lobby | bidding | playing | roundEnd | gameOver
    round: 0,
    maxRounds: 0,
    hands: {},
    trumpCard: null,
    trumpSuit: null,
    bids: {},
    tricks: {},
    currentTrick: [],
    leadSuit: null,
    currentPlayer: null,
    dealerIndex: 0,
    scores: [],       // [{round, playerScores:[{id,name,bid,tricks,delta,total}]}]
    chat: []
  };
  return roomId;
}

function getPublicRoom(room) {
  return {
    id: room.id,
    host: room.host,
    players: room.players.map(p => ({
      id: p.id, name: p.name, score: p.score, connected: p.connected
    })),
    state: room.state,
    round: room.round,
    maxRounds: room.maxRounds,
    trumpCard: room.trumpCard,
    trumpSuit: room.trumpSuit,
    bids: room.bids,
    tricks: room.tricks,
    currentTrick: room.currentTrick,
    leadSuit: room.leadSuit,
    currentPlayer: room.currentPlayer,
    dealerIndex: room.dealerIndex,
    scores: room.scores,
    chat: room.chat.slice(-50)
  };
}

function broadcastRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const pub = getPublicRoom(room);
  // Send each player their own hand
  room.players.forEach(p => {
    const hand = room.hands[p.id] || [];
    io.to(p.id).emit('gameState', { ...pub, myHand: hand });
  });
}

function startRound(roomId) {
  const room = rooms[roomId];
  room.round += 1;
  const { hands, trumpCard, trumpSuit } = dealRound(room.players, room.round);
  room.hands = hands;
  room.trumpCard = trumpCard;
  room.trumpSuit = trumpSuit;
  room.bids = {};
  room.tricks = Object.fromEntries(room.players.map(p => [p.id, 0]));
  room.currentTrick = [];
  room.leadSuit = null;
  room.state = 'bidding';
  // Bidding starts left of dealer
  const bidStart = (room.dealerIndex + 1) % room.players.length;
  room.currentPlayer = room.players[bidStart].id;
  broadcastRoom(roomId);
}

function nextBidder(roomId) {
  const room = rooms[roomId];
  const bidders = Object.keys(room.bids);
  const remaining = room.players.filter(p => !bidders.includes(p.id));
  if (remaining.length === 0) {
    // All bids in — start playing
    room.state = 'playing';
    const leadIdx = (room.dealerIndex + 1) % room.players.length;
    room.currentPlayer = room.players[leadIdx].id;
    broadcastRoom(roomId);
    return;
  }
  room.currentPlayer = remaining[0].id;
  broadcastRoom(roomId);
}

function playCard(roomId, playerId, card) {
  const room = rooms[roomId];
  if (room.state !== 'playing') return { error: 'Not playing phase' };
  if (room.currentPlayer !== playerId) return { error: 'Not your turn' };

  const hand = room.hands[playerId];
  const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (idx === -1) return { error: 'Card not in hand' };

  // Validate follow-suit
  if (room.currentTrick.length > 0 && room.leadSuit) {
    const hasSuit = hand.some(c => c.suit === room.leadSuit);
    if (hasSuit && card.suit !== room.leadSuit) return { error: 'Must follow suit' };
  }

  hand.splice(idx, 1);
  if (room.currentTrick.length === 0) room.leadSuit = card.suit;
  room.currentTrick.push({ playerId, card });

  if (room.currentTrick.length === room.players.length) {
    // Resolve trick
    const winnerId = determineTrickWinner(room.currentTrick, room.trumpSuit, room.leadSuit);
    room.tricks[winnerId] = (room.tricks[winnerId] || 0) + 1;
    const trickSnapshot = [...room.currentTrick];
    room.currentTrick = [];
    room.leadSuit = null;

    // Emit trick result before clearing
    io.to(roomId).emit('trickWon', { winnerId, trick: trickSnapshot });

    // Check if round over
    const totalTricks = Object.values(room.tricks).reduce((a, b) => a + b, 0);
    if (totalTricks === room.round) {
      endRound(roomId);
    } else {
      room.currentPlayer = winnerId;
      broadcastRoom(roomId);
    }
  } else {
    // Next player
    const idx2 = room.players.findIndex(p => p.id === playerId);
    room.currentPlayer = room.players[(idx2 + 1) % room.players.length].id;
    broadcastRoom(roomId);
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

  room.scores.push({ round: room.round, playerScores });
  room.dealerIndex = (room.dealerIndex + 1) % room.players.length;

  if (room.round >= room.maxRounds) {
    room.state = 'gameOver';
  }

  broadcastRoom(roomId);
}

// ─── Socket handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('createRoom', ({ name }) => {
    const roomId = createRoom(socket.id, name);
    socket.join(roomId);
    socket.join(socket.id); // personal channel
    socket.emit('roomCreated', { roomId });
    broadcastRoom(roomId);
  });

  socket.on('joinRoom', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.state !== 'lobby') return socket.emit('error', { message: 'Game already started' });
    if (room.players.length >= 7) return socket.emit('error', { message: 'Room full (max 7)' });
    if (room.players.find(p => p.id === socket.id)) return;

    room.players.push({ id: socket.id, name, score: 0, connected: true });
    socket.join(roomId);
    socket.join(socket.id);
    socket.emit('roomJoined', { roomId });
    broadcastRoom(roomId);
  });

  socket.on('rejoinRoom', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    const player = room.players.find(p => p.id === playerId);
    if (!player) return socket.emit('error', { message: 'Player not found' });
    player.connected = true;
    socket.join(roomId);
    socket.join(socket.id);
    broadcastRoom(roomId);
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return socket.emit('error', { message: 'Only host can start' });
    if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players' });
    room.maxRounds = maxRound(room.players.length);
    room.state = 'playing';
    startRound(roomId);
  });

  socket.on('placeBid', ({ roomId, bid }) => {
    const room = rooms[roomId];
    if (!room || room.state !== 'bidding') return;
    if (room.currentPlayer !== socket.id) return;
    room.bids[socket.id] = bid;
    nextBidder(roomId);
  });

  socket.on('playCard', ({ roomId, card }) => {
    const result = playCard(roomId, socket.id, card);
    if (result?.error) socket.emit('error', { message: result.error });
  });

  socket.on('nextRound', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;
    if (room.state !== 'roundEnd') return;
    startRound(roomId);
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
        broadcastRoom(roomId);
      }
    }
  });
});

// ─── REST: room info for invite links ────────────────────────────────────────
app.get('/room/:id', (req, res) => {
  const room = rooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Not found' });
  res.json({ id: room.id, players: room.players.length, state: room.state });
});

// ─── Catch-all: serve React for any non-API route ─────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Kachuful server on :${PORT}`));
