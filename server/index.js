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
const turnTimers = {}; // roomId -> { timer, deadline }

// ─── Timer helpers ────────────────────────────────────────────────────────────
const TURN_TIMEOUT = 15000;

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
  const deadline = Date.now() + TURN_TIMEOUT;
  turnTimers[roomId] = {
    deadline,
    timer: setTimeout(() => autoAct(roomId), TURN_TIMEOUT)
  };
  // Broadcast deadline so clients can show countdown
  io.to(roomId).emit('turnTimer', { deadline, playerId: room.currentPlayer });
}

function autoAct(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.state === 'bidding') {
    // Auto bid 0 (safe default)
    const forbidden = getForbiddenBid(room);
    const autoBid = forbidden === 0 ? 1 : 0;
    room.bids[room.currentPlayer] = autoBid;
    io.to(roomId).emit('autoActed', { playerId: room.currentPlayer, action: `bid ${autoBid}` });
    nextBidder(roomId);
  } else if (room.state === 'playing') {
    // Auto play first legal card
    const hand = room.hands[room.currentPlayer] || [];
    if (hand.length === 0) return;
    let card = hand[0];
    if (room.leadSuit) {
      const suited = hand.find(c => c.suit === room.leadSuit);
      if (suited) card = suited;
    }
    io.to(roomId).emit('autoActed', { playerId: room.currentPlayer, action: 'played a card' });
    playCard(roomId, room.currentPlayer, card);
  }
}

function getForbiddenBid(room) {
  const remaining = room.players.filter(p => !(p.id in room.bids));
  if (remaining.length === 1) {
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
    // rejoin map: name -> { score, oldId }
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
    currentTrick: room.currentTrick, leadSuit: room.leadSuit,
    currentPlayer: room.currentPlayer, dealerIndex: room.dealerIndex,
    scores: room.scores, chat: room.chat.slice(-50),
    forbiddenBid,
    turnDeadline: timer ? timer.deadline : null
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

function nextBidder(roomId) {
  const room = rooms[roomId];
  const remaining = room.players.filter(p => !(p.id in room.bids));
  if (remaining.length === 0) {
    room.state = 'playing';
    room.currentPlayer = room.players[(room.dealerIndex + 1) % room.players.length].id;
  } else {
    room.currentPlayer = remaining[0].id;
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
  if (room.currentTrick.length > 0 && room.leadSuit) {
    const hasSuit = hand.some(c => c.suit === room.leadSuit);
    if (hasSuit && card.suit !== room.leadSuit) return { error: 'Must follow suit' };
  }
  hand.splice(idx, 1);
  if (room.currentTrick.length === 0) room.leadSuit = card.suit;
  room.currentTrick.push({ playerId, card });

  if (room.currentTrick.length === room.players.length) {
    const winnerId = determineTrickWinner(room.currentTrick, room.trumpSuit, room.leadSuit);
    room.tricks[winnerId] = (room.tricks[winnerId] || 0) + 1;
    const snap = [...room.currentTrick];
    room.currentTrick = [];
    room.leadSuit = null;
    io.to(roomId).emit('trickWon', { winnerId, trick: snap });
    const total = Object.values(room.tricks).reduce((a, b) => a + b, 0);
    if (total === room.roundSequence[room.round - 1]) {
      clearTurnTimer(roomId);
      endRound(roomId);
    } else {
      room.currentPlayer = winnerId;
      broadcastRoom(roomId);
      startTurnTimer(roomId);
    }
  } else {
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
    if (room.players.length >= 7) return socket.emit('error', { message: 'Room full (max 7)' });
    if (room.players.find(p => p.id === socket.id)) return;
    // Duplicate name check — append suffix if taken
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

  // Rejoin mid-game: client sends saved roomId + old socketId
  socket.on('rejoinRoom', ({ roomId, oldId, name }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', { message: 'Room not found' });

    // Find by oldId first, then by name as fallback
    let player = room.players.find(p => p.id === oldId);
    if (!player && name) player = room.players.find(p => p.name === name && !p.connected);
    if (!player) return socket.emit('error', { message: 'Player not found in room' });

    // Remap socket id
    const oldSocketId = player.id;
    player.id = socket.id;
    player.connected = true;

    // Remap hands, bids, tricks
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
      return socket.emit('error', { message: `You cannot bid ${forbidden} — total bids cannot equal ${room.roundSequence[room.round - 1]}` });
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

  // Host kicks a player (lobby only)
  socket.on('kickPlayer', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.host !== socket.id) return socket.emit('error', { message: 'Only host can kick' });
    if (room.state !== 'lobby') return socket.emit('error', { message: 'Can only kick in lobby' });
    if (playerId === socket.id) return socket.emit('error', { message: 'Cannot kick yourself' });
    room.players = room.players.filter(p => p.id !== playerId);
    io.to(playerId).emit('kicked', { message: 'You were removed from the room' });
    broadcastRoom(roomId);
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
        // Save rejoin info
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
