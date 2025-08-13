// TEMPORARILY DISABLED - Redis dependency issues
// This file is commented out to prevent TypeScript compilation errors
// during WhatsApp integration testing

import { logger } from '../utils/logger';

// Webhook service is temporarily disabled
export class WebhookService {
  static async processWebhookDelivery(job: any): Promise<void> {
    logger.info('Webhook service is temporarily disabled');
  }

  static async scheduleWebhookDelivery(webhookId: string, eventType: string, payload: any): Promise<void> {
    logger.info('Webhook delivery scheduling is temporarily disabled');
  }
}