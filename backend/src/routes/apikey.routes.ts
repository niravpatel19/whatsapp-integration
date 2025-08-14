import { Router } from 'express';
import { APIKeyController } from '../controllers/apikey.controller';
import { authenticate, requireUser } from '../middleware/auth.middleware';
import { createRateLimiter } from '../middleware/rateLimit.middleware.stub';
const rateLimitMiddleware = createRateLimiter;

const router = Router();

// All API key routes require authentication
router.use(authenticate);
router.use(requireUser);

// Get all API keys for user
router.get('/', APIKeyController.getAPIKeys);

// Create new API key (rate limited)
router.post('/', rateLimitMiddleware('apikey-create', 5, 60 * 60), APIKeyController.createAPIKey);

// Get specific API key details
router.get('/:keyId', APIKeyController.getAPIKey);

// Update API key (label only)
router.put('/:keyId', APIKeyController.updateAPIKey);

// Revoke API key
router.delete('/:keyId', APIKeyController.revokeAPIKey);

// Rotate API key (rate limited)
router.post('/:keyId/rotate', rateLimitMiddleware('apikey-rotate', 3, 60 * 60), APIKeyController.rotateAPIKey);

// Get API key usage statistics
router.get('/:keyId/usage', APIKeyController.getAPIKeyUsage);

// Reveal full API key (rate limited for security)
router.get('/:keyId/reveal', rateLimitMiddleware('apikey-reveal', 10, 60 * 60), APIKeyController.revealAPIKey);

export default router;