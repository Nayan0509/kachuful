import { io } from 'socket.io-client';

// In production the client is served by the same server, so no URL needed.
// In dev, point to the local Node server.
const SERVER = process.env.NODE_ENV === 'production'
  ? undefined          // same origin
  : (process.env.REACT_APP_SERVER_URL || 'http://localhost:3001');

const socket = io(SERVER, { autoConnect: false });
export default socket;
