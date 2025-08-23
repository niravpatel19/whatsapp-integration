import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import { Webhook, IWebhook } from '../models/Webhook.model';
import { EventType } from '../types/database.types';
import { logger } from '../utils/logger';

export interface WebhookDeliveryJob {
  webhookId: string;
  eventType: EventType;
  payload: any;
  attempt: number;
  maxAttempts: number;
}

export interface WebhookDeliveryResult {
  success: boolean;
  responseCode?: number;
  responseTime: number;
  error?: string;
  shouldRetry: boolean;
}

export class WebhookService {
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
  private static readonly DELIVERY_TIMEOUT = 30000; // 30 seconds
  
  /**
   * Deliver webhook to all subscribed endpoints for a specific event
   */
  static async deliverWebhooksForEvent(
    userId: string,
    eventType: EventType,
    payload: any
  ): Promise<void> {
    try {
      logger.info('Delivering webhooks for event', {
        userId,
        eventType,
        payloadKeys: Object.keys(payload)
      });
      
      // Get all active webhooks for this user and event type
      const webhooks = await Webhook.find({
        userId,
        isActive: true,
        eventTypes: eventType
      });
      
      if (webhooks.length === 0) {
        logger.debug('No active webhooks found for event', { userId, eventType });
        return;
      }
      
      // Deliver to all webhooks in parallel
      const deliveryPromises = webhooks.map(webhook => 
        this.deliverWebhook(webhook, eventType, payload)
      );
      
      await Promise.allSettled(deliveryPromises);
      
      logger.info('Webhook delivery batch completed', {
        userId,
        eventType,
        webhookCount: webhooks.length
      });
      
    } catch (error: any) {
      logger.error('Error delivering webhooks for event', {
        error: error.message,
        stack: error.stack,
        userId,
        eventType
      });
    }
  }
  
