import Redis from 'ioredis';
import { getWebhookDeliveryService, WebhookDeliveryService } from '../services/webhook.service';
import { logger } from '../utils/logger';

export class WebhookWorker {
  private redis: Redis;
  private webhookService: WebhookDeliveryService;
  private isRunning: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private retryInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(redis: Redis) {
    this.redis = redis;
    this.webhookService = getWebhookDeliveryService(redis);
  }

  /**
   * Start the webhook worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Webhook worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting webhook worker');

    // Process main queue every 1 second
    this.processingInterval = setInterval(async () => {
      try {
        await this.webhookService.processQueue();
      } catch (error) {
        logger.error('Error in webhook queue processing', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 1000);

    // Process retry queue every 30 seconds
    this.retryInterval = setInterval(async () => {
      try {
        await this.webhookService.processRetryQueue();
      } catch (error) {
        logger.error('Error in webhook retry queue processing', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 30000);

    // Cleanup dead letter queue every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        const removedCount = await this.webhookService.cleanupDeadLetterQueue();
        if (removedCount > 0) {
          logger.info('Cleaned up dead letter queue', { removedCount });
        }
      } catch (error) {
        logger.error('Error in webhook dead letter queue cleanup', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 60 * 60 * 1000); // 1 hour

    logger.info('Webhook worker started successfully');
  }

  /**
   * Stop the webhook worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Webhook worker is not running');
      return;
    }

    logger.info('Stopping webhook worker');
    this.isRunning = false;

    // Clear intervals
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Wait a bit for any ongoing processing to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('Webhook worker stopped successfully');
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean;
    hasProcessingInterval: boolean;
    hasRetryInterval: boolean;
    hasCleanupInterval: boolean;
  } {
    return {
      isRunning: this.isRunning,
      hasProcessingInterval: this.processingInterval !== null,
      hasRetryInterval: this.retryInterval !== null,
      hasCleanupInterval: this.cleanupInterval !== null
    };
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    return await this.webhookService.getQueueStats();
  }

  /**
   * Manually process a single job (for testing)
   */
  async processSingleJob(): Promise<boolean> {
    try {
      await this.webhookService.processQueue();
      return true;
    } catch (error) {
      logger.error('Error processing single webhook job', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Retry failed webhooks
   */
  async retryFailedWebhooks(webhookId?: string, limit: number = 10): Promise<number> {
    return await this.webhookService.retryDeadLetterJobs(webhookId, limit);
  }
}

// Export singleton instance
let webhookWorker: WebhookWorker | null = null;

export const getWebhookWorker = (redis: Redis): WebhookWorker => {
  if (!webhookWorker) {
    webhookWorker = new WebhookWorker(redis);
  }
  return webhookWorker;
};

// Graceful shutdown handler
export const setupWebhookWorkerShutdown = (worker: WebhookWorker): void => {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down webhook worker gracefully`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};