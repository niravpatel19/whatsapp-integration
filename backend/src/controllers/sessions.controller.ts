import { Request, Response } from 'express';
import { Session } from '../models/Session.model';
import { QREvent } from '../models/QREvent.model';
import { Event } from '../models/Event.model';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { WPPConnectManager } from '../wpp/manager.factory';
import { SessionStatus, EventType } from '../types/database.types';

// Validation schemas
const createSessionSchema = z.object({
  deviceName: z
    .string()
    .min(1, 'Device name is required')
    .max(50, 'Device name too long')
    .optional(),
  webhookUrl: z.string().url('Invalid webhook URL').optional(),
});

const updateSessionSchema = z.object({
  deviceName: z
    .string()
    .min(1, 'Device name is required')
    .max(50, 'Device name too long')
    .optional(),
  webhookUrl: z.string().url('Invalid webhook URL').optional(),
});

const sessionFiltersSchema = z.object({
  status: z.enum(['PENDING', 'QR', 'CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'lastSeenAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export class SessionsController {
  /**
   * Get all sessions for the authenticated user
   */
  static async getSessions(req: Request, res: Response): Promise<void> {
    try {
      const validation = sessionFiltersSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      const { status, page, limit, sortBy, sortOrder } = validation.data;
      const skip = (page - 1) * limit;

      // Build query
      const query: any = { userId: req.user!.userId };
      if (status) {
        query.status = status;
      }

      // Build sort
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Get sessions with pagination (optimized with field selection)
      const [sessions, total] = await Promise.all([
        Session.find(query)
          .select('sessionId status deviceInfo phone lastSeenAt createdAt updatedAt')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        Session.countDocuments(query),
      ]);

      // Transform sessions for response
      const transformedSessions = sessions.map((session) => ({
        id: session._id,
        sessionId: session.sessionId,
        status: session.status,
        deviceInfo: session.deviceInfo,
        phone: session.phone,
        lastSeenAt: session.lastSeenAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }));

      res.json({
        success: true,
        data: {
          sessions: transformedSessions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      logger.error('Get sessions error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve sessions',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Create a new session
   */
  static async createSession(req: Request, res: Response): Promise<void> {
    try {
      const validation = createSessionSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      const { deviceName, webhookUrl } = validation.data;

      // Create session
      const session = await Session.createSession(req.user!.userId, deviceName || 'WhatsApp Web');

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
            '--disable-gpu',
          ],
        });

        logger.info(`Session created and WPPConnect initialized: ${session.sessionId}`, {
          userId: req.user!.userId,
          deviceName,
        });
      } catch (wppError) {
        logger.error('WPPConnect initialization failed:', wppError);
        // Update session status to ERROR
        await Session.updateStatus(session.sessionId, SessionStatus.ERROR);
      }

      res.status(201).json({
        success: true,
        data: {
          session: {
            id: session._id,
            sessionId: session.sessionId,
            status: session.status,
            deviceInfo: session.deviceInfo,
            createdAt: session.createdAt,
          },
        },
      });
    } catch (error: any) {
      logger.error('Create session error:', error);

      if (error.message.includes('maximum sessions')) {
        res.status(429).json({
          error: {
            code: 'SESSION_LIMIT_EXCEEDED',
            message: 'Maximum number of sessions reached',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to create session',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get session details
   */
  static async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      const session = await Session.findOne({
        sessionId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Get latest QR code if available
      let qrCode = null;
      if (session.status === 'QR') {
        const latestQR = await QREvent.getLatestQR(sessionId, session.userId.toString());
        if (latestQR && latestQR.expiresAt > new Date()) {
          qrCode = {
            data: latestQR.qrData,
            expiresAt: latestQR.expiresAt,
            tries: latestQR.tries,
          };
        }
      }

      // Get session statistics
      const stats = await Session.getSessionStatistics(sessionId);

      res.json({
        success: true,
        data: {
          session: {
            id: session._id,
            sessionId: session.sessionId,
            status: session.status,
            deviceInfo: session.deviceInfo,
            phone: session.phone,
            lastSeenAt: session.lastSeenAt,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          },
          qrCode,
          statistics: stats,
        },
      });
    } catch (error) {
      logger.error('Get session error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve session',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Update session configuration
   */
  static async updateSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const validation = updateSessionSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      const updates = validation.data;

      // Find and update session
      const session = await Session.findOneAndUpdate(
        {
          sessionId,
        },
        {
          $set: {
            ...(updates.deviceName && { 'deviceInfo.name': updates.deviceName }),
            updatedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.info(`Session updated: ${sessionId}`, updates);

      res.json({
        success: true,
        data: {
          session: {
            id: session._id,
            sessionId: session.sessionId,
            status: session.status,
            deviceInfo: session.deviceInfo,
            updatedAt: session.updatedAt,
          },
        },
      });
    } catch (error) {
      logger.error('Update session error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to update session',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Delete session
   */
  static async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      const session = await Session.findOne({
        sessionId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Stop WPPConnect client
      try {
        await WPPConnectManager.getInstance().destroyClient(sessionId);
      } catch (wppError) {
        logger.warn('Failed to destroy WPPConnect client:', wppError);
      }

      // Update session status to EXPIRED
      await Session.updateStatus(sessionId, SessionStatus.EXPIRED);

      // Log event
      await Event.recordEvent({
        userId: req.user!.userId,
        sessionId,
        type: EventType.SESSION_DELETED,
        payload: {
          deletedAt: new Date(),
          deviceInfo: session.deviceInfo,
        },
      });

      logger.info(`Session deleted: ${sessionId}`, {
        userId: req.user!.userId,
      });

      res.json({
        success: true,
        message: 'Session deleted successfully',
      });
    } catch (error) {
      logger.error('Delete session error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to delete session',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Refresh QR code
   */
  static async refreshQR(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      const session = await Session.findOne({
        sessionId,
        userId: req.user!.userId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      if (session.status !== 'QR' && session.status !== 'PENDING') {
        res.status(400).json({
          error: {
            code: 'INVALID_SESSION_STATE',
            message: 'QR code can only be refreshed for sessions in QR or PENDING state',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Request QR refresh from WPPConnect
      try {
        await WPPConnectManager.getInstance().refreshQR(sessionId);

        logger.info(`QR code refresh requested: ${sessionId}`);

        res.json({
          success: true,
          message: 'QR code refresh requested. New QR code will be available shortly.',
        });
      } catch (wppError) {
        logger.error('WPPConnect QR refresh failed:', wppError);
        res.status(500).json({
          error: {
            code: 'WPP_ERROR',
            message: 'Failed to refresh QR code',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      }
    } catch (error) {
      logger.error('Refresh QR error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to refresh QR code',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get current QR code
   */
  static async getQR(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      const session = await Session.findOne({
        sessionId,
        userId: req.user!.userId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Try to get QR from in-memory client info first (using new method)
      const wppManager = WPPConnectManager.getInstance();
      const qrData = wppManager.getQRData(sessionId);

      if (qrData) {
        // Use in-memory QR data for immediate response
        const remainingTime = Math.max(
          0,
          Math.floor((qrData.expiresAt.getTime() - new Date().getTime()) / 1000)
        );

        logger.info(`Serving QR from memory for session: ${sessionId}`, {
          remainingTime,
          attempts: qrData.attempts,
        });

        res.json({
          success: true,
          data: {
            qrData: qrData.qrData,
            expiresAt: qrData.expiresAt,
            tries: qrData.attempts,
            remainingTime: remainingTime,
            sessionId: sessionId,
            source: 'memory',
          },
        });
        return;
      }

      // Fallback to database QR if not in memory
      const latestQR = await QREvent.getLatestQR(sessionId, req.user!.userId);

      if (!latestQR || latestQR.expiresAt <= new Date()) {
        // If no QR or expired, try to refresh QR for non-connected sessions
        if (session.status !== SessionStatus.CONNECTED) {
          logger.info(`No valid QR found for session ${sessionId}, attempting refresh`);

          try {
            // Initiate QR refresh
            await wppManager.refreshQR(sessionId);

            // Wait for QR generation with multiple attempts
            let attempts = 0;
            const maxAttempts = 6; // 6 attempts = 15 seconds max wait

            while (attempts < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 2500)); // Wait 2.5 seconds
              attempts++;

              // Try to get the new QR from memory first
              const updatedClientInfo = wppManager.getClientInfo(sessionId) as any;
              if (
                updatedClientInfo?.qrData &&
                updatedClientInfo?.qrExpiresAt &&
                updatedClientInfo.qrExpiresAt > new Date()
              ) {
                const remainingTime = Math.max(
                  0,
                  Math.floor(
                    (updatedClientInfo.qrExpiresAt.getTime() - new Date().getTime()) / 1000
                  )
                );

                logger.info(
                  `QR generated from memory after ${attempts} attempts for session: ${sessionId}`
                );

                res.json({
                  success: true,
                  data: {
                    qrData: updatedClientInfo.qrData,
                    expiresAt: updatedClientInfo.qrExpiresAt,
                    tries: updatedClientInfo.qrAttempts || 1,
                    remainingTime: remainingTime,
                    sessionId: sessionId,
                    source: 'memory_refresh',
                    attempts,
                  },
                });
                return;
              }

              // Fallback to database
              const newQR = await QREvent.getLatestQR(sessionId, req.user!.userId);
              if (newQR && newQR.expiresAt > new Date()) {
                const remainingTime = Math.max(
                  0,
                  Math.floor((newQR.expiresAt.getTime() - new Date().getTime()) / 1000)
                );

                logger.info(
                  `QR generated from database after ${attempts} attempts for session: ${sessionId}`
                );

                res.json({
                  success: true,
                  data: {
                    qrData: newQR.qrData,
                    expiresAt: newQR.expiresAt,
                    tries: newQR.tries,
                    remainingTime: remainingTime,
                    sessionId: newQR.sessionId,
                    source: 'database_refresh',
                    attempts,
                  },
                });
                return;
              }
            }

            logger.warn(
              `QR generation timeout after ${attempts} attempts for session: ${sessionId}`
            );
          } catch (refreshError) {
            logger.error('Failed to refresh QR:', refreshError);
          }
        }

        res.status(404).json({
          error: {
            code: 'QR_NOT_AVAILABLE',
            message:
              session.status === SessionStatus.CONNECTED
                ? 'Session is already connected'
                : 'No valid QR code available. Please try refreshing the session.',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
            sessionStatus: session.status,
          },
        });
        return;
      }

      // Calculate remaining time in seconds
      const remainingTime = Math.max(
        0,
        Math.floor((latestQR.expiresAt.getTime() - new Date().getTime()) / 1000)
      );

      logger.info(`Serving QR from database for session: ${sessionId}`, {
        remainingTime,
        tries: latestQR.tries,
      });

      res.json({
        success: true,
        data: {
          qrData: latestQR.qrData,
          expiresAt: latestQR.expiresAt,
          tries: latestQR.tries,
          remainingTime: remainingTime,
          sessionId: latestQR.sessionId,
          source: 'database',
        },
      });
    } catch (error) {
      logger.error('Get QR error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve QR code',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get session events
   */
  static async getSessionEvents(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const eventType = req.query.type as string;

      const session = await Session.findOne({
        sessionId,
        userId: req.user!.userId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Build query
      const query: any = { sessionId };
      if (eventType) {
        query.type = eventType;
      }

      const skip = (page - 1) * limit;

      // Get events with pagination
      const [events, total] = await Promise.all([
        Event.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Event.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          events,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      logger.error('Get session events error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve session events',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Force session reconnection
   */
  static async reconnectSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      const session = await Session.findOne({
        sessionId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Force reconnection
      try {
        await WPPConnectManager.getInstance().reconnectClient(sessionId);

        logger.info(`Session reconnection requested: ${sessionId}`);

        res.json({
          success: true,
          message: 'Session reconnection initiated',
        });
      } catch (wppError) {
        logger.error('WPPConnect reconnection failed:', wppError);
        res.status(500).json({
          error: {
            code: 'WPP_ERROR',
            message: 'Failed to reconnect session',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      }
    } catch (error) {
      logger.error('Reconnect session error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to reconnect session',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get session statistics
   */
  static async getSessionStats(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      const session = await Session.findOne({
        sessionId,
        userId: req.user!.userId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Get comprehensive statistics
      const stats = await Session.getSessionStatistics(sessionId);

      res.json({
        success: true,
        data: {
          statistics: stats,
        },
      });
    } catch (error) {
      logger.error('Get session stats error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve session statistics',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }
}
