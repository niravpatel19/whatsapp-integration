import { Router } from 'express';
import { MessagesController } from '../controllers/messages.controller';
import { authenticate, requireUser } from '../middleware/auth.middleware';
import { createRateLimiter } from '../middleware/rateLimit.middleware.stub';
const rateLimitMiddleware = createRateLimiter;

const router = Router();

// All message routes require authentication
router.use(authenticate);
router.use(requireUser);

// Send message (rate limited)
router.post('/send', rateLimitMiddleware('message-send', 30, 60), MessagesController.sendMessage);

// Get message history with filtering
router.get('/', MessagesController.getMessages);

// Get message templates
router.get('/templates', MessagesController.getMessageTemplates);

// Get messaging statistics
router.get('/stats', MessagesController.getMessageStats);

// Bulk send messages (heavily rate limited)
router.post('/bulk-send', rateLimitMiddleware('bulk-send', 5, 60 * 60), MessagesController.bulkSendMessages);

// Get specific message details
router.get('/:messageId', MessagesController.getMessage);

// Update message status (for webhooks)
router.put('/:messageId/status', MessagesController.updateMessageStatus);

// Delete message (soft delete)
router.delete('/:messageId', MessagesController.deleteMessage);

export default router;