  /**
   * Deliver webhook to a specific endpoint
   */
  static async deliverWebhook(
    webhook: IWebhook,
    eventType: EventType,
    payload: any,
    attempt: number = 1
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Delivering webhook', {
        webhookId: webhook._id,
        url: webhook.url,
        eventType,
        attempt
      });
      
      // Prepare the payload
      const webhookPayload = {
        id: crypto.randomUUID(),
        event: eventType,
        timestamp: new Date().toISOString(),
        data: payload,
        webhook: {
          id: webhook._id,
          url: webhook.url
        }
      };
      
      const payloadString = JSON.stringify(webhookPayload);
      const signature = webhook.generateSignature(payloadString);
      
      // Make the HTTP request
      const response: AxiosResponse = await axios.post(webhook.url, webhookPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': eventType,
          'X-Webhook-ID': webhookPayload.id,
          'User-Agent': 'WhatsApp-Integration-Webhook/1.0'
        },
        timeout: this.DELIVERY_TIMEOUT,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });
      
      const responseTime = Date.now() - startTime;
      const success = response.status >= 200 && response.status < 300;
      
      // Record the delivery attempt
      await webhook.recordDelivery({
        timestamp: new Date(),
        success,
        responseCode: response.status,
        responseTime,
        retryCount: attempt - 1
      });
      
      const result: WebhookDeliveryResult = {
        success,
        responseCode: response.status,
        responseTime,
        shouldRetry: !success && attempt < this.MAX_RETRIES
      };
      
      if (success) {
        logger.info('Webhook delivered successfully', {
          webhookId: webhook._id,
          responseCode: response.status,
          responseTime
        });
      } else {
        logger.warn('Webhook delivery failed', {
          webhookId: webhook._id,
          responseCode: response.status,
          responseTime,
          attempt
        });
        
        // Schedule retry if needed
        if (result.shouldRetry) {
          await this.scheduleRetry(webhook, eventType, payload, attempt + 1);
        }
      }
      
      return result;
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      
      logger.error('Webhook delivery error', {
        webhookId: webhook._id,
        url: webhook.url,
        error: errorMessage,
        responseCode: error.response?.status,
        responseTime,
        attempt
      });
      
      // Record the failed delivery attempt
      await webhook.recordDelivery({
        timestamp: new Date(),
        success: false,
        responseCode: error.response?.status,
        responseTime,
        error: errorMessage,
        retryCount: attempt - 1
      });
      
      const result: WebhookDeliveryResult = {
        success: false,
        responseCode: error.response?.status,
        responseTime,
        error: errorMessage,
        shouldRetry: attempt < this.MAX_RETRIES
      };
      
      // Schedule retry if needed
      if (result.shouldRetry) {
        await this.scheduleRetry(webhook, eventType, payload, attempt + 1);
      }
      
      return result;
    }
  }
  
  /**
   * Schedule a webhook retry with exponential backoff
   */
  private static async scheduleRetry(
    webhook: IWebhook,
    eventType: EventType,
    payload: any,
    attempt: number
  ): Promise<void> {
    if (attempt > this.MAX_RETRIES) {
      logger.warn('Max retry attempts reached for webhook', {
        webhookId: webhook._id,
        attempt
      });
      return;
    }
    
    const delay = this.RETRY_DELAYS[attempt - 2] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
    
    logger.info('Scheduling webhook retry', {
      webhookId: webhook._id,
      attempt,
      delayMs: delay
    });
    
    // Increment retry count
    await webhook.incrementRetryCount();
    
    // Schedule the retry
    setTimeout(async () => {
      try {
        await this.deliverWebhook(webhook, eventType, payload, attempt);
      } catch (error: any) {
        logger.error('Error in scheduled webhook retry', {
          webhookId: webhook._id,
          attempt,
          error: error.message
        });
      }
    }, delay);
  }
  
  /**
   * Process webhook delivery job (for queue-based processing)
   */
  static async processWebhookDelivery(job: WebhookDeliveryJob): Promise<void> {
    try {
      const webhook = await Webhook.findById(job.webhookId);
      
      if (!webhook) {
        logger.warn('Webhook not found for delivery job', {
          webhookId: job.webhookId
        });
        return;
      }
      
      if (!webhook.isActive) {
        logger.info('Skipping delivery for inactive webhook', {
          webhookId: job.webhookId
        });
        return;
      }
      
      await this.deliverWebhook(webhook, job.eventType, job.payload, job.attempt);
      
    } catch (error: any) {
      logger.error('Error processing webhook delivery job', {
        error: error.message,
        stack: error.stack,
        job
      });
    }
  }
  
  /**
   * Schedule webhook delivery (for queue-based processing)
   */
  static async scheduleWebhookDelivery(
    webhookId: string,
    eventType: EventType,
    payload: any
  ): Promise<void> {
    const job: WebhookDeliveryJob = {
      webhookId,
      eventType,
      payload,
      attempt: 1,
      maxAttempts: this.MAX_RETRIES
    };
    
    // For now, process immediately
    // In production, this would be queued using Redis/Bull
    await this.processWebhookDelivery(job);
  }
  
  /**
   * Validate webhook signature
   */
  static validateWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload, 'utf8')
        .digest('hex');
      
      const providedSignature = signature.replace('sha256=', '');
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Clean up failed webhooks
   */
  static async cleanupFailedWebhooks(): Promise<number> {
    try {
      logger.info('Starting webhook cleanup');
      
      const deactivatedCount = await Webhook.cleanupFailedWebhooks(10);
      
      logger.info('Webhook cleanup completed', {
        deactivatedCount
      });
      
      return deactivatedCount;
    } catch (error: any) {
      logger.error('Error during webhook cleanup', {
        error: error.message,
        stack: error.stack
      });
      return 0;
    }
  }
  
  /**
   * Get webhook delivery statistics
   */
  static async getDeliveryStats(userId: string): Promise<{
    totalWebhooks: number;
    activeWebhooks: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    averageSuccessRate: number;
  }> {
    try {
      const webhooks = await Webhook.find({ userId });
      
      const stats = webhooks.reduce((acc, webhook) => {
        acc.totalDeliveries += webhook.totalDeliveries;
        acc.successfulDeliveries += webhook.successfulDeliveries;
        acc.failedDeliveries += webhook.failedDeliveries;
        return acc;
      }, {
        totalWebhooks: webhooks.length,
        activeWebhooks: webhooks.filter(w => w.isActive).length,
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        averageSuccessRate: 0
      });
      
      stats.averageSuccessRate = stats.totalDeliveries > 0
        ? (stats.successfulDeliveries / stats.totalDeliveries) * 100
        : 0;
      
      return stats;
    } catch (error: any) {
      logger.error('Error getting webhook delivery stats', {
        error: error.message,
        userId
      });
      
      return {
        totalWebhooks: 0,
        activeWebhooks: 0,
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        averageSuccessRate: 0
      };
    }
  }
}