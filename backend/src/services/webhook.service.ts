import Redis from 'ioredis';
import axios, { AxiosResponse } from 'axios';
import { Webhook, IWebhook, DeliveryAttempt } from '../models/Webhook.model';
import { EventType } from '../types/database.types';
import { logger } from '../utils/logger';

// Webhook delivery job interface
export interface WebhookDeliveryJob {
  webhookId: string;
  eventType: EventType;
  payload: any;
  attempt: number;
  scheduledAt: Date;
  maxRetries: number;
}

// Webhook delivery result interface
export interface WebhookDeliveryResult {
  success: boolean;
  responseCode?: number;
  responseTime: number;
  error?: string;
  shouldRetry: boolean;
}

export class WebhookDeliveryService {
  private redis: Redis;
  private readonly queueKey = 'webhook:delivery:queue';
  private readonly retryQueueKey = 'webhook:delivery:retry';
  private readonly deadLetterQueueKey = 'webhook:delivery:dead';
  private readonly processingKey = 'webhook:delivery:processing';
  
  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Queue a webhook delivery job
   */
  async queueDelivery(
    webhookId: string,
    eventType: EventType,
    payload: any,
    priority: number = 0
  ): Promise<void> {
    const job: WebhookDeliveryJob = {
      webhookId,
      eventType,
      payload,
      attempt: 1,
      scheduledAt: new Date(),
      maxRetries: 3
    };

    const jobData = JSON.stringify(job);
    
    // Add to priority queue (higher priority = lower score)
    await this.redis.zadd(this.queueKey, priority, jobData);
    
    logger.info('Webhook delivery job queued', {
      webhookId,
      eventType,
      priority
    });
  }

