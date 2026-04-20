import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => console.log('[Socket.IO] Connected:', socket.id));
    socket.on('disconnect', () => console.log('[Socket.IO] Disconnected'));

    socket.on('dataChanged', (data) => {
      console.log('[Socket.IO] dataChanged:', data);
      setLastEvent({ ...data, timestamp: Date.now() });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, lastEvent }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export default SocketContext;
