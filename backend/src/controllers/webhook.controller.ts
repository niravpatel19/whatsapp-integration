import { Request, Response } from 'express';
import { Webhook, IWebhook } from '../models/Webhook.model';
import { EventType } from '../types/database.types';
import { logger } from '../utils/logger';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';
import { z } from 'zod';

// Validation schemas
const createWebhookSchema = z.object({
  url: z.string()
    .url('Invalid URL format')
    .refine(url => url.startsWith('https://'), 'Webhook URL must use HTTPS')
    .refine(url => url.length <= 2048, 'URL cannot exceed 2048 characters'),
  description: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
  eventTypes: z.array(z.nativeEnum(EventType))
    .min(1, 'At least one event type is required')
    .max(20, 'Cannot subscribe to more than 20 event types')
});

const updateWebhookSchema = z.object({
  url: z.string()
    .url('Invalid URL format')
    .refine(url => url.startsWith('https://'), 'Webhook URL must use HTTPS')
    .refine(url => url.length <= 2048, 'URL cannot exceed 2048 characters')
    .optional(),
  description: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
  eventTypes: z.array(z.nativeEnum(EventType))
    .min(1, 'At least one event type is required')
    .max(20, 'Cannot subscribe to more than 20 event types')
    .optional(),
  isActive: z.boolean().optional()
});

const testWebhookSchema = z.object({
  payload: z.record(z.any()).optional()
});

