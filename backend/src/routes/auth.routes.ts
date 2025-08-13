import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate, requireUser } from '../middleware/auth.middleware';
import { createRateLimiter } from '../middleware/rateLimit.middleware.stub';
const rateLimitMiddleware = createRateLimiter;

const router = Router();

// Public routes (with rate limiting)
router.post('/register', rateLimitMiddleware('auth', 5, 15 * 60), AuthController.register);
router.post('/login', rateLimitMiddleware('auth', 10, 15 * 60), AuthController.login);
router.post('/refresh', rateLimitMiddleware('auth', 20, 15 * 60), AuthController.refresh);

// Protected routes
router.post('/logout', authenticate, AuthController.logout);
router.get('/profile', authenticate, requireUser, AuthController.getProfile);
router.put('/profile', authenticate, requireUser, AuthController.updateProfile);
router.post('/change-password', authenticate, requireUser, AuthController.changePassword);

export default router;