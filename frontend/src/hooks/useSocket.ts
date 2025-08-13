import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseSocketReturn {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  emit: (event: string, data?: any) => void;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback?: (data: any) => void) => void;
}

export const useSocket = (): UseSocketReturn => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const { token, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      // Disconnect if not authenticated
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnectionStatus('disconnected');
      }
      return;
    }

    // Create socket connection
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
    const newSocket = io(socketUrl, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Socket.IO connected:', newSocket.id);
      setConnectionStatus('connected');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      setConnectionStatus('error');
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket.IO reconnected after', attemptNumber, 'attempts');
      setConnectionStatus('connected');
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('Socket.IO reconnection error:', error);
      setConnectionStatus('error');
    });

    newSocket.on('reconnect_failed', () => {
      console.error('Socket.IO reconnection failed');
      setConnectionStatus('error');
    });

    setSocket(newSocket);
    setConnectionStatus('connecting');

    // Cleanup on unmount
    return () => {
      newSocket.close();
      setSocket(null);
      setConnectionStatus('disconnected');
    };
  }, [isAuthenticated, token]);

  const emit = useCallback((event: string, data?: any) => {
    if (socket && connectionStatus === 'connected') {
      socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  }, [socket, connectionStatus]);

  const on = useCallback((event: string, callback: (data: any) => void) => {
    if (socket) {
      socket.on(event, callback);
    }
  }, [socket]);

  const off = useCallback((event: string, callback?: (data: any) => void) => {
    if (socket) {
      if (callback) {
        socket.off(event, callback);
      } else {
        socket.off(event);
      }
    }
  }, [socket]);

  return {
    socket,
    connectionStatus,
    emit,
    on,
    off,
  };
};