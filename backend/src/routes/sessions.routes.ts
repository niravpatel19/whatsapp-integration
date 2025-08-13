import { Router } from 'express';
import { SessionsController } from '../controllers/sessions.controller';
import { authenticate, requireUser } from '../middleware/auth.middleware';
import { createRateLimiter } from '../middleware/rateLimit.middleware.stub';
const rateLimitMiddleware = createRateLimiter;

const router = Router();

// All session routes require authentication
router.use(authenticate);
router.use(requireUser);

// Get all sessions for user
router.get('/', SessionsController.getSessions);

// Create new session (rate limited)
router.post('/', rateLimitMiddleware('session-create', 5, 60 * 60), SessionsController.createSession);

// Get specific session details
router.get('/:sessionId', SessionsController.getSession);

// Update session configuration
router.put('/:sessionId', SessionsController.updateSession);

// Delete session
router.delete('/:sessionId', SessionsController.deleteSession);

// Refresh QR code (rate limited)
router.post('/:sessionId/refresh-qr', rateLimitMiddleware('qr-refresh', 10, 60 * 60), SessionsController.refreshQR);

// Get current QR code
router.get('/:sessionId/qr', SessionsController.getQR);

// Get session events
router.get('/:sessionId/events', SessionsController.getSessionEvents);

// Force session reconnection (rate limited)
router.post('/:sessionId/reconnect', rateLimitMiddleware('session-reconnect', 3, 60 * 60), SessionsController.reconnectSession);

// Get session statistics
router.get('/:sessionId/stats', SessionsController.getSessionStats);

export default router;