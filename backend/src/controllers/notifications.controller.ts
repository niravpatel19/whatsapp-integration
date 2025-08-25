import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Notification } from '../models/Notification.model';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import { notificationService } from '../services/notification.service';
import { NotificationType, NotificationStatus } from '../types/database.types';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas
const notificationFiltersSchema = z.object({
  type: z.enum(['SESSION_DISCONNECTED', 'SESSION_RECONNECTED', 'SESSION_ERROR', 'SESSION_EXPIRED']).optional(),
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'SUPPRESSED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const testNotificationSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  type: z.enum(['SESSION_DISCONNECTED', 'SESSION_RECONNECTED', 'SESSION_ERROR']),
});

const notificationSettingsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  notificationTypes: z.array(z.enum(['SESSION_DISCONNECTED', 'SESSION_RECONNECTED', 'SESSION_ERROR', 'SESSION_EXPIRED'])).optional(),
  suppressionHours: z.number().min(1).max(24).default(1).optional(),
});

export class NotificationsController {
  /**
   * Get user notifications
   */
  static async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      const validation = notificationFiltersSchema.safeParse(req.query);
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

      const { type, status, page, limit } = validation.data;
      const skip = (page - 1) * limit;

      // Build query
      const userId = req.user?.userId || '000000000000000000000001';
      const query: any = { userId: new Types.ObjectId(userId) };
      
      if (type) {
        query.type = type;
      }
      if (status) {
        query.status = status;
      }

      // Get notifications with pagination
      const [notifications, total] = await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Notification.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          notifications: notifications.map(notification => ({
            id: notification._id,
            sessionId: notification.sessionId,
            type: notification.type,
            status: notification.status,
            subject: notification.subject,
            content: notification.content,
            recipient: notification.recipient,
            sentAt: notification.sentAt,
            errorMessage: notification.errorMessage,
            metadata: notification.metadata,
            createdAt: notification.createdAt,
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      logger.error('Get notifications error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve notifications',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Send test notification
   */
  static async sendTestNotification(req: Request, res: Response): Promise<void> {
    try {
      const validation = testNotificationSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      const { sessionId, type } = validation.data;
      const userId = req.user?.userId || '000000000000000000000001';

      // Verify session exists and belongs to user
      const session = await Session.findOne({
        sessionId,
        userId: new Types.ObjectId(userId),
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

      // Send test notification based on type
      const notificationData = {
        sessionId,
        userId,
        deviceName: session.deviceInfo?.name || 'Test Device',
        phone: session.phone || '+1234567890',
        disconnectedAt: new Date(),
        reconnectedAt: new Date(),
        errorMessage: 'This is a test error message',
      };

      switch (type) {
        case 'SESSION_DISCONNECTED':
          await notificationService.sendSessionDisconnectedNotification(notificationData);
          break;
        case 'SESSION_RECONNECTED':
          await notificationService.sendSessionReconnectedNotification(notificationData);
          break;
        case 'SESSION_ERROR':
          await notificationService.sendSessionErrorNotification(notificationData);
          break;
      }

      logger.info(`Test notification sent: ${type} for session ${sessionId}`, {
        userId,
        type,
      });

      res.json({
        success: true,
        message: `Test ${type.toLowerCase().replace('_', ' ')} notification sent successfully`,
        data: {
          sessionId,
          type,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Send test notification error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to send test notification',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get notification settings
   */
  static async getNotificationSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId || '000000000000000000000001';
      const user = await User.findById(userId).select('notificationSettings email');

      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Default notification settings
      const defaultSettings = {
        emailNotifications: true,
        notificationTypes: ['SESSION_DISCONNECTED', 'SESSION_ERROR'],
        suppressionHours: 1,
      };

      const settings = user.notificationSettings || defaultSettings;

      res.json({
        success: true,
        data: {
          settings: {
            ...settings,
            email: user.email,
          },
        },
      });
    } catch (error) {
      logger.error('Get notification settings error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve notification settings',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Update notification settings
   */
  static async updateNotificationSettings(req: Request, res: Response): Promise<void> {
    try {
      const validation = notificationSettingsSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      const userId = req.user?.userId || '000000000000000000000001';
      const updates = validation.data;

      const user = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            'notificationSettings.emailNotifications': updates.emailNotifications,
            'notificationSettings.notificationTypes': updates.notificationTypes,
            'notificationSettings.suppressionHours': updates.suppressionHours,
            updatedAt: new Date(),
          },
        },
        { new: true, upsert: false }
      ).select('notificationSettings email');

      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.info(`Notification settings updated for user ${userId}`, updates);

      res.json({
        success: true,
        message: 'Notification settings updated successfully',
        data: {
          settings: {
            ...user.notificationSettings,
            email: user.email,
          },
        },
      });
    } catch (error) {
      logger.error('Update notification settings error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to update notification settings',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId || '000000000000000000000001';

      const notification = await Notification.findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          userId: new Types.ObjectId(userId),
        },
        {
          $set: {
            'metadata.readAt': new Date(),
            updatedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!notification) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Notification not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      res.json({
        success: true,
        message: 'Notification marked as read',
        data: {
          id: notification._id,
          readAt: notification.metadata?.readAt,
        },
      });
    } catch (error) {
      logger.error('Mark notification as read error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to mark notification as read',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }
}