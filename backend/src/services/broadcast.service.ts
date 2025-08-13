import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';
import { QREvent } from '../models/QREvent.model';
import { Event } from '../models/Event.model';
import { EventType } from '../types/database.types';
import { AuthenticatedSocket } from '../socket/auth';

export interface QRUpdatePayload {
  sessionId: string;
  qrData: string;
  expiresAt: Date;
  tries: number;
  remainingTime: number;
}

export interface BroadcastOptions {
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface BroadcastResult {
  success: boolean;
  deliveredTo: string[];
  failedTo: string[];
  errors: { socketId: string; error: string }[];
}

export class BroadcastService {
  private static instance: BroadcastService;
  private io: SocketIOServer | null = null;
  private retryQueue: Map<string, QRBroadcastTask> = new Map();
  private retryInterval?: NodeJS.Timeout;

  private constructor() {
    // Singleton pattern
  }

  static getInstance(): BroadcastService {
    if (!BroadcastService.instance) {
      BroadcastService.instance = new BroadcastService();
    }
    return BroadcastService.instance;
  }

  initialize(io: SocketIOServer): void {
    this.io = io;
    this.startRetryProcessor();
    logger.info('BroadcastService initialized');
  }

  shutdown(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
    this.retryQueue.clear();
    logger.info('BroadcastService shutdown completed');
  }

  /**
   * Broadcast QR update to all connected clients for a specific session
   */
  async broadcastQRUpdate(
    userId: string,
    sessionId: string,
    qrData: string,
    expiresAt: Date,
    tries: number = 0,
    options: BroadcastOptions = {}
  ): Promise<BroadcastResult> {
    try {
      if (!this.io) {
        throw new Error('BroadcastService not initialized');
      }

      logger.info(`Broadcasting QR update for session: ${sessionId}`, {
        userId,
        sessionId,
        tries,
        expiresAt
      });

      // Calculate remaining time in seconds
      const remainingTime = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

      // Create broadcast payload
      const payload: QRUpdatePayload = {
        sessionId,
        qrData,
        expiresAt,
        tries,
        remainingTime
      };

      // Use Redis-compatible room-based broadcasting
      const userRoom = `user:${userId}`;
      const sessionRoom = `session:${sessionId}`;
      
      try {
        // Broadcast to user room (Redis adapter will handle multi-instance distribution)
        this.io.to(userRoom).emit('qr:update', payload);
        
        // Also broadcast to session-specific room for targeted updates
        this.io.to(sessionRoom).emit('qr:update', payload);
        
        // Get socket count for metrics (best effort)
        let socketCount = 0;
        try {
          const socketsInUserRoom = await this.io.in(userRoom).fetchSockets();
          socketCount = socketsInUserRoom.length;
        } catch (error) {
          logger.debug('Could not fetch socket count for metrics:', error);
        }

        logger.debug(`QR update broadcasted to rooms: ${userRoom}, ${sessionRoom}`, {
          socketCount,
          payload: { sessionId, tries, remainingTime }
        });

        // For Redis adapter, we assume successful delivery to all instances
        // Individual socket delivery tracking is handled by the adapter
        const deliveredTo: string[] = [`room:${userRoom}`, `room:${sessionRoom}`];
        const failedTo: string[] = [];
        const errors: { socketId: string; error: string }[] = [];

        // Note: With Redis adapter, we can't easily track individual socket delivery failures
        // The adapter handles cross-instance broadcasting automatically

        // Record broadcast event
        await Event.recordEvent({
          userId,
          sessionId,
          type: EventType.QR_REFRESHED,
          payload: {
            ...payload,
            broadcast: {
              totalSockets: socketCount,
              delivered: deliveredTo.length,
              failed: failedTo.length,
              errors: errors.length,
              rooms: [userRoom, sessionRoom]
            }
          }
        });

        const result: BroadcastResult = {
          success: failedTo.length === 0,
          deliveredTo,
          failedTo,
          errors
        };

        logger.info(`QR update broadcast completed for session: ${sessionId}`, {
          userId,
          sessionId,
          result
        });

        return result;

      } catch (broadcastError: any) {
        logger.error(`Failed to broadcast to rooms for session: ${sessionId}`, broadcastError);
        
        // Fallback to individual socket broadcasting if room-based fails
        return await this.fallbackBroadcast(userId, sessionId, payload, options);
      }

    } catch (error: any) {
      logger.error(`Failed to broadcast QR update for session: ${sessionId}`, error);
      
      // Record error event
      await Event.recordEvent({
        userId,
        sessionId,
        type: EventType.ERROR,
        payload: {
          error: error.message,
          context: 'qr_broadcast',
          timestamp: new Date()
        }
      });

      throw error;
    }
  }

