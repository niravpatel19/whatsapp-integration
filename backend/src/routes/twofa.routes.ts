import { Router } from 'express';
import { TwoFAController } from '../controllers/twofa.controller';
import { authenticate, requireUser } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';

const router = Router();

// All 2FA routes require authentication
router.use(authenticate);
router.use(requireUser);

// Get 2FA status
router.get('/status', TwoFAController.getStatus);

// Setup 2FA (rate limited)
router.post('/setup', rateLimitMiddleware('2fa-setup', 3, 60 * 60), TwoFAController.setup);

// Verify 2FA setup and enable it (rate limited)
router.post('/verify-setup', rateLimitMiddleware('2fa-verify', 5, 60 * 60), TwoFAController.verifySetup);

// Disable 2FA (rate limited)
router.post('/disable', rateLimitMiddleware('2fa-disable', 3, 60 * 60), TwoFAController.disable);

// Verify TOTP token (rate limited)
router.post('/verify', rateLimitMiddleware('2fa-verify-token', 10, 60 * 60), TwoFAController.verify);

// Generate new backup codes (rate limited)
router.post('/backup-codes', rateLimitMiddleware('2fa-backup', 2, 24 * 60 * 60), TwoFAController.generateBackupCodes);

// Recover using backup code (rate limited)
router.post('/recover', rateLimitMiddleware('2fa-recover', 5, 60 * 60), TwoFAController.recoverWithBackup);

export default router;