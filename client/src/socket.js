import { io } from 'socket.io-client';

const socket = io({
  path: '/api/socket',
  autoConnect: false,
  // In dev, connect to local Node server instead
  ...(process.env.NODE_ENV !== 'production' && {
    host: 'http://localhost:3001',
    port: 3001
  })
});

export default socket;