  /**
   * Broadcast QR update from QREvent model
   */
  async broadcastQRFromEvent(qrEventId: string, options: BroadcastOptions = {}): Promise<BroadcastResult> {
    try {
      const qrEvent = await QREvent.findById(qrEventId);
      if (!qrEvent) {
        throw new Error(`QR event not found: ${qrEventId}`);
      }

      // Check if QR is expired
      if (qrEvent.isExpired()) {
        logger.warn(`Attempted to broadcast expired QR event: ${qrEventId}`);
        throw new Error('Cannot broadcast expired QR code');
      }

      return await this.broadcastQRUpdate(
        qrEvent.userId.toString(),
        qrEvent.sessionId,
        qrEvent.qrData,
        qrEvent.expiresAt,
        qrEvent.tries,
        options
      );

    } catch (error: any) {
      logger.error(`Failed to broadcast QR from event: ${qrEventId}`, error);
      throw error;
    }
  }

  /**
   * Broadcast QR update for session (finds latest QR event)
   */
  async broadcastLatestQRForSession(
    userId: string,
    sessionId: string,
    options: BroadcastOptions = {}
  ): Promise<BroadcastResult> {
    try {
      const qrEvent = await QREvent.getLatestQR(sessionId, userId);
      if (!qrEvent) {
        throw new Error(`No active QR event found for session: ${sessionId}`);
      }

      return await this.broadcastQRUpdate(
        userId,
        sessionId,
        qrEvent.qrData,
        qrEvent.expiresAt,
        qrEvent.tries,
        options
      );

    } catch (error: any) {
      logger.error(`Failed to broadcast latest QR for session: ${sessionId}`, error);
      throw error;
    }
  }

  /**
   * Get all connected sockets for a user (Redis adapter compatible)
   */
  private async getUserSockets(userId: string): Promise<AuthenticatedSocket[]> {
    if (!this.io) {
      return [];
    }

    try {
      // Use room-based approach for Redis adapter compatibility
      const userRoom = `user:${userId}`;
      const socketsInRoom = await this.io.in(userRoom).fetchSockets();
      
      return socketsInRoom.map(socket => socket as unknown as AuthenticatedSocket);
      
    } catch (error) {
      logger.warn('Failed to get user sockets from room, falling back to full scan:', error);
      
      // Fallback to full socket scan for compatibility
      const sockets: AuthenticatedSocket[] = [];
      const allSockets = await this.io.fetchSockets();

      for (const socket of allSockets) {
        const authSocket = socket as unknown as AuthenticatedSocket;
        if (authSocket.user?.userId === userId) {
          sockets.push(authSocket);
        }
      }

      return sockets;
    }
  }

  /**
   * Schedule retry for failed broadcasts
   */
  private async scheduleRetry(
    userId: string,
    sessionId: string,
    payload: QRUpdatePayload,
    options: BroadcastOptions,
    failedSocketIds: string[]
  ): Promise<void> {
    const retryKey = `${userId}:${sessionId}:${Date.now()}`;
    const retryTask: QRBroadcastTask = {
      userId,
      sessionId,
      payload,
      options: {
        ...options,
        retryAttempts: (options.retryAttempts || 3) - 1
      },
      failedSocketIds,
      scheduledAt: new Date(),
      nextRetryAt: new Date(Date.now() + (options.retryDelay || 5000))
    };

    this.retryQueue.set(retryKey, retryTask);
    
    logger.info(`Scheduled QR broadcast retry: ${retryKey}`, {
      userId,
      sessionId,
      remainingAttempts: retryTask.options.retryAttempts,
      nextRetryAt: retryTask.nextRetryAt
    });
  }

  /**
   * Process retry queue
   */
  private startRetryProcessor(): void {
    this.retryInterval = setInterval(async () => {
      await this.processRetryQueue();
    }, 5000); // Check every 5 seconds
  }

  private async processRetryQueue(): Promise<void> {
    const now = new Date();
    const tasksToRetry: string[] = [];

    // Find tasks ready for retry
    for (const [key, task] of this.retryQueue.entries()) {
      if (task.nextRetryAt <= now) {
        tasksToRetry.push(key);
      }
    }

    // Process retry tasks
    for (const key of tasksToRetry) {
      const task = this.retryQueue.get(key);
      if (!task) continue;

      try {
        // Check if QR is still valid
        if (task.payload.expiresAt <= now) {
          logger.info(`Skipping retry for expired QR: ${key}`);
          this.retryQueue.delete(key);
          continue;
        }

        logger.info(`Processing QR broadcast retry: ${key}`);

        // Retry broadcast only to failed sockets
        const result = await this.retryBroadcastToSockets(task);

        if (result.success || task.options.retryAttempts! <= 0) {
          // Remove from retry queue if successful or no more attempts
          this.retryQueue.delete(key);
          logger.info(`QR broadcast retry completed: ${key}`, { result });
        } else {
          // Schedule next retry
          task.nextRetryAt = new Date(now.getTime() + (task.options.retryDelay || 5000));
          task.options.retryAttempts = task.options.retryAttempts! - 1;
          logger.info(`QR broadcast retry rescheduled: ${key}`, {
            remainingAttempts: task.options.retryAttempts,
            nextRetryAt: task.nextRetryAt
          });
        }

      } catch (error: any) {
        logger.error(`Error processing QR broadcast retry: ${key}`, error);
        
        // Remove failed retry from queue
        this.retryQueue.delete(key);
      }
    }
  }

