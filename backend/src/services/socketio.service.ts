import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { getSocketIOAdapterHealth, getSocketIOMetrics } from '../socket/server';

/**
 * Singleton service to manage Socket.IO server instance
 * Provides access to Socket.IO server for health checks and metrics
 */
export class SocketIOService {
  private static instance: SocketIOService;
  private io: SocketIOServer | null = null;

  private constructor() {
    // Singleton pattern
  }

  static getInstance(): SocketIOService {
    if (!SocketIOService.instance) {
      SocketIOService.instance = new SocketIOService();
    }
    return SocketIOService.instance;
  }

  /**
   * Set the Socket.IO server instance
   */
  setServer(io: SocketIOServer): void {
    this.io = io;
    logger.debug('Socket.IO server instance registered with SocketIOService');
  }

  /**
   * Get the Socket.IO server instance
   */
  getServer(): SocketIOServer | null {
    return this.io;
  }

  /**
   * Check if Socket.IO server is available
   */
  isServerAvailable(): boolean {
    return this.io !== null;
  }

  /**
   * Get Socket.IO adapter health status
   */
  getAdapterHealth(): { status: string; details: any } {
    if (!this.io) {
      return {
        status: 'unavailable',
        details: {
          message: 'Socket.IO server not initialized'
        }
      };
    }

    try {
      return getSocketIOAdapterHealth(this.io);
    } catch (error) {
      logger.error('Error getting Socket.IO adapter health:', error);
      return {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  /**
   * Get Socket.IO metrics
   */
  getMetrics(): {
    connections: number;
    rooms: number;
    adapterType: string;
    instanceId: string;
  } {
    if (!this.io) {
      return {
        connections: 0,
        rooms: 0,
        adapterType: 'unavailable',
        instanceId: process.pid.toString()
      };
    }

    try {
      return getSocketIOMetrics(this.io);
    } catch (error) {
      logger.error('Error getting Socket.IO metrics:', error);
      return {
        connections: 0,
        rooms: 0,
        adapterType: 'error',
        instanceId: process.pid.toString()
      };
    }
  }

  /**
   * Get comprehensive Socket.IO status
   */
  getStatus(): {
    available: boolean;
    health: { status: string; details: any };
    metrics: {
      connections: number;
      rooms: number;
      adapterType: string;
      instanceId: string;
    };
  } {
    return {
      available: this.isServerAvailable(),
      health: this.getAdapterHealth(),
      metrics: this.getMetrics()
    };
  }

  /**
   * Broadcast to user room across all instances
   */
  broadcastToUser(userId: string, event: string, data: any): boolean {
    if (!this.io) {
      logger.warn('Cannot broadcast to user: Socket.IO server not available');
      return false;
    }

    try {
      const userRoom = `user:${userId}`;
      this.io.to(userRoom).emit(event, data);
      
      logger.debug(`Broadcasted event '${event}' to user room: ${userRoom}`, {
        userId,
        event,
        dataKeys: Object.keys(data || {})
      });
      
      return true;
    } catch (error) {
      logger.error('Error broadcasting to user:', error);
      return false;
    }
  }

  /**
   * Broadcast to session room across all instances
   */
  broadcastToSession(sessionId: string, event: string, data: any): boolean {
    if (!this.io) {
      logger.warn('Cannot broadcast to session: Socket.IO server not available');
      return false;
    }

    try {
      const sessionRoom = `session:${sessionId}`;
      this.io.to(sessionRoom).emit(event, data);
      
      logger.debug(`Broadcasted event '${event}' to session room: ${sessionRoom}`, {
        sessionId,
        event,
        dataKeys: Object.keys(data || {})
      });
      
      return true;
    } catch (error) {
      logger.error('Error broadcasting to session:', error);
      return false;
    }
  }

  /**
   * Get connected socket count for a specific room
   */
  async getRoomSocketCount(room: string): Promise<number> {
    if (!this.io) {
      return 0;
    }

    try {
      const sockets = await this.io.in(room).fetchSockets();
      return sockets.length;
    } catch (error) {
      logger.error(`Error getting socket count for room ${room}:`, error);
      return 0;
    }
  }

  /**
   * Get all rooms
   */
  getRooms(): Map<string, Set<string>> | null {
    if (!this.io) {
      return null;
    }

    try {
      const adapter = this.io.sockets.adapter;
      return adapter.rooms;
    } catch (error) {
      logger.error('Error getting Socket.IO rooms:', error);
      return null;
    }
  }
}

// Export singleton instance
export const socketIOService = SocketIOService.getInstance();