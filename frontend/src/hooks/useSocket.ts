import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SocketResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface QRUpdatePayload {
  sessionId: string;
  qrData: string;
  expiresAt: string;
  tries: number;
  remainingTime: number;
}

interface UseSocketReturn {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  emit: (event: string, data?: any) => void;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback?: (data: any) => void) => void;
  // Enhanced session functions
  createSession: (deviceName?: string, webhookUrl?: string) => Promise<SocketResponse>;
  deleteSession: (sessionId: string) => Promise<SocketResponse>;
  refreshQR: (sessionId: string) => Promise<SocketResponse>;
  sendMessage: (data: {
    sessionId: string;
    to: string;
    type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location';
    content?: string;
    mediaUrl?: string;
    caption?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  }) => Promise<SocketResponse>;
  // Event subscriptions
  onQRUpdate: (callback: (data: QRUpdatePayload) => void) => () => void;
  onSessionStateChange: (callback: (data: any) => void) => () => void;
  onMessageStatus: (callback: (data: any) => void) => () => void;
  onSessionDeleted: (
    callback: (data: { sessionId: string; timestamp: string }) => void
  ) => () => void;
  onError: (callback: (error: any) => void) => () => void;
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
    const socketUrl = (import.meta as any).env?.VITE_SOCKET_URL || 'http://localhost:3001';
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

  const emit = useCallback(
    (event: string, data?: any) => {
      if (socket && connectionStatus === 'connected') {
        socket.emit(event, data);
      } else {
        console.warn('Socket not connected, cannot emit event:', event);
      }
    },
    [socket, connectionStatus]
  );

  const on = useCallback(
    (event: string, callback: (data: any) => void) => {
      if (socket) {
        socket.on(event, callback);
      }
    },
    [socket]
  );

  const off = useCallback(
    (event: string, callback?: (data: any) => void) => {
      if (socket) {
        if (callback) {
          socket.off(event, callback);
        } else {
          socket.off(event);
        }
      }
    },
    [socket]
  );

  // Enhanced session management functions
  const createSession = useCallback(
    (deviceName?: string, webhookUrl?: string): Promise<SocketResponse> => {
      return new Promise((resolve, reject) => {
        if (!socket || connectionStatus !== 'connected') {
          reject(new Error('Socket not connected'));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Request timeout - Session creation is taking longer than expected'));
        }, 120000); // Increased to 2 minutes for WPPConnect initialization

        socket.emit('session:create', { deviceName, webhookUrl }, (response: SocketResponse) => {
          clearTimeout(timeout);
          resolve(response);
        });
      });
    },
    [socket, connectionStatus]
  );

  const deleteSession = useCallback(
    (sessionId: string): Promise<SocketResponse> => {
      return new Promise((resolve, reject) => {
        if (!socket || connectionStatus !== 'connected') {
          reject(new Error('Socket not connected'));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 15000);

        socket.emit('session:delete', { sessionId }, (response: SocketResponse) => {
          clearTimeout(timeout);
          resolve(response);
        });
      });
    },
    [socket, connectionStatus]
  );

  const refreshQR = useCallback(
    (sessionId: string): Promise<SocketResponse> => {
      return new Promise((resolve, reject) => {
        if (!socket || connectionStatus !== 'connected') {
          reject(new Error('Socket not connected'));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 15000);

        socket.emit('session:refresh_qr', { sessionId }, (response: SocketResponse) => {
          clearTimeout(timeout);
          resolve(response);
        });
      });
    },
    [socket, connectionStatus]
  );

  const sendMessage = useCallback(
    (data: {
      sessionId: string;
      to: string;
      type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location';
      content?: string;
      mediaUrl?: string;
      caption?: string;
      latitude?: number;
      longitude?: number;
      address?: string;
    }): Promise<SocketResponse> => {
      return new Promise((resolve, reject) => {
        if (!socket || connectionStatus !== 'connected') {
          reject(new Error('Socket not connected'));
          return;
        }

        const timeout = setTimeout(() => {
          reject(new Error('Request timeout'));
        }, 30000);

        socket.emit('message:send', data, (response: SocketResponse) => {
          clearTimeout(timeout);
          resolve(response);
        });
      });
    },
    [socket, connectionStatus]
  );

  // Event subscription functions
  const onQRUpdate = useCallback(
    (callback: (data: QRUpdatePayload) => void) => {
      if (socket) {
        socket.on('qr:update', callback);
        return () => socket.off('qr:update', callback);
      }
      return () => {};
    },
    [socket]
  );

  const onSessionStateChange = useCallback(
    (callback: (data: any) => void) => {
      if (socket) {
        socket.on('session:state', callback);
        return () => socket.off('session:state', callback);
      }
      return () => {};
    },
    [socket]
  );

  const onMessageStatus = useCallback(
    (callback: (data: any) => void) => {
      if (socket) {
        socket.on('message:status', callback);
        return () => socket.off('message:status', callback);
      }
      return () => {};
    },
    [socket]
  );

  const onSessionDeleted = useCallback(
    (callback: (data: { sessionId: string; timestamp: string }) => void) => {
      if (socket) {
        socket.on('session:deleted', callback);
        return () => socket.off('session:deleted', callback);
      }
      return () => {};
    },
    [socket]
  );

  const onError = useCallback(
    (callback: (error: any) => void) => {
      if (socket) {
        socket.on('error', callback);
        return () => socket.off('error', callback);
      }
      return () => {};
    },
    [socket]
  );

  return {
    socket,
    connectionStatus,
    emit,
    on,
    off,
    // Enhanced session functions
    createSession,
    deleteSession,
    refreshQR,
    sendMessage,
    // Event subscriptions
    onQRUpdate,
    onSessionStateChange,
    onMessageStatus,
    onSessionDeleted,
    onError,
  };
};