  /**
   * Retry broadcast to specific sockets
   */
  private async retryBroadcastToSockets(task: QRBroadcastTask): Promise<BroadcastResult> {
    if (!this.io) {
      throw new Error('BroadcastService not initialized');
    }

    const userSockets = await this.getUserSockets(task.userId);
    const targetSockets = userSockets.filter(socket => 
      task.failedSocketIds.includes(socket.id)
    );

    if (targetSockets.length === 0) {
      return {
        success: true,
        deliveredTo: [],
        failedTo: [],
        errors: []
      };
    }

    const deliveredTo: string[] = [];
    const failedTo: string[] = [];
    const errors: { socketId: string; error: string }[] = [];

    // Update remaining time
    const remainingTime = Math.max(0, Math.floor((task.payload.expiresAt.getTime() - Date.now()) / 1000));
    const updatedPayload = {
      ...task.payload,
      remainingTime
    };

    const retryPromises = targetSockets.map(async (socket) => {
      try {
        const timeout = task.options.timeout || 5000;
        
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            socket.emit('qr:update', updatedPayload, (ack: any) => {
              if (ack?.success) {
                resolve();
              } else {
                reject(new Error(ack?.error || 'No acknowledgment received'));
              }
            });
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Retry timeout')), timeout);
          })
        ]);

        deliveredTo.push(socket.id);

      } catch (error: any) {
        failedTo.push(socket.id);
        errors.push({
          socketId: socket.id,
          error: error.message || 'Unknown error'
        });
      }
    });

    await Promise.allSettled(retryPromises);

    return {
      success: failedTo.length === 0,
      deliveredTo,
      failedTo,
      errors
    };
  }

  /**
   * Fallback broadcast method for individual socket targeting
   */
  private async fallbackBroadcast(
    userId: string,
    sessionId: string,
    payload: QRUpdatePayload,
    options: BroadcastOptions
  ): Promise<BroadcastResult> {
    logger.info(`Using fallback broadcast for session: ${sessionId}`);

    // Find all connected sockets for this user
    const userSockets = await this.getUserSockets(userId);
    
    if (userSockets.length === 0) {
      logger.warn(`No connected sockets found for user: ${userId}`);
      return {
        success: true,
        deliveredTo: [],
        failedTo: [],
        errors: []
      };
    }

    // Broadcast to all user sockets with session-specific filtering
    const deliveredTo: string[] = [];
    const failedTo: string[] = [];
    const errors: { socketId: string; error: string }[] = [];

    const broadcastPromises = userSockets.map(async (socket) => {
      try {
        // Set timeout for individual socket delivery
        const timeout = options.timeout || 5000;
        
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            socket.emit('qr:update', payload, (ack: any) => {
              if (ack?.success) {
                resolve();
              } else {
                reject(new Error(ack?.error || 'No acknowledgment received'));
              }
            });
          }),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Broadcast timeout')), timeout);
          })
        ]);

        deliveredTo.push(socket.id);
        logger.debug(`QR update delivered to socket: ${socket.id}`);

      } catch (error: any) {
        failedTo.push(socket.id);
        errors.push({
          socketId: socket.id,
          error: error.message || 'Unknown error'
        });
        logger.warn(`Failed to deliver QR update to socket: ${socket.id}`, error);
      }
    });

    // Wait for all broadcasts to complete
    await Promise.allSettled(broadcastPromises);

    // Handle retry logic for failed deliveries
    if (failedTo.length > 0 && (options.retryAttempts || 0) > 0) {
      await this.scheduleRetry(userId, sessionId, payload, options, failedTo);
    }

    return {
      success: failedTo.length === 0,
      deliveredTo,
      failedTo,
      errors
    };
  }

  /**
   * Get retry queue statistics
   */
  getRetryQueueStats(): {
    totalTasks: number;
    tasksBySession: { [sessionId: string]: number };
    oldestTask?: Date;
  } {
    const stats = {
      totalTasks: this.retryQueue.size,
      tasksBySession: {} as { [sessionId: string]: number }
    } as {
      totalTasks: number;
      tasksBySession: { [sessionId: string]: number };
      oldestTask?: Date;
    };

    for (const task of this.retryQueue.values()) {
      stats.tasksBySession[task.sessionId] = (stats.tasksBySession[task.sessionId] || 0) + 1;
      
      if (!stats.oldestTask || task.scheduledAt < stats.oldestTask) {
        stats.oldestTask = task.scheduledAt;
      }
    }

    return stats;
  }
}

interface QRBroadcastTask {
  userId: string;
  sessionId: string;
  payload: QRUpdatePayload;
  options: BroadcastOptions;
  failedSocketIds: string[];
  scheduledAt: Date;
  nextRetryAt: Date;
}