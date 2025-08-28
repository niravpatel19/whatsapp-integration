import { Request, Response } from 'express';
import { Message } from '../models/Message.model';
import { Session } from '../models/Session.model';
import { Event } from '../models/Event.model';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { ValidationService, CommonSchemas } from '../services/validation.service';
import { WPPConnectManager } from '../wpp/manager.factory';
import { MessageType, MessageStatus, EventType } from '../types/database.types';
import crypto from 'crypto';

// Validation schemas
const sendMessageSchema = z
  .object({
    sessionId: z.string().min(1, 'Session ID is required'),
    to: CommonSchemas.phone,
    type: z.enum(['text', 'image', 'document', 'audio', 'video', 'location']),
    content: z.string().optional(),
    mediaUrl: z.string().refine((url) => {
      if (!url) return true; // Optional field
      try {
        new URL(url);
        return url.startsWith('http://') || url.startsWith('https://');
      } catch {
        return false;
      }
    }, 'Invalid media URL').optional(),
    caption: z.string().max(1000, 'Caption too long').optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    address: z.string().max(200, 'Address too long').optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'text' && !data.content) {
        return false;
      }
      if (['image', 'document', 'audio', 'video'].includes(data.type) && !data.mediaUrl) {
        return false;
      }
      if (data.type === 'location' && (!data.latitude || !data.longitude)) {
        return false;
      }
      return true;
    },
    {
      message: 'Invalid message data for the specified type',
    }
  );

const bulkSendSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  messages: z
    .array(
      z.object({
        to: CommonSchemas.phone,
        type: z.enum(['text', 'image', 'document', 'audio', 'video', 'location']),
        content: z.string().optional(),
        mediaUrl: z.string().refine((url) => {
          if (!url) return true; // Optional field
          try {
            new URL(url);
            return url.startsWith('http://') || url.startsWith('https://');
          } catch {
            return false;
          }
        }, 'Invalid media URL').optional(),
        caption: z.string().max(1000, 'Caption too long').optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        address: z.string().max(200, 'Address too long').optional(),
      })
    )
    .min(1, 'At least one message is required')
    .max(100, 'Maximum 100 messages per batch'),
});

const messageFiltersSchema = z.object({
  sessionId: z.string().optional(),
  to: z.string().optional(),
  type: z.enum(['text', 'image', 'document', 'audio', 'video', 'location']).optional(),
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED']),
  error: z.string().optional(),
});

export class MessagesController {
  /**
   * Send a message
   */
  static async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const validation = sendMessageSchema.safeParse(req.body);
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

      const messageData = validation.data;
      const idempotencyKey = req.headers['idempotency-key'] as string;

      // Check idempotency - we'll validate userId later, so use API key user for now
      if (idempotencyKey) {
        const existingMessage = await Message.findOne({
          userId: req.user!.userId,
          idempotencyKey,
        });

        if (existingMessage) {
          res.json({
            success: true,
            data: {
              message: {
                id: existingMessage._id,
                messageId: existingMessage.messageId,
                status: existingMessage.status,
                createdAt: existingMessage.createdAt,
              },
            },
            note: 'Message already sent (idempotency key matched)',
          });
          return;
        }
      }