export class WebhookController {
  /**
   * Get all webhooks for the authenticated user
   * GET /api/v1/webhooks
   */
  static async getWebhooks(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const includeInactive = req.query.includeInactive === 'true';
      
      logger.info('Fetching webhooks', { 
        userId, 
        includeInactive,
        requestId: req.headers["x-request-id"] as string || "unknown" 
      });
      
      const webhooks = await Webhook.getUserWebhooks(userId, includeInactive);
      
      // Transform webhooks for response (hide secret)
      const responseWebhooks = webhooks.map(webhook => ({
        id: webhook._id,
        url: webhook.url,
        description: webhook.description,
        isActive: webhook.isActive,
        eventTypes: webhook.eventTypes,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
        stats: webhook.getStats(),
        health: webhook.isHealthy(),
        lastResponseCode: webhook.lastResponseCode,
        lastError: webhook.lastError,
        retryCount: webhook.retryCount
      }));
      
      res.json({
        webhooks: responseWebhooks,
        total: responseWebhooks.length
      });
      
    } catch (error: any) {
      logger.error('Error fetching webhooks', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch webhooks'
        }
      });
    }
  }
  
  /**
   * Create a new webhook
   * POST /api/v1/webhooks
   */
  static async createWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      
      // Validate request body
      const validationResult = createWebhookSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid webhook data',
            details: validationResult.error.errors
          }
        });
        return;
      }
      
      const { url, description, eventTypes } = validationResult.data;
      
      logger.info('Creating webhook', {
        userId,
        url,
        eventTypes,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      // Check if user already has a webhook with this URL
      const existingWebhook = await Webhook.findOne({
        userId,
        url,
        isActive: true
      });
      
      if (existingWebhook) {
        res.status(409).json({
          error: {
            code: 'WEBHOOK_EXISTS',
            message: 'A webhook with this URL already exists'
          }
        });
        return;
      }
      
      // Create the webhook
      const webhook = await Webhook.createWebhook({
        userId,
        url,
        description,
        eventTypes
      });
      
      logger.info('Webhook created successfully', {
        webhookId: webhook._id,
        userId,
        url,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      // Return webhook data (without secret)
      res.status(201).json({
        webhook: {
          id: webhook._id,
          url: webhook.url,
          description: webhook.description,
          isActive: webhook.isActive,
          eventTypes: webhook.eventTypes,
          createdAt: webhook.createdAt,
          updatedAt: webhook.updatedAt,
          stats: webhook.getStats(),
          health: webhook.isHealthy()
        }
      });
      
    } catch (error: any) {
      logger.error('Error creating webhook', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.userId,
        body: req.body,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      if (error.message.includes('Invalid webhook URL')) {
        res.status(400).json({
          error: {
            code: 'INVALID_URL',
            message: error.message
          }
        });
        return;
      }
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create webhook'
        }
      });
    }
  }
  
  /**
   * Get a specific webhook
   * GET /api/v1/webhooks/:webhookId
   */
  static async getWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { webhookId } = req.params;
      
      logger.info('Fetching webhook', {
        webhookId,
        userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      const webhook = await Webhook.findOne({
        _id: webhookId,
        userId
      });
      
      if (!webhook) {
        res.status(404).json({
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: 'Webhook not found'
          }
        });
        return;
      }
      
      // Get detailed stats
      const stats = webhook.getStats();
      
      res.json({
        webhook: {
          id: webhook._id,
          url: webhook.url,
          description: webhook.description,
          isActive: webhook.isActive,
          eventTypes: webhook.eventTypes,
          createdAt: webhook.createdAt,
          updatedAt: webhook.updatedAt,
          stats,
          health: webhook.isHealthy(),
          lastResponseCode: webhook.lastResponseCode,
          lastError: webhook.lastError,
          retryCount: webhook.retryCount,
          recentAttempts: webhook.deliveryAttempts.slice(-10) // Last 10 attempts
        }
      });
      
    } catch (error: any) {
      logger.error('Error fetching webhook', {
        error: error.message,
        stack: error.stack,
        webhookId: req.params.webhookId,
        userId: req.user?.userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch webhook'
        }
      });
    }
  }
  
  /**
   * Update a webhook
   * PUT /api/v1/webhooks/:webhookId
   */
  static async updateWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { webhookId } = req.params;
      
      // Validate request body
      const validationResult = updateWebhookSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid webhook data',
            details: validationResult.error.errors
          }
        });
        return;
      }
      
      const updates = validationResult.data;
      
      logger.info('Updating webhook', {
        webhookId,
        userId,
        updates,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      // Check if URL is being changed to an existing one
      if (updates.url) {
        const existingWebhook = await Webhook.findOne({
          userId,
          url: updates.url,
          _id: { $ne: webhookId },
          isActive: true
        });
        
        if (existingWebhook) {
          res.status(409).json({
            error: {
              code: 'WEBHOOK_EXISTS',
              message: 'A webhook with this URL already exists'
            }
          });
          return;
        }
      }
      
      const webhook = await Webhook.updateWebhook(webhookId, userId, updates);
      
      if (!webhook) {
        res.status(404).json({
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: 'Webhook not found'
          }
        });
        return;
      }
      
      logger.info('Webhook updated successfully', {
        webhookId,
        userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.json({
        webhook: {
          id: webhook._id,
          url: webhook.url,
          description: webhook.description,
          isActive: webhook.isActive,
          eventTypes: webhook.eventTypes,
          createdAt: webhook.createdAt,
          updatedAt: webhook.updatedAt,
          stats: webhook.getStats(),
          health: webhook.isHealthy()
        }
      });
      
    } catch (error: any) {
      logger.error('Error updating webhook', {
        error: error.message,
        stack: error.stack,
        webhookId: req.params.webhookId,
        userId: req.user?.userId,
        body: req.body,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      if (error.message.includes('Invalid webhook URL')) {
        res.status(400).json({
          error: {
            code: 'INVALID_URL',
            message: error.message
          }
        });
        return;
      }
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update webhook'
        }
      });
    }
  }
  
  /**
   * Delete a webhook
   * DELETE /api/v1/webhooks/:webhookId
   */
  static async deleteWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { webhookId } = req.params;
      
      logger.info('Deleting webhook', {
        webhookId,
        userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      const deleted = await Webhook.deleteWebhook(webhookId, userId);
      
      if (!deleted) {
        res.status(404).json({
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: 'Webhook not found'
          }
        });
        return;
      }
      
      logger.info('Webhook deleted successfully', {
        webhookId,
        userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.status(204).send();
      
    } catch (error: any) {
      logger.error('Error deleting webhook', {
        error: error.message,
        stack: error.stack,
        webhookId: req.params.webhookId,
        userId: req.user?.userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to delete webhook'
        }
      });
    }
  }
  
  /**
   * Test a webhook
   * POST /api/v1/webhooks/:webhookId/test
   */
  static async testWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { webhookId } = req.params;
      
      // Validate request body
      const validationResult = testWebhookSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid test payload',
            details: validationResult.error.errors
          }
        });
        return;
      }
      
      const { payload } = validationResult.data;
      
      logger.info('Testing webhook', {
        webhookId,
        userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      const testResult = await Webhook.testWebhook(webhookId, userId, payload);
      
      logger.info('Webhook test completed', {
        webhookId,
        userId,
        success: testResult.success,
        responseCode: testResult.responseCode,
        responseTime: testResult.responseTime,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.json({
        test: {
          success: testResult.success,
          responseCode: testResult.responseCode,
          responseTime: testResult.responseTime,
          error: testResult.error,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error: any) {
      logger.error('Error testing webhook', {
        error: error.message,
        stack: error.stack,
        webhookId: req.params.webhookId,
        userId: req.user?.userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      if (error.message === 'Webhook not found') {
        res.status(404).json({
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: 'Webhook not found'
          }
        });
        return;
      }
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to test webhook'
        }
      });
    }
  }
  
  /**
   * Get webhook delivery logs
   * GET /api/v1/webhooks/:webhookId/logs
   */
  static async getWebhookLogs(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { webhookId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      
      logger.info('Fetching webhook logs', {
        webhookId,
        userId,
        limit,
        offset,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      const webhook = await Webhook.findOne({
        _id: webhookId,
        userId
      });
      
      if (!webhook) {
        res.status(404).json({
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: 'Webhook not found'
          }
        });
        return;
      }
      
      // Get paginated delivery attempts
      const totalAttempts = webhook.deliveryAttempts.length;
      const attempts = webhook.deliveryAttempts
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(offset, offset + limit);
      
      res.json({
        logs: attempts,
        pagination: {
          total: totalAttempts,
          limit,
          offset,
          hasMore: offset + limit < totalAttempts
        }
      });
      
    } catch (error: any) {
      logger.error('Error fetching webhook logs', {
        error: error.message,
        stack: error.stack,
        webhookId: req.params.webhookId,
        userId: req.user?.userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch webhook logs'
        }
      });
    }
  }
  
  /**
   * Retry failed webhook deliveries
   * POST /api/v1/webhooks/:webhookId/retry
   */
  static async retryWebhook(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { webhookId } = req.params;
      
      logger.info('Retrying webhook deliveries', {
        webhookId,
        userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      const webhook = await Webhook.findOne({
        _id: webhookId,
        userId
      });
      
      if (!webhook) {
        res.status(404).json({
          error: {
            code: 'WEBHOOK_NOT_FOUND',
            message: 'Webhook not found'
          }
        });
        return;
      }
      
      if (!webhook.shouldRetry()) {
        res.status(400).json({
          error: {
            code: 'RETRY_NOT_ALLOWED',
            message: 'Webhook cannot be retried (max retries reached or webhook inactive)'
          }
        });
        return;
      }
      
      // Reset retry count to allow retry
      await webhook.resetRetryCount();
      
      logger.info('Webhook retry initiated', {
        webhookId,
        userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.json({
        message: 'Webhook retry initiated',
        webhook: {
          id: webhook._id,
          retryCount: webhook.retryCount,
          canRetry: webhook.shouldRetry()
        }
      });
      
    } catch (error: any) {
      logger.error('Error retrying webhook', {
        error: error.message,
        stack: error.stack,
        webhookId: req.params.webhookId,
        userId: req.user?.userId,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retry webhook'
        }
      });
    }
  }
  
  /**
   * Get available event types
   * GET /api/v1/webhooks/event-types
   */
  static async getEventTypes(req: Request, res: Response): Promise<void> {
    try {
      const eventTypes = Object.values(EventType).map(type => ({
        type,
        description: getEventTypeDescription(type)
      }));
      
      res.json({
        eventTypes
      });
      
    } catch (error: any) {
      logger.error('Error fetching event types', {
        error: error.message,
        stack: error.stack,
        requestId: req.headers["x-request-id"] as string || "unknown"
      });
      
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch event types'
        }
      });
    }
  }
}

/**
 * Get human-readable description for event types
 */
function getEventTypeDescription(eventType: EventType): string {
  const descriptions: Record<EventType, string> = {
    [EventType.SESSION_STATE]: 'Session status changes (connected, disconnected, etc.)',
    [EventType.SESSION_DELETED]: 'WhatsApp session was deleted or removed',
    [EventType.MESSAGE_SENT]: 'Message successfully sent to WhatsApp',
    [EventType.MESSAGE_DELIVERED]: 'Message delivered to recipient',
    [EventType.MESSAGE_READ]: 'Message read by recipient',
    [EventType.QR_REFRESHED]: 'QR code updated for session pairing',
    [EventType.LOGIN]: 'User login events',
    [EventType.LOGOUT]: 'User logout events',
    [EventType.ERROR]: 'System errors and failures',
    [EventType.DISCONNECTED]: 'WhatsApp session disconnected',
    [EventType.RECONNECTED]: 'WhatsApp session reconnected'
  };
  
  return descriptions[eventType] || 'Unknown event type';
}