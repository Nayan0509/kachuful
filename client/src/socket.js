import { io } from 'socket.io-client';

const isProduction = process.env.NODE_ENV === 'production';

const socket = io(isProduction ? undefined : 'http://localhost:3001', {
  path: '/api/socket',
  transports: ['polling'],   // polling only — works on Vercel serverless
  autoConnect: false,
});

export default socket;
