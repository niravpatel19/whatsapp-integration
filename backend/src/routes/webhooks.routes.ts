import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';

const router = Router();

// Apply authentication middleware to all webhook routes
router.use(authenticate);

// Apply rate limiting
router.use(rateLimitMiddleware('webhook', 100, 15 * 60)); // 100 requests per 15 minutes

// Get available event types (no auth required for this endpoint)
router.get('/event-types', WebhookController.getEventTypes);

// Get all webhooks for the authenticated user
router.get('/', WebhookController.getWebhooks);

// Create a new webhook
router.post('/', WebhookController.createWebhook);

// Get a specific webhook
router.get('/:webhookId', WebhookController.getWebhook);

// Update a webhook
router.put('/:webhookId', WebhookController.updateWebhook);

// Delete a webhook
router.delete('/:webhookId', WebhookController.deleteWebhook);

// Test a webhook
router.post('/:webhookId/test', WebhookController.testWebhook);

// Get webhook delivery logs
router.get('/:webhookId/logs', WebhookController.getWebhookLogs);

// Retry failed webhook deliveries
router.post('/:webhookId/retry', WebhookController.retryWebhook);

export default router;