      // Validate session - use sessionId directly without user filtering
      const session = await Session.findOne({
        sessionId: messageData.sessionId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      if (session.status !== 'CONNECTED') {
        res.status(400).json({
          error: {
            code: 'SESSION_NOT_CONNECTED',
            message: 'Session is not connected to WhatsApp',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Validate media URL if provided
      if (messageData.mediaUrl) {
        const mediaValidation = await ValidationService.validateMediaUrl(
          messageData.mediaUrl,
          messageData.type as 'image' | 'document' | 'audio' | 'video'
        );

        if (!mediaValidation.success || !mediaValidation.data?.isValid) {
          res.status(400).json({
            error: {
              code: 'INVALID_MEDIA',
              message: 'Invalid media URL',
              details: mediaValidation.data?.errors || ['Media validation failed'],
              timestamp: new Date().toISOString(),
              requestId: req.headers['x-request-id'] || 'unknown',
            },
          });
          return;
        }
      }

      // Use the session's userId for message ownership (session owner should own the message)
      // But validate it's a proper ObjectId format first
      let messageUserId: string;
      try {
        // Try to use session's userId if it's valid
        const sessionUserIdString = session.userId.toString();
        // Validate it's a proper ObjectId format (24 hex characters)
        if (/^[0-9a-fA-F]{24}$/.test(sessionUserIdString)) {
          messageUserId = sessionUserIdString;
        } else {
          // Fallback to API key user if session userId is invalid
          messageUserId = req.user!.userId;
        }
      } catch (error) {
        // Fallback to API key user if there's any error
        messageUserId = req.user!.userId;
      }
      
      // Debug logging to see what we're working with
      logger.info('Message creation debug info:', {
        sessionUserId: session.userId,
        messageUserId: messageUserId,
        sessionUserIdType: typeof session.userId,
        messageUserIdType: typeof messageUserId,
        sessionUserIdString: session.userId.toString(),
        apiKeyUserId: req.user!.userId,
        apiKeyUserIdType: typeof req.user!.userId,
        isValidObjectId: /^[0-9a-fA-F]{24}$/.test(messageUserId)
      });

      // Create message record
      const message = await Message.createMessage({
        userId: messageUserId,
        sessionId: messageData.sessionId,
        to: messageData.to,
        type: messageData.type as MessageType,
        content: messageData.content,
        mediaUrl: messageData.mediaUrl,
        caption: messageData.caption,
        metadata: {
          latitude: messageData.latitude,
          longitude: messageData.longitude,
          address: messageData.address,
        },
        idempotencyKey,
      });

      // Send message via WPPConnect
      try {
        let wppResult;
        const wppManager = WPPConnectManager.getInstance();

        switch (messageData.type) {
          case 'text':
            wppResult = await wppManager.sendTextMessage(
              messageData.sessionId,
              messageData.to,
              messageData.content!
            );
            break;

          case 'image':
            wppResult = await wppManager.sendImageMessage(
              messageData.sessionId,
              messageData.to,
              messageData.mediaUrl!,
              messageData.caption
            );
            break;

          case 'document':
            wppResult = await wppManager.sendDocumentMessage(
              messageData.sessionId,
              messageData.to,
              messageData.mediaUrl!,
              messageData.caption
            );
            break;

          case 'audio':
            wppResult = await wppManager.sendAudioMessage(
              messageData.sessionId,
              messageData.to,
              messageData.mediaUrl!
            );
            break;

          case 'video':
            wppResult = await wppManager.sendVideoMessage(
              messageData.sessionId,
              messageData.to,
              messageData.mediaUrl!,
              messageData.caption
            );
            break;

          case 'location':
            wppResult = await wppManager.sendLocationMessage(
              messageData.sessionId,
              messageData.to,
              messageData.latitude!,
              messageData.longitude!,
              messageData.address
            );
            break;

          default:
            throw new Error(`Unsupported message type: ${messageData.type}`);
        }

        // Update message status
        await Message.updateStatus(message.messageId, MessageStatus.SENT);

        // Record event - use the same validated userId as the message
        await Event.recordEvent({
          userId: messageUserId,
          sessionId: messageData.sessionId,
          type: EventType.MESSAGE_SENT,
          payload: {
            messageId: message.messageId,
            to: messageData.to,
            type: messageData.type as MessageType,
            wppResult,
          },
        });

        logger.info(`Message sent successfully: ${message.messageId}`, {
          userId: messageUserId,
          sessionId: messageData.sessionId,
          to: messageData.to,
          type: messageData.type as MessageType,
        });

        res.status(201).json({
          success: true,
          data: {
            message: {
              id: message._id,
              messageId: message.messageId,
              to: message.to,
              type: message.type,
              status: 'SENT',
              createdAt: message.createdAt,
            },
          },
        });
      } catch (wppError: any) {
        logger.error('WPPConnect send message error:', wppError);

        // Update message status to FAILED
        await Message.updateStatus(message.messageId, MessageStatus.FAILED, wppError.message);

        res.status(500).json({
          error: {
            code: 'MESSAGE_SEND_FAILED',
            message: 'Failed to send message via WhatsApp',
            details: wppError.message,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
      }
    } catch (error: any) {
      logger.error('Send message error:', error);

      if (error.message.includes('rate limit')) {
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Message sending rate limit exceeded',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to send message',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get message details
   */
  static async getMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;

      const message = await Message.findOne({
        messageId,
        userId: req.user!.userId,
      });

      if (!message) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Message not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          message: {
            id: message._id,
            messageId: message.messageId,
            sessionId: message.sessionId,
            to: message.to,
            type: message.type,
            content: message.content,
            mediaUrl: message.mediaUrl,
            caption: message.caption,
            status: message.status,
            error: message.error,
            metadata: message.metadata,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
          },
        },
      });
    } catch (error) {
      logger.error('Get message error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve message',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get message history with filtering and pagination
   */
  static async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const validation = messageFiltersSchema.safeParse(req.query);
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

      const { sessionId, to, type, status, page, limit, sortBy, sortOrder, search } =
        validation.data;
      const skip = (page - 1) * limit;

      // Build query
      const query: any = { userId: req.user!.userId };
      if (sessionId) query.sessionId = sessionId;
      if (to) query.to = to;
      if (type) query.type = type;
      if (status) query.status = status;
      if (search) {
        query.$or = [
          { content: { $regex: search, $options: 'i' } },
          { caption: { $regex: search, $options: 'i' } },
          { to: { $regex: search, $options: 'i' } },
        ];
      }

      // Build sort
      const sort: any = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Get messages with pagination
      const [messages, total] = await Promise.all([
        Message.find(query).sort(sort).skip(skip).limit(limit).lean(),
        Message.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          messages,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      logger.error('Get messages error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve messages',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Update message status (for webhooks)
   */
  static async updateMessageStatus(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const validation = updateStatusSchema.safeParse(req.body);

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

      const { status, error } = validation.data;

      const message = await Message.findOne({
        messageId,
        userId: req.user!.userId,
      });

      if (!message) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Message not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Update message status
      await Message.updateStatus(messageId, status as MessageStatus, error);

      // Record event - use the message's userId to maintain consistency
      await Event.recordEvent({
        userId: message.userId.toString(),
        sessionId: message.sessionId,
        type: status === 'DELIVERED' ? EventType.MESSAGE_DELIVERED : EventType.MESSAGE_READ,
        payload: {
          messageId,
          status,
          error,
        },
      });

      res.json({
        success: true,
        message: 'Message status updated successfully',
      });
    } catch (error) {
      logger.error('Update message status error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to update message status',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Delete message (mark as deleted)
   */
  static async deleteMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;

      const message = await Message.findOne({
        messageId,
        userId: req.user!.userId,
      });

      if (!message) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Message not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Mark as deleted (soft delete)
      message.metadata = { ...message.metadata, deleted: true, deletedAt: new Date() };
      await message.save();

      logger.info(`Message marked as deleted: ${messageId}`, {
        userId: req.user!.userId,
      });

      res.json({
        success: true,
        message: 'Message deleted successfully',
      });
    } catch (error) {
      logger.error('Delete message error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to delete message',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get messaging statistics
   */
  static async getMessageStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const sessionId = req.query.sessionId as string;

      // Build base query
      const baseQuery: any = { userId };
      if (sessionId) {
        baseQuery.sessionId = sessionId;
      }

      // Get statistics
      const [totalMessages, messagesByStatus, messagesByType, recentMessages] = await Promise.all([
        Message.countDocuments(baseQuery),
        Message.aggregate([
          { $match: baseQuery },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        Message.aggregate([
          { $match: baseQuery },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ]),
        Message.find(baseQuery)
          .sort({ createdAt: -1 })
          .limit(10)
          .select('messageId to type status createdAt')
          .lean(),
      ]);

      // Calculate delivery rate
      const sentMessages = messagesByStatus.find((s) => s._id === 'SENT')?.count || 0;
      const deliveredMessages = messagesByStatus.find((s) => s._id === 'DELIVERED')?.count || 0;
      const deliveryRate = sentMessages > 0 ? (deliveredMessages / sentMessages) * 100 : 0;

      res.json({
        success: true,
        data: {
          statistics: {
            totalMessages,
            deliveryRate: Math.round(deliveryRate * 100) / 100,
            messagesByStatus: messagesByStatus.reduce((acc, item) => {
              acc[item._id] = item.count;
              return acc;
            }, {}),
            messagesByType: messagesByType.reduce((acc, item) => {
              acc[item._id] = item.count;
              return acc;
            }, {}),
            recentMessages,
          },
        },
      });
    } catch (error) {
      logger.error('Get message stats error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve message statistics',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Send multiple messages (bulk send)
   */
  static async bulkSendMessages(req: Request, res: Response): Promise<void> {
    try {
      const validation = bulkSendSchema.safeParse(req.body);
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

      const { sessionId, messages } = validation.data;

      // Validate session
      const session = await Session.findOne({
        sessionId,
        userId: req.user!.userId,
      });

      if (!session) {
        res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      if (session.status !== 'CONNECTED') {
        res.status(400).json({
          error: {
            code: 'SESSION_NOT_CONNECTED',
            message: 'Session is not connected to WhatsApp',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      const results = [];
      const wppManager = WPPConnectManager.getInstance();

      // Process messages sequentially to avoid overwhelming WhatsApp
      for (const messageData of messages) {
        try {
          // Create message record
          const message = await Message.createMessage({
            userId: req.user!.userId,
            sessionId,
            to: messageData.to,
            type: messageData.type as MessageType,
            content: messageData.content,
            mediaUrl: messageData.mediaUrl,
            caption: messageData.caption,
            metadata: {
              latitude: messageData.latitude,
              longitude: messageData.longitude,
              address: messageData.address,
              bulkSend: true,
            },
          });

          // Send message
          let wppResult;
          switch (messageData.type) {
            case 'text':
              wppResult = await wppManager.sendTextMessage(
                sessionId,
                messageData.to,
                messageData.content!
              );
              break;
            // Add other message types as needed
          }

          await Message.updateStatus(message.messageId, MessageStatus.SENT);

          results.push({
            messageId: message.messageId,
            to: messageData.to,
            status: 'SENT',
            success: true,
          });

          // Add delay between messages to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error: any) {
          logger.error('Bulk send message error:', error);
          results.push({
            to: messageData.to,
            status: 'FAILED',
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      logger.info(`Bulk send completed: ${successCount} sent, ${failureCount} failed`, {
        userId: req.user!.userId,
        sessionId,
        totalMessages: messages.length,
      });

      res.json({
        success: true,
        data: {
          summary: {
            total: messages.length,
            sent: successCount,
            failed: failureCount,
          },
          results,
        },
      });
    } catch (error) {
      logger.error('Bulk send messages error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to send bulk messages',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * Get message templates
   */
  static async getMessageTemplates(req: Request, res: Response): Promise<void> {
    try {
      // Static templates for now - could be made dynamic later
      const templates = [
        {
          id: 'welcome',
          name: 'Welcome Message',
          type: 'text',
          content: "Welcome to our service! We're excited to have you on board.",
          category: 'greeting',
        },
        {
          id: 'order-confirmation',
          name: 'Order Confirmation',
          type: 'text',
          content: 'Your order #{orderNumber} has been confirmed and will be processed shortly.',
          category: 'business',
          variables: ['orderNumber'],
        },
        {
          id: 'appointment-reminder',
          name: 'Appointment Reminder',
          type: 'text',
          content: 'Reminder: You have an appointment scheduled for {date} at {time}.',
          category: 'reminder',
          variables: ['date', 'time'],
        },
        {
          id: 'thank-you',
          name: 'Thank You Message',
          type: 'text',
          content: 'Thank you for your business! We appreciate your trust in our services.',
          category: 'greeting',
        },
      ];

      res.json({
        success: true,
        data: {
          templates,
        },
      });
    } catch (error) {
      logger.error('Get message templates error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve message templates',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }
}
