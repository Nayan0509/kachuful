import { io } from 'socket.io-client';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

const socket = io(SERVER, {
  path: '/api/socket',
  transports: ['websocket', 'polling'],
  autoConnect: false,
});

export default socket;
