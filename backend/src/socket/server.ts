import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { logger } from '@/utils/logger';
import { getRedisPubClient, getRedisSubClient } from '../config/redis';
import { WPPConnectManager } from '../wpp/manager.factory';
import type { WPPConnectManager as WPPManagerType } from '../wpp/manager.stub';
import { Session } from '../models/Session.model';
import { Event } from '../models/Event.model';
import { Message } from '../models/Message.model';
import { ValidationService } from '../services/validation.service';
import { BroadcastService } from '../services/broadcast.service';
import { EventType, SessionStatus } from '../types/database.types';
import { socketAuthMiddleware, AuthenticatedSocket } from './auth';
import { z } from 'zod';

// Socket.IO event interfaces
interface SessionCreateData {
  deviceName?: string;
  webhookUrl?: string;
}

// Validation schemas for Socket.IO events
const sessionCreateSchema = z.object({
  deviceName: z.string().min(1, 'Device name is required').max(50, 'Device name too long').optional(),
  webhookUrl: z.string().url('Invalid webhook URL').optional()
});

export const setupSocketIO = (io: SocketIOServer): void => {
  logger.info('Setting up Socket.IO server...');

  // Setup Redis adapter for multi-instance scaling
  try {
    const pubClient = getRedisPubClient();
    const subClient = getRedisSubClient();
    
    // Create and configure Redis adapter with comprehensive options
    const redisAdapter = createAdapter(pubClient, subClient, {
      key: 'socket.io',
      requestsTimeout: 5000,
      publishOnSpecificResponseChannel: true,
      parser: {
        encode: JSON.stringify,
        decode: JSON.parse
      }
    });
    
    io.adapter(redisAdapter);
    logger.info('✅ Socket.IO Redis adapter configured successfully');
    
    // Store adapter reference for health checks and metrics
    (io as any).redisAdapter = true; // Just mark that Redis adapter is enabled
    
  } catch (error) {
    logger.error('❌ Failed to setup Socket.IO Redis adapter:', error);
    logger.warn('⚠️ Socket.IO will run in single-instance mode');
  }

  // Initialize broadcast service
  const broadcastService = BroadcastService.getInstance();
  broadcastService.initialize(io);

  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`Socket.IO client connected: ${socket.id}`);

    // Join user to their personal room for targeted broadcasting
    if (socket.user?.userId) {
      const userRoom = `user:${socket.user.userId}`;
      socket.join(userRoom);
      logger.debug(`Socket ${socket.id} joined user room: ${userRoom}`);
    }

    // Session create handler with validation, WPPConnect initialization, and response formatting
    socket.on('session:create', async (data: SessionCreateData, callback) => {
      try {
        logger.info('Session create request received', { 
          socketId: socket.id, 
          userId: socket.user?.userId,
          data 
        });

        // Check authentication
        if (!socket.user?.userId) {
          const errorResponse = {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Validate input data
        const validation = ValidationService.validateRequest(sessionCreateSchema, data);
        if (!validation.success) {
          const errorResponse = {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input data',
              details: validation.errors,
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        const { deviceName, webhookUrl } = validation.data!;

        // Create session in database
        const session = await Session.createSession(
          socket.user.userId,
          deviceName || 'WhatsApp Web'
        );

        // Join session-specific room for targeted broadcasting
        const sessionRoom = `session:${session.sessionId}`;
        socket.join(sessionRoom);
        logger.debug(`Socket ${socket.id} joined session room: ${sessionRoom}`);

        logger.info(`Session created in database: ${session.sessionId}`, {
          userId: socket.user.userId,
          deviceName: deviceName || 'WhatsApp Web'
        });

        // Initialize WPPConnect client
        try {
          await WPPConnectManager.getInstance().initializeClient(session.sessionId, {
            session: session.sessionId,
            deviceName: deviceName || 'WhatsApp Web',
            headless: true,
            devtools: false,
            useChrome: true,
            debug: false,
            logQR: false,
            browserArgs: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu'
            ]
          });

          logger.info(`WPPConnect client initialized successfully: ${session.sessionId}`);

          // Record session creation event
          await Event.recordEvent({
            userId: socket.user.userId,
            sessionId: session.sessionId,
            type: EventType.SESSION_STATE,
            payload: {
              newStatus: session.status,
              deviceName: deviceName || 'WhatsApp Web',
              webhookUrl,
              socketId: socket.id,
              createdAt: new Date()
            }
          });

        } catch (wppError: any) {
          logger.error('WPPConnect initialization failed:', wppError);
          
          // Update session status to ERROR
          await session.updateStatus(SessionStatus.ERROR, wppError.message);
          
          // Record error event
          await Event.recordEvent({
            userId: socket.user.userId,
            sessionId: session.sessionId,
            type: EventType.ERROR,
            payload: {
              error: wppError.message,
              stage: 'wpp_initialization',
              timestamp: new Date()
            }
          });
        }

        // Format successful response
        const successResponse = {
          success: true,
          data: {
            session: {
              id: (session._id as any).toString(),
              sessionId: session.sessionId,
              status: session.status,
              deviceInfo: session.deviceInfo,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt
            }
          },
          timestamp: new Date().toISOString()
        };

        // Send response via callback or emit event
        if (callback) {
          callback(successResponse);
        } else {
          socket.emit('session:created', successResponse);
        }

        logger.info(`Session creation completed: ${session.sessionId}`, {
          userId: socket.user.userId,
          status: session.status
        });

      } catch (error: any) {
        logger.error('Session create handler error:', error);

        const errorResponse = {
          success: false,
          error: {
            code: error.message?.includes('maximum sessions') ? 'SESSION_LIMIT_EXCEEDED' : 'INTERNAL',
            message: error.message?.includes('maximum sessions') 
              ? 'Maximum number of sessions reached' 
              : 'Failed to create session',
            timestamp: new Date().toISOString()
          }
        };

        if (callback) {
          callback(errorResponse);
        } else {
          socket.emit('error', errorResponse.error);
        }
      }
    });

    // Session refresh QR handler: QR regeneration, database update, broadcast to clients
    socket.on('session:refresh_qr', async (data: { sessionId: string }, callback) => {
      try {
        logger.info('Session refresh QR request received', { 
          socketId: socket.id, 
          userId: socket.user?.userId,
          data 
        });

        // Check authentication
        if (!socket.user?.userId) {
          const errorResponse = {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Validate sessionId
        if (!data?.sessionId) {
          const errorResponse = {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Session ID is required',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Verify session ownership
        const session = await Session.getSessionBySessionId(data.sessionId, socket.user.userId);
        if (!session) {
          const errorResponse = {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Session not found or access denied',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Check if session is in a state that allows QR refresh
        if (session.status === SessionStatus.CONNECTED) {
          const errorResponse = {
            success: false,
            error: {
              code: 'INVALID_STATE',
              message: 'Cannot refresh QR for connected session',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Refresh QR code through WPPConnect
        try {
          await WPPConnectManager.getInstance().refreshQR(data.sessionId);
          
          logger.info(`QR refresh initiated for session: ${data.sessionId}`);

          // Record QR refresh event
          await Event.recordEvent({
            userId: socket.user.userId,
            sessionId: data.sessionId,
            type: EventType.QR_REFRESHED,
            payload: {
              action: 'manual_refresh',
              socketId: socket.id,
              timestamp: new Date()
            }
          });

          // The actual QR update will be broadcasted by the WPP manager's handleQRCode method
          const successResponse = {
            success: true,
            data: {
              message: 'QR refresh initiated',
              sessionId: data.sessionId
            },
            timestamp: new Date().toISOString()
          };

          if (callback) {
            callback(successResponse);
          } else {
            socket.emit('session:qr_refreshed', successResponse);
          }

        } catch (wppError: any) {
          logger.error(`Failed to refresh QR for session: ${data.sessionId}`, wppError);
          
          const errorResponse = {
            success: false,
            error: {
              code: 'WPP_ERROR',
              message: wppError.message || 'Failed to refresh QR code',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
        }

      } catch (error: any) {
        logger.error('Session refresh QR handler error:', error);

        const errorResponse = {
          success: false,
          error: {
            code: 'INTERNAL',
            message: 'Failed to refresh QR code',
            timestamp: new Date().toISOString()
          }
        };

        if (callback) {
          callback(errorResponse);
        } else {
          socket.emit('error', errorResponse.error);
        }
      }
    });

    socket.on('session:delete', async (data: { sessionId: string }, callback) => {
      try {
        logger.info('Session delete request received', { 
          socketId: socket.id, 
          userId: socket.user?.userId,
          data 
        });

        // Check authentication
        if (!socket.user?.userId) {
          const errorResponse = {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Validate sessionId
        if (!data?.sessionId) {
          const errorResponse = {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Session ID is required',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Verify session ownership
        const session = await Session.getSessionBySessionId(data.sessionId, socket.user.userId);
        if (!session) {
          const errorResponse = {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Session not found or access denied',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Terminate WPPConnect client
        try {
          await WPPConnectManager.getInstance().destroyClient(data.sessionId);
          logger.info(`WPPConnect client terminated for session: ${data.sessionId}`);
        } catch (wppError: any) {
          logger.warn(`Failed to terminate WPPConnect client for session: ${data.sessionId}`, wppError);
          // Continue with session deletion even if WPP termination fails
        }

        // Delete session from database
        await Session.findOneAndDelete({ sessionId: data.sessionId, userId: socket.user.userId });

        // Record session deletion event
        await Event.recordEvent({
          userId: socket.user.userId,
          sessionId: data.sessionId,
          type: EventType.SESSION_DELETED,
          payload: {
            deletedAt: new Date(),
            previousStatus: session.status,
            socketId: socket.id,
            action: 'session_deleted'
          }
        });

        // Leave session room
        const sessionRoom = `session:${data.sessionId}`;
        socket.leave(sessionRoom);

        // Broadcast session deletion to other connected clients
        const userRoom = `user:${socket.user.userId}`;
        socket.to(userRoom).emit('session:deleted', {
          sessionId: data.sessionId,
          timestamp: new Date().toISOString()
        });

        const successResponse = {
          success: true,
          data: {
            message: 'Session deleted successfully',
            sessionId: data.sessionId
          },
          timestamp: new Date().toISOString()
        };

        if (callback) {
          callback(successResponse);
        } else {
          socket.emit('session:deleted', successResponse);
        }

        logger.info(`Session deletion completed: ${data.sessionId}`, {
          userId: socket.user.userId
        });

      } catch (error: any) {
        logger.error('Session delete handler error:', error);

        const errorResponse = {
          success: false,
          error: {
            code: 'INTERNAL',
            message: 'Failed to delete session',
            timestamp: new Date().toISOString()
          }
        };

        if (callback) {
          callback(errorResponse);
        } else {
          socket.emit('error', errorResponse.error);
        }
      }
    });

    socket.on('message:send', async (data: {
      sessionId: string;
      to: string;
      type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location';
      content?: string;
      mediaUrl?: string;
      caption?: string;
      latitude?: number;
      longitude?: number;
      address?: string;
    }, callback) => {
      try {
        logger.info('Message send request received', { 
          socketId: socket.id, 
          userId: socket.user?.userId,
          data 
        });

        // Check authentication
        if (!socket.user?.userId) {
          const errorResponse = {
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Validate required fields
        if (!data?.sessionId || !data?.to || !data?.type) {
          const errorResponse = {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Session ID, recipient, and message type are required',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Verify session ownership and status
        const session = await Session.getSessionBySessionId(data.sessionId, socket.user.userId);
        if (!session) {
          const errorResponse = {
            success: false,
            error: {
              code: 'NOT_FOUND',
              message: 'Session not found or access denied',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        if (session.status !== SessionStatus.CONNECTED) {
          const errorResponse = {
            success: false,
            error: {
              code: 'INVALID_STATE',
              message: 'Session must be connected to send messages',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
          return;
        }

        // Send message through WPPConnect
        let result: any;
        try {
          switch (data.type) {
            case 'text':
              if (!data.content) {
                throw new Error('Text content is required for text messages');
              }
              result = await WPPConnectManager.getInstance().sendTextMessage(data.sessionId, data.to, data.content);
              break;
            
            case 'image':
              if (!data.mediaUrl) {
                throw new Error('Media URL is required for image messages');
              }
              result = await WPPConnectManager.getInstance().sendImageMessage(data.sessionId, data.to, data.mediaUrl, data.caption);
              break;
            
            case 'document':
              if (!data.mediaUrl) {
                throw new Error('Media URL is required for document messages');
              }
              result = await WPPConnectManager.getInstance().sendDocumentMessage(data.sessionId, data.to, data.mediaUrl, data.caption);
              break;
            
            case 'audio':
              if (!data.mediaUrl) {
                throw new Error('Media URL is required for audio messages');
              }
              result = await WPPConnectManager.getInstance().sendAudioMessage(data.sessionId, data.to, data.mediaUrl);
              break;
            
            case 'video':
              if (!data.mediaUrl) {
                throw new Error('Media URL is required for video messages');
              }
              result = await WPPConnectManager.getInstance().sendVideoMessage(data.sessionId, data.to, data.mediaUrl, data.caption);
              break;
            
            case 'location':
              if (data.latitude === undefined || data.longitude === undefined) {
                throw new Error('Latitude and longitude are required for location messages');
              }
              result = await WPPConnectManager.getInstance().sendLocationMessage(data.sessionId, data.to, data.latitude, data.longitude, data.address);
              break;
            
            default:
              throw new Error(`Unsupported message type: ${data.type}`);
          }

          // Record message in database
          const message = await Message.createMessage({
            userId: socket.user.userId,
            sessionId: data.sessionId,
            to: data.to,
            type: data.type as any, // Cast to MessageType enum
            content: data.content,
            mediaUrl: data.mediaUrl,
            caption: data.caption,
            metadata: {
              latitude: data.latitude,
              longitude: data.longitude,
              address: data.address,
              wppResult: result
            }
          });

          // Record message sent event
          await Event.recordEvent({
            userId: socket.user.userId,
            sessionId: data.sessionId,
            type: EventType.MESSAGE_SENT,
            payload: {
              messageId: message.messageId,
              to: data.to,
              type: data.type,
              socketId: socket.id,
              timestamp: new Date()
            }
          });

          const successResponse = {
            success: true,
            data: {
              message: {
                id: (message._id as any).toString(),
                messageId: message.messageId,
                to: data.to,
                type: data.type,
                status: message.status,
                createdAt: message.createdAt
              },
              wppResult: result
            },
            timestamp: new Date().toISOString()
          };

          if (callback) {
            callback(successResponse);
          } else {
            socket.emit('message:sent', successResponse);
          }

          logger.info(`Message sent successfully: ${message.messageId}`, {
            userId: socket.user.userId,
            sessionId: data.sessionId,
            to: data.to,
            type: data.type
          });

        } catch (wppError: any) {
          logger.error(`Failed to send message through WPPConnect: ${data.sessionId}`, wppError);
          
          const errorResponse = {
            success: false,
            error: {
              code: 'WPP_ERROR',
              message: wppError.message || 'Failed to send message',
              timestamp: new Date().toISOString()
            }
          };
          
          if (callback) {
            callback(errorResponse);
          } else {
            socket.emit('error', errorResponse.error);
          }
        }

      } catch (error: any) {
        logger.error('Message send handler error:', error);

        const errorResponse = {
          success: false,
          error: {
            code: 'INTERNAL',
            message: 'Failed to send message',
            timestamp: new Date().toISOString()
          }
        };

        if (callback) {
          callback(errorResponse);
        } else {
          socket.emit('error', errorResponse.error);
        }
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Socket.IO client disconnected: ${socket.id}`, { reason });
    });

    socket.on('error', (error) => {
      logger.error('Socket.IO error:', { socketId: socket.id, error });
    });
  });

  logger.info('Socket.IO server setup completed');
};

export const shutdownSocketIO = (): void => {
  logger.info('Shutting down Socket.IO server...');
  
  // Shutdown broadcast service
  const broadcastService = BroadcastService.getInstance();
  broadcastService.shutdown();
  
  logger.info('Socket.IO server shutdown completed');
};

// Utility functions for Redis adapter management and monitoring
export const getSocketIOAdapterHealth = (io: SocketIOServer): { 
  status: string; 
  details: any 
} => {
  try {
    const hasRedisAdapter = (io as any).redisAdapter;
    
    if (!hasRedisAdapter) {
      return {
        status: 'no_adapter',
        details: {
          message: 'No Redis adapter configured - running in single instance mode',
          adapterType: 'memory'
        }
      };
    }

    // Get actual adapter from Socket.IO server
    const adapter = io.sockets.adapter;
    
    return {
      status: 'healthy',
      details: {
        adapterType: 'redis',
        roomCount: adapter.rooms ? adapter.rooms.size : 0,
        socketCount: adapter.sids ? adapter.sids.size : 0,
        redisConnected: true,
        lastActivity: new Date().toISOString()
      }
    };
    
  } catch (error) {
    logger.error('Error checking Socket.IO adapter health:', error);
    return {
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        adapterType: 'redis'
      }
    };
  }
};

export const getSocketIOMetrics = (io: SocketIOServer): {
  connections: number;
  rooms: number;
  adapterType: string;
  instanceId: string;
} => {
  try {
    const hasRedisAdapter = (io as any).redisAdapter;
    const engine = io.engine;
    const adapter = io.sockets.adapter;
    
    return {
      connections: engine ? engine.clientsCount : 0,
      rooms: adapter && adapter.rooms ? adapter.rooms.size : 0,
      adapterType: hasRedisAdapter ? 'redis' : 'memory',
      instanceId: process.env['INSTANCE_ID'] || process.pid.toString()
    };
    
  } catch (error) {
    logger.error('Error getting Socket.IO metrics:', error);
    return {
      connections: 0,
      rooms: 0,
      adapterType: 'unknown',
      instanceId: process.pid.toString()
    };
  }
};

// Function to broadcast to specific user rooms across all instances
export const broadcastToUser = (
  io: SocketIOServer, 
  userId: string, 
  event: string, 
  data: any
): void => {
  try {
    const userRoom = `user:${userId}`;
    io.to(userRoom).emit(event, data);
    
    logger.debug(`Broadcasted event '${event}' to user room: ${userRoom}`, {
      userId,
      event,
      dataKeys: Object.keys(data || {})
    });
    
  } catch (error) {
    logger.error('Error broadcasting to user:', error);
  }
};

// Function to broadcast to specific session rooms across all instances
export const broadcastToSession = (
  io: SocketIOServer, 
  sessionId: string, 
  event: string, 
  data: any
): void => {
  try {
    const sessionRoom = `session:${sessionId}`;
    io.to(sessionRoom).emit(event, data);
    
    logger.debug(`Broadcasted event '${event}' to session room: ${sessionRoom}`, {
      sessionId,
      event,
      dataKeys: Object.keys(data || {})
    });
    
  } catch (error) {
    logger.error('Error broadcasting to session:', error);
  }
};