// Vercel Serverless + Socket.io
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const {
  maxRound, dealRound, determineTrickWinner, calcScore
} = require('./_gameEngine');

let io;
const rooms = {};

function initIO(res) {
  if (io) return io;
  io = new Server({ addTrailingSlash: false, path: '/api/socket' });
  io.attach(res.socket?.server);

  io.on('connection', (socket) => {
    socket.on('createRoom', ({ name }) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      rooms[roomId] = {
        id: roomId, host: socket.id,
        players: [{ id: socket.id, name, score: 0, connected: true }],
        state: 'lobby', round: 0, maxRounds: 0,
        hands: {}, trumpCard: null, trumpSuit: null,
        bids: {}, tricks: {}, currentTrick: [],
        leadSuit: null, currentPlayer: null,
        dealerIndex: 0, scores: [], chat: []
      };
      socket.join(roomId);
      socket.join(socket.id);
      socket.emit('roomCreated', { roomId });
      broadcast(roomId);
    });

    socket.on('joinRoom', ({ roomId, name }) => {
      const room = rooms[roomId];
      if (!room) return socket.emit('error', { message: 'Room not found' });
      if (room.state !== 'lobby') return socket.emit('error', { message: 'Game already started' });
      if (room.players.length >= 7) return socket.emit('error', { message: 'Room full' });
      if (room.players.find(p => p.id === socket.id)) return;
      room.players.push({ id: socket.id, name, score: 0, connected: true });
      socket.join(roomId);
      socket.join(socket.id);
      socket.emit('roomJoined', { roomId });
      broadcast(roomId);
    });

    socket.on('startGame', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.host !== socket.id) return;
      if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players' });
      room.maxRounds = maxRound(room.players.length);
      startRound(roomId);
    });

    socket.on('placeBid', ({ roomId, bid }) => {
      const room = rooms[roomId];
      if (!room || room.state !== 'bidding' || room.currentPlayer !== socket.id) return;
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
        const p = rooms[roomId].players.find(p => p.id === socket.id);
        if (p) { p.connected = false; broadcast(roomId); }
      }
    });
  });

  return io;
}

function broadcast(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const pub = {
    id: room.id, host: room.host,
    players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected })),
    state: room.state, round: room.round, maxRounds: room.maxRounds,
    trumpCard: room.trumpCard, trumpSuit: room.trumpSuit,
    bids: room.bids, tricks: room.tricks,
    currentTrick: room.currentTrick, leadSuit: room.leadSuit,
    currentPlayer: room.currentPlayer, dealerIndex: room.dealerIndex,
    scores: room.scores, chat: room.chat.slice(-50)
  };
  room.players.forEach(p => {
    io.to(p.id).emit('gameState', { ...pub, myHand: room.hands[p.id] || [] });
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
  room.currentPlayer = room.players[(room.dealerIndex + 1) % room.players.length].id;
  broadcast(roomId);
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
  broadcast(roomId);
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
    if (total === room.round) endRound(roomId);
    else { room.currentPlayer = winnerId; broadcast(roomId); }
  } else {
    const i = room.players.findIndex(p => p.id === playerId);
    room.currentPlayer = room.players[(i + 1) % room.players.length].id;
    broadcast(roomId);
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
  if (room.round >= room.maxRounds) room.state = 'gameOver';
  broadcast(roomId);
}

module.exports = (req, res) => {
  if (!res.socket.server.io) {
    res.socket.server.io = initIO(res);
  }
  res.end();
};
