import { Request, Response } from 'express';
import { User } from '../models/User.model';
import { logger } from '../utils/logger';
import { z } from 'zod';
import crypto from 'crypto';
import QRCode from 'qrcode';

// Validation schemas
const setupTwoFASchema = z.object({
  password: z.string().min(1, 'Current password is required')
});

const verifySetupSchema = z.object({
  secret: z.string().min(1, 'Secret is required'),
  token: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d{6}$/, 'TOTP code must be numeric')
});

const disableTwoFASchema = z.object({
  password: z.string().min(1, 'Current password is required'),
  token: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d{6}$/, 'TOTP code must be numeric')
});

const verifyTwoFASchema = z.object({
  token: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d{6}$/, 'TOTP code must be numeric')
});

const recoverWithBackupSchema = z.object({
  backupCode: z.string().length(8, 'Backup code must be 8 characters').regex(/^[A-Z0-9]{8}$/, 'Invalid backup code format')
});

// Interface for backup codes
interface BackupCode {
  code: string;
  used: boolean;
  usedAt?: Date;
}

export class TwoFAController {
  /**
   * Get 2FA status for current user
   */
  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const user = await User.findById(req.user!.userId);
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      res.json({
        success: true,
        data: {
          twoFAEnabled: user.twoFAEnabled,
          hasBackupCodes: !!(user as any).backupCodes && (user as any).backupCodes.length > 0
        }
      });
      
    } catch (error) {
      logger.error('Get 2FA status error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to get 2FA status',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Setup 2FA - Generate secret and QR code
   */
  static async setup(req: Request, res: Response): Promise<void> {
    try {
      const validation = setupTwoFASchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const { password } = validation.data;
      
      // Get user and verify password
      const user = await User.findById(req.user!.userId);
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Verify current password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        res.status(400).json({
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Check if 2FA is already enabled
      if (user.twoFAEnabled) {
        res.status(400).json({
          error: {
            code: 'TWO_FA_ALREADY_ENABLED',
            message: 'Two-factor authentication is already enabled',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Generate 2FA secret
      const { secret, qrCodeUrl } = user.generateTwoFASecret();
      
      // Generate QR code image
      const qrCodeImage = await QRCode.toDataURL(qrCodeUrl);
      
      logger.info(`2FA setup initiated for user: ${user.email}`);
      
      res.json({
        success: true,
        data: {
          secret,
          qrCodeUrl,
          qrCodeImage,
          manualEntryKey: secret,
          instructions: 'Scan the QR code with your authenticator app or enter the manual key'
        }
      });
      
    } catch (error) {
      logger.error('2FA setup error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to setup 2FA',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Verify 2FA setup and enable it
   */
  static async verifySetup(req: Request, res: Response): Promise<void> {
    try {
      const validation = verifySetupSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const { secret, token } = validation.data;
      
      // Get user
      const user = await User.findById(req.user!.userId);
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Temporarily set the secret to validate the token
      const originalSecret = user.twoFASecret;
      user.twoFASecret = secret;
      user.twoFAEnabled = true;
      
      // Validate TOTP token
      const isTokenValid = user.validateTOTP(token);
      
      if (!isTokenValid) {
        // Restore original state
        user.twoFASecret = originalSecret;
        user.twoFAEnabled = false;
        
        res.status(400).json({
          error: {
            code: 'INVALID_TOTP',
            message: 'Invalid TOTP code',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodesInternal();
      
      // Enable 2FA and save backup codes
      await User.enableTwoFA(user._id.toString(), secret);
      
      // Store backup codes (in a real implementation, you'd add this to the User model)
      (user as any).backupCodes = backupCodes.map(code => ({
        code,
        used: false
      }));
      await user.save();
      
      logger.info(`2FA enabled for user: ${user.email}`);
      
      res.json({
        success: true,
        data: {
          message: '2FA enabled successfully',
          backupCodes: backupCodes,
          warning: 'Store these backup codes securely. They can be used to recover your account if you lose access to your authenticator app.'
        }
      });
      
    } catch (error) {
      logger.error('2FA verify setup error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to verify 2FA setup',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Disable 2FA
   */
  static async disable(req: Request, res: Response): Promise<void> {
    try {
      const validation = disableTwoFASchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const { password, token } = validation.data;
      
      // Get user
      const user = await User.findById(req.user!.userId).select('+twoFASecret');
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Check if 2FA is enabled
      if (!user.twoFAEnabled) {
        res.status(400).json({
          error: {
            code: 'TWO_FA_NOT_ENABLED',
            message: 'Two-factor authentication is not enabled',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Verify current password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        res.status(400).json({
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Verify TOTP token
      const isTokenValid = user.validateTOTP(token);
      if (!isTokenValid) {
        res.status(400).json({
          error: {
            code: 'INVALID_TOTP',
            message: 'Invalid TOTP code',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Disable 2FA
      await User.disableTwoFA(user._id.toString());
      
      // Clear backup codes
      (user as any).backupCodes = [];
      await user.save();
      
      logger.info(`2FA disabled for user: ${user.email}`);
      
      res.json({
        success: true,
        message: 'Two-factor authentication disabled successfully'
      });
      
    } catch (error) {
      logger.error('2FA disable error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to disable 2FA',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Verify TOTP token (for login)
   */
  static async verify(req: Request, res: Response): Promise<void> {
    try {
      const validation = verifyTwoFASchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const { token } = validation.data;
      
      // Get user
      const user = await User.findById(req.user!.userId).select('+twoFASecret');
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Verify TOTP token
      const isTokenValid = user.validateTOTP(token);
      
      res.json({
        success: true,
        data: {
          valid: isTokenValid
        }
      });
      
    } catch (error) {
      logger.error('2FA verify error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to verify 2FA token',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Generate new backup codes (public route handler)
   */
  static async generateBackupCodes(req: Request, res: Response): Promise<void> {
    try {
      // Get user
      const user = await User.findById(req.user!.userId);
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Check if 2FA is enabled
      if (!user.twoFAEnabled) {
        res.status(400).json({
          error: {
            code: 'TWO_FA_NOT_ENABLED',
            message: 'Two-factor authentication is not enabled',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Generate new backup codes
      const backupCodes = this.generateBackupCodesInternal();
      
      // Store backup codes (replace existing ones)
      (user as any).backupCodes = backupCodes.map(code => ({
        code,
        used: false
      }));
      await user.save();
      
      logger.info(`New backup codes generated for user: ${user.email}`);
      
      res.json({
        success: true,
        data: {
          backupCodes: backupCodes,
          warning: 'Store these backup codes securely. They replace your previous backup codes and can be used to recover your account if you lose access to your authenticator app.'
        }
      });
      
    } catch (error) {
      logger.error('Generate backup codes error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to generate backup codes',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Recover account using backup code
   */
  static async recoverWithBackup(req: Request, res: Response): Promise<void> {
    try {
      const validation = recoverWithBackupSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const { backupCode } = validation.data;
      
      // Get user
      const user = await User.findById(req.user!.userId);
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Check if 2FA is enabled
      if (!user.twoFAEnabled) {
        res.status(400).json({
          error: {
            code: 'TWO_FA_NOT_ENABLED',
            message: 'Two-factor authentication is not enabled',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Find and validate backup code
      const backupCodes = (user as any).backupCodes || [];
      const backupCodeEntry = backupCodes.find((bc: BackupCode) => bc.code === backupCode);
      
      if (!backupCodeEntry) {
        res.status(400).json({
          error: {
            code: 'INVALID_BACKUP_CODE',
            message: 'Invalid backup code',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      if (backupCodeEntry.used) {
        res.status(400).json({
          error: {
            code: 'BACKUP_CODE_USED',
            message: 'Backup code has already been used',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Mark backup code as used
      backupCodeEntry.used = true;
      backupCodeEntry.usedAt = new Date();
      await user.save();
      
      logger.info(`Backup code used for recovery: ${user.email}`);
      
      res.json({
        success: true,
        data: {
          message: 'Account recovery successful using backup code',
          remainingCodes: backupCodes.filter((bc: BackupCode) => !bc.used).length
        }
      });
      
    } catch (error) {
      logger.error('Backup code recovery error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to recover with backup code',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Generate backup codes (static helper method)
   */
  private static generateBackupCodesInternal(): string[] {
    const codes: string[] = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    
    for (let i = 0; i < 10; i++) {
      let code = '';
      for (let j = 0; j < 8; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      codes.push(code);
    }
    
    return codes;
  }
}