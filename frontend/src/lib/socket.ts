import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Returns the singleton Socket.IO client.
 * Connects to the same origin (proxied to Express on port 5000 in dev).
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
