const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { maxRound, dealRound, determineTrickWinner, calcScore } = require('./_gameEngine');

const rooms = {};

const ioHandler = (req, res) => {
  if (!res.socket.server.io) {
    console.log('Initialising Socket.io');

    const io = new Server(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: { origin: '*', methods: ['GET', 'POST'] },
      transports: ['polling'],   // Vercel only supports polling, not websocket upgrade
    });

    res.socket.server.io = io;

    io.on('connection', (socket) => {
      console.log('connected', socket.id);

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
        broadcast(io, roomId, rooms);
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
        broadcast(io, roomId, rooms);
      });

      socket.on('startGame', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id) return;
        if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players' });
        room.maxRounds = maxRound(room.players.length);
        startRound(io, roomId, rooms);
      });

      socket.on('placeBid', ({ roomId, bid }) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'bidding' || room.currentPlayer !== socket.id) return;
        room.bids[socket.id] = bid;
        nextBidder(io, roomId, rooms);
      });

      socket.on('playCard', ({ roomId, card }) => {
        const result = doPlayCard(io, roomId, socket.id, card, rooms);
        if (result?.error) socket.emit('error', { message: result.error });
      });

      socket.on('nextRound', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.host !== socket.id || room.state !== 'roundEnd') return;
        startRound(io, roomId, rooms);
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
          if (p) { p.connected = false; broadcast(io, roomId, rooms); }
        }
      });
    });
  }

  res.end();
};

function broadcast(io, roomId, rooms) {
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

function startRound(io, roomId, rooms) {
  const room = rooms[roomId];
  room.round += 1;
  const { hands, trumpCard, trumpSuit } = dealRound(room.players, room.round);
  Object.assign(room, { hands, trumpCard, trumpSuit, bids: {}, currentTrick: [], leadSuit: null, state: 'bidding' });
  room.tricks = Object.fromEntries(room.players.map(p => [p.id, 0]));
  room.currentPlayer = room.players[(room.dealerIndex + 1) % room.players.length].id;
  broadcast(io, roomId, rooms);
}

function nextBidder(io, roomId, rooms) {
  const room = rooms[roomId];
  const remaining = room.players.filter(p => !(p.id in room.bids));
  if (remaining.length === 0) {
    room.state = 'playing';
    room.currentPlayer = room.players[(room.dealerIndex + 1) % room.players.length].id;
  } else {
    room.currentPlayer = remaining[0].id;
  }
  broadcast(io, roomId, rooms);
}

function doPlayCard(io, roomId, playerId, card, rooms) {
  const room = rooms[roomId];
  if (room.state !== 'playing') return { error: 'Not playing phase' };
  if (room.currentPlayer !== playerId) return { error: 'Not your turn' };
  const hand = room.hands[playerId];
  const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (idx === -1) return { error: 'Card not in hand' };
  if (room.currentTrick.length > 0 && room.leadSuit) {
    if (hand.some(c => c.suit === room.leadSuit) && card.suit !== room.leadSuit)
      return { error: 'Must follow suit' };
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
    if (total === room.round) endRound(io, roomId, rooms);
    else { room.currentPlayer = winnerId; broadcast(io, roomId, rooms); }
  } else {
    const i = room.players.findIndex(p => p.id === playerId);
    room.currentPlayer = room.players[(i + 1) % room.players.length].id;
    broadcast(io, roomId, rooms);
  }
  return { ok: true };
}

function endRound(io, roomId, rooms) {
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
  broadcast(io, roomId, rooms);
}

module.exports = ioHandler;