  /**
   * Process webhook delivery jobs from the queue
   */
  async processQueue(): Promise<void> {
    try {
      // Get the highest priority job (lowest score)
      const jobs = await this.redis.zrange(this.queueKey, 0, 0, 'WITHSCORES');
      
      if (jobs.length === 0) {
        return; // No jobs to process
      }

      const jobData = jobs[0];
      const score = parseFloat(jobs[1]);
      
      // Remove job from queue and add to processing set
      const removed = await this.redis.zrem(this.queueKey, jobData);
      if (removed === 0) {
        return; // Job was already processed by another worker
      }

      await this.redis.sadd(this.processingKey, jobData);

      try {
        const job: WebhookDeliveryJob = JSON.parse(jobData);
        const result = await this.deliverWebhook(job);

        if (!result.success && result.shouldRetry && job.attempt < job.maxRetries) {
          // Schedule retry with exponential backoff
          await this.scheduleRetry(job);
        } else if (!result.success) {
          // Move to dead letter queue
          await this.moveToDeadLetterQueue(job, result.error);
        }

      } catch (error) {
        logger.error('Error processing webhook delivery job', {
          jobData,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Move malformed job to dead letter queue
        await this.redis.lpush(this.deadLetterQueueKey, jobData);
      } finally {
        // Remove from processing set
        await this.redis.srem(this.processingKey, jobData);
      }

    } catch (error) {
      logger.error('Error in webhook queue processing', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Deliver webhook to endpoint
   */
  private async deliverWebhook(job: WebhookDeliveryJob): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    
    try {
      // Get webhook from database
      const webhook = await Webhook.findById(job.webhookId);
      if (!webhook) {
        logger.warn('Webhook not found for delivery', { webhookId: job.webhookId });
        return {
          success: false,
          responseTime: Date.now() - startTime,
          error: 'Webhook not found',
          shouldRetry: false
        };
      }

      if (!webhook.isActive) {
        logger.info('Webhook is inactive, skipping delivery', { webhookId: job.webhookId });
        return {
          success: false,
          responseTime: Date.now() - startTime,
          error: 'Webhook is inactive',
          shouldRetry: false
        };
      }

      // Check if webhook is configured for this event type
      if (!webhook.eventTypes.includes(job.eventType)) {
        logger.info('Webhook not configured for event type', {
          webhookId: job.webhookId,
          eventType: job.eventType
        });
        return {
          success: false,
          responseTime: Date.now() - startTime,
          error: 'Webhook not configured for this event type',
          shouldRetry: false
        };
      }

      // Prepare payload
      const payload = JSON.stringify({
        ...job.payload,
        eventType: job.eventType,
        timestamp: new Date().toISOString(),
        attempt: job.attempt
      });

      // Generate HMAC signature
      const signature = webhook.generateSignature(payload);

      // Make HTTP request
      const response: AxiosResponse = await axios.post(webhook.url, JSON.parse(payload), {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': job.eventType,
          'X-Webhook-Attempt': job.attempt.toString(),
          'User-Agent': 'WhatsApp-Integration-Webhook/1.0'
        },
        timeout: 30000, // 30 second timeout
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      });

      const responseTime = Date.now() - startTime;
      const success = response.status >= 200 && response.status < 300;

      // Record delivery attempt
      const deliveryAttempt: DeliveryAttempt = {
        timestamp: new Date(),
        success,
        responseCode: response.status,
        responseTime,
        retryCount: job.attempt - 1
      };

      await webhook.recordDelivery(deliveryAttempt);

      logger.info('Webhook delivered', {
        webhookId: job.webhookId,
        eventType: job.eventType,
        responseCode: response.status,
        responseTime,
        success
      });

      return {
        success,
        responseCode: response.status,
        responseTime,
        shouldRetry: !success && response.status >= 500 // Retry on 5xx errors
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      const responseCode = error.response?.status;

      // Record failed delivery attempt
      try {
        const webhook = await Webhook.findById(job.webhookId);
        if (webhook) {
          const deliveryAttempt: DeliveryAttempt = {
            timestamp: new Date(),
            success: false,
            responseCode,
            responseTime,
            error: errorMessage,
            retryCount: job.attempt - 1
          };

          await webhook.recordDelivery(deliveryAttempt);
        }
      } catch (recordError) {
        logger.error('Failed to record delivery attempt', {
          webhookId: job.webhookId,
          error: recordError instanceof Error ? recordError.message : 'Unknown error'
        });
      }

      logger.error('Webhook delivery failed', {
        webhookId: job.webhookId,
        eventType: job.eventType,
        error: errorMessage,
        responseCode,
        responseTime
      });

      return {
        success: false,
        responseCode,
        responseTime,
        error: errorMessage,
        shouldRetry: !responseCode || responseCode >= 500 // Retry on network errors or 5xx
      };
    }
  }

  /**
   * Schedule retry with exponential backoff
   */
  private async scheduleRetry(job: WebhookDeliveryJob): Promise<void> {
    const retryJob: WebhookDeliveryJob = {
      ...job,
      attempt: job.attempt + 1,
      scheduledAt: new Date(Date.now() + this.calculateBackoffDelay(job.attempt))
    };

    const jobData = JSON.stringify(retryJob);
    const score = retryJob.scheduledAt.getTime();

    await this.redis.zadd(this.retryQueueKey, score, jobData);

    logger.info('Webhook delivery scheduled for retry', {
      webhookId: job.webhookId,
      attempt: retryJob.attempt,
      scheduledAt: retryJob.scheduledAt
    });
  }

  /**
   * Move failed job to dead letter queue
   */
  private async moveToDeadLetterQueue(job: WebhookDeliveryJob, error?: string): Promise<void> {
    const deadJob = {
      ...job,
      failedAt: new Date(),
      finalError: error
    };

    await this.redis.lpush(this.deadLetterQueueKey, JSON.stringify(deadJob));

    logger.warn('Webhook delivery moved to dead letter queue', {
      webhookId: job.webhookId,
      eventType: job.eventType,
      attempts: job.attempt,
      error
    });
  }

  /**
   * Process retry queue (jobs scheduled for later)
   */
  async processRetryQueue(): Promise<void> {
    const now = Date.now();
    
    // Get jobs that are ready to retry (score <= current time)
    const jobs = await this.redis.zrangebyscore(this.retryQueueKey, 0, now, 'LIMIT', 0, 10);

    for (const jobData of jobs) {
      // Remove from retry queue and add to main queue
      const removed = await this.redis.zrem(this.retryQueueKey, jobData);
      if (removed > 0) {
        await this.redis.zadd(this.queueKey, 0, jobData); // Add with normal priority
      }
    }

    if (jobs.length > 0) {
      logger.info('Moved retry jobs to main queue', { count: jobs.length });
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number): number {
    // Base delay: 1 second, max delay: 5 minutes
    const baseDelay = 1000; // 1 second
    const maxDelay = 5 * 60 * 1000; // 5 minutes
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    
    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    retrying: number;
    deadLetter: number;
  }> {
    const [pending, processing, retrying, deadLetter] = await Promise.all([
      this.redis.zcard(this.queueKey),
      this.redis.scard(this.processingKey),
      this.redis.zcard(this.retryQueueKey),
      this.redis.llen(this.deadLetterQueueKey)
    ]);

    return { pending, processing, retrying, deadLetter };
  }

  /**
   * Retry failed webhooks from dead letter queue
   */
  async retryDeadLetterJobs(webhookId?: string, limit: number = 10): Promise<number> {
    const jobs = await this.redis.lrange(this.deadLetterQueueKey, 0, limit - 1);
    let retriedCount = 0;

    for (const jobData of jobs) {
      try {
        const job = JSON.parse(jobData);
        
        // If webhookId is specified, only retry jobs for that webhook
        if (webhookId && job.webhookId !== webhookId) {
          continue;
        }

        // Reset attempt count and schedule for immediate processing
        const retryJob: WebhookDeliveryJob = {
          ...job,
          attempt: 1,
          scheduledAt: new Date()
        };

        await this.redis.zadd(this.queueKey, 0, JSON.stringify(retryJob));
        await this.redis.lrem(this.deadLetterQueueKey, 1, jobData);
        
        retriedCount++;
      } catch (error) {
        logger.error('Failed to parse dead letter job', { jobData });
      }
    }

    if (retriedCount > 0) {
      logger.info('Retried dead letter jobs', { count: retriedCount, webhookId });
    }

    return retriedCount;
  }

  /**
   * Clear old jobs from dead letter queue
   */
  async cleanupDeadLetterQueue(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const jobs = await this.redis.lrange(this.deadLetterQueueKey, 0, -1);
    const cutoffTime = Date.now() - maxAge;
    let removedCount = 0;

    for (const jobData of jobs) {
      try {
        const job = JSON.parse(jobData);
        const failedAt = new Date(job.failedAt).getTime();
        
        if (failedAt < cutoffTime) {
          await this.redis.lrem(this.deadLetterQueueKey, 1, jobData);
          removedCount++;
        }
      } catch (error) {
        // Remove malformed jobs
        await this.redis.lrem(this.deadLetterQueueKey, 1, jobData);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info('Cleaned up old dead letter jobs', { count: removedCount });
    }

    return removedCount;
  }
}

// Export singleton instance
let webhookDeliveryService: WebhookDeliveryService | null = null;

export const getWebhookDeliveryService = (redis: Redis): WebhookDeliveryService => {
  if (!webhookDeliveryService) {
    webhookDeliveryService = new WebhookDeliveryService(redis);
  }
  return webhookDeliveryService;
};