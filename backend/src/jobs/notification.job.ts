import cron from 'node-cron';
import { notificationService } from '../services/notification.service';
import { Notification } from '../models/Notification.model';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';

export class NotificationJob {
  private static isRunning = false;

  /**
   * Start notification processing jobs
   */
  static start(): void {
    // Process pending notifications every 2 minutes
    cron.schedule('*/2 * * * *', async () => {
      if (this.isRunning) {
        logger.debug('Notification job already running, skipping...');
        return;
      }

      this.isRunning = true;
      try {
        await notificationService.processPendingNotifications();
      } catch (error) {
        logger.error('Notification processing job failed:', error);
      } finally {
        this.isRunning = false;
      }
    });

    // Cleanup old notifications daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        const deletedCount = await Notification.cleanupOldNotifications(30);
        if (deletedCount > 0) {
          logger.info(`Cleaned up ${deletedCount} old notifications`);
        }
      } catch (error) {
        logger.error('Notification cleanup job failed:', error);
      }
    });

    // Test email connection daily at 1 AM
    cron.schedule('0 1 * * *', async () => {
      try {
        const isConnected = await emailService.testConnection();
        if (!isConnected) {
          logger.warn('Email service connection test failed');
        } else {
          logger.info('Email service connection test successful');
        }
      } catch (error) {
        logger.error('Email connection test failed:', error);
      }
    });

    logger.info('Notification jobs started successfully');
  }

  /**
   * Process notifications immediately (for manual trigger)
   */
  static async processNow(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Notification job already running');
      return;
    }

    this.isRunning = true;
    try {
      await notificationService.processPendingNotifications();
      logger.info('Manual notification processing completed');
    } catch (error) {
      logger.error('Manual notification processing failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get job status
   */
  static getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}