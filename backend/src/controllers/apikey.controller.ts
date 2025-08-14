import { Request, Response } from 'express';
import { APIKey } from '../models/APIKey.model';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { APIKeyPermission } from '../types/database.types';

// Validation schemas
const createAPIKeySchema = z.object({
  label: z.string().min(1, 'Label is required').max(50, 'Label too long').optional(),
  permissions: z.array(z.nativeEnum(APIKeyPermission)).optional()
});

const updateAPIKeySchema = z.object({
  label: z.string().min(1, 'Label is required').max(50, 'Label too long').optional()
});

export class APIKeyController {
  /**
   * Get all API keys for the authenticated user
   */
  static async getAPIKeys(req: Request, res: Response): Promise<void> {
    try {
      const includeRevoked = req.query.includeRevoked === 'true';
      const apiKeys = await APIKey.getUserAPIKeys(req.user!.userId, includeRevoked);
      
      // Transform for response (mask keys and add usage info)
      const transformedKeys = apiKeys.map(key => ({
        id: key._id,
        label: key.label,
        keyPrefix: key.keyPrefix,
        maskedKey: key.maskAPIKey(),
        permissions: key.permissions,
        usageCount: key.usageCount,
        lastUsedAt: key.lastUsedAt,
        lastUsedIP: key.lastUsedIP,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
        isRevoked: key.isRevoked(),
        revokedAt: key.revokedAt
      }));
      
      res.json({
        success: true,
        data: {
          apiKeys: transformedKeys,
          total: transformedKeys.length
        }
      });
      
    } catch (error) {
      logger.error('Get API keys error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve API keys',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Create a new API key
   */
  static async createAPIKey(req: Request, res: Response): Promise<void> {
    try {
      const validation = createAPIKeySchema.safeParse(req.body);
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
      
      const { label, permissions } = validation.data;
      
      // Generate API key
      const { apiKey, rawKey } = await APIKey.generateAPIKey(req.user!.userId, {
        label,
        permissions
      });
      
      logger.info(`API key created for user: ${req.user!.userId}`, {
        keyId: apiKey._id,
        label: apiKey.label,
        permissions: apiKey.permissions
      });
      
      res.status(201).json({
        success: true,
        data: {
          apiKey: {
            id: apiKey._id,
            label: apiKey.label,
            keyPrefix: apiKey.keyPrefix,
            permissions: apiKey.permissions,
            createdAt: apiKey.createdAt
          },
          rawKey, // Only returned once during creation
          warning: 'Store this API key securely. It will not be shown again.'
        }
      });
      
    } catch (error) {
      logger.error('Create API key error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to create API key',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Get API key details and usage statistics
   */
  static async getAPIKey(req: Request, res: Response): Promise<void> {
    try {
      const { keyId } = req.params;
      
      // Get API key
      const apiKeys = await APIKey.getUserAPIKeys(req.user!.userId, true);
      const apiKey = apiKeys.find(key => key._id.toString() === keyId);
      
      if (!apiKey) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Get usage statistics
      const stats = await APIKey.getUsageStatistics(keyId, req.user!.userId);
      
      res.json({
        success: true,
        data: {
          apiKey: {
            id: apiKey._id,
            label: apiKey.label,
            keyPrefix: apiKey.keyPrefix,
            maskedKey: apiKey.maskAPIKey(),
            permissions: apiKey.permissions,
            lastUsedAt: apiKey.lastUsedAt,
            lastUsedIP: apiKey.lastUsedIP,
            createdAt: apiKey.createdAt,
            updatedAt: apiKey.updatedAt,
            isRevoked: apiKey.isRevoked(),
            revokedAt: apiKey.revokedAt
          },
          statistics: stats
        }
      });
      
    } catch (error) {
      logger.error('Get API key error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve API key',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Update API key (label only)
   */
  static async updateAPIKey(req: Request, res: Response): Promise<void> {
    try {
      const { keyId } = req.params;
      const validation = updateAPIKeySchema.safeParse(req.body);
      
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
      
      const { label } = validation.data;
      
      // Find and update API key
      const apiKey = await APIKey.findOneAndUpdate(
        {
          _id: keyId,
          userId: req.user!.userId,
          revokedAt: { $exists: false }
        },
        { $set: { label } },
        { new: true }
      );
      
      if (!apiKey) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      logger.info(`API key updated: ${keyId}`, { label });
      
      res.json({
        success: true,
        data: {
          apiKey: {
            id: apiKey._id,
            label: apiKey.label,
            keyPrefix: apiKey.keyPrefix,
            maskedKey: apiKey.maskAPIKey(),
            permissions: apiKey.permissions,
            updatedAt: apiKey.updatedAt
          }
        }
      });
      
    } catch (error) {
      logger.error('Update API key error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to update API key',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Revoke API key
   */
  static async revokeAPIKey(req: Request, res: Response): Promise<void> {
    try {
      const { keyId } = req.params;
      
      const apiKey = await APIKey.revokeAPIKey(keyId, req.user!.userId);
      
      if (!apiKey) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      logger.info(`API key revoked: ${keyId}`, {
        userId: req.user!.userId,
        label: apiKey.label
      });
      
      res.json({
        success: true,
        message: 'API key revoked successfully',
        data: {
          apiKey: {
            id: apiKey._id,
            label: apiKey.label,
            revokedAt: apiKey.revokedAt
          }
        }
      });
      
    } catch (error) {
      logger.error('Revoke API key error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to revoke API key',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Rotate API key (generate new key with grace period)
   */
  static async rotateAPIKey(req: Request, res: Response): Promise<void> {
    try {
      const { keyId } = req.params;
      const gracePeriodHours = parseInt(req.body.gracePeriodHours) || 24;
      
      if (gracePeriodHours < 1 || gracePeriodHours > 168) { // Max 7 days
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Grace period must be between 1 and 168 hours',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const result = await APIKey.rotateAPIKey(keyId, req.user!.userId, gracePeriodHours);
      
      logger.info(`API key rotated: ${keyId}`, {
        userId: req.user!.userId,
        newKeyId: result.newKey._id,
        gracePeriodHours
      });
      
      res.json({
        success: true,
        data: {
          newKey: {
            id: result.newKey._id,
            label: result.newKey.label,
            keyPrefix: result.newKey.keyPrefix,
            permissions: result.newKey.permissions,
            createdAt: result.newKey.createdAt
          },
          rawKey: result.rawKey, // Only returned once
          oldKey: {
            id: result.oldKey._id,
            revokedAt: result.oldKey.revokedAt,
            gracePeriodEnds: result.oldKey.revokedAt
          },
          warning: 'Store the new API key securely. The old key will be revoked after the grace period.'
        }
      });
      
    } catch (error: any) {
      logger.error('Rotate API key error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to rotate API key',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Get API key usage analytics
   */
  static async getAPIKeyUsage(req: Request, res: Response): Promise<void> {
    try {
      const { keyId } = req.params;
      
      const stats = await APIKey.getUsageStatistics(keyId, req.user!.userId);
      
      // Additional analytics could be added here
      // For now, return basic statistics
      res.json({
        success: true,
        data: {
          statistics: {
            ...stats,
            averageRequestsPerDay: stats.totalRequests / Math.max(1, 
              Math.ceil((Date.now() - stats.createdAt.getTime()) / (1000 * 60 * 60 * 24))
            )
          }
        }
      });
      
    } catch (error: any) {
      logger.error('Get API key usage error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to retrieve usage statistics',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }

  /**
   * Reveal full API key (for authorized users only)
   */
  static async revealAPIKey(req: Request, res: Response): Promise<void> {
    try {
      const { keyId } = req.params;

      // Find the API key
      const apiKey = await APIKey.findOne({
        _id: keyId,
        userId: req.user!.userId,
        revokedAt: { $exists: false }
      });

      if (!apiKey) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      // Log the reveal action for security
      logger.warn(`API key revealed: ${keyId}`, {
        userId: req.user!.userId,
        keyLabel: apiKey.label,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Check if the API key has an encrypted version
      if (!apiKey.encryptedKey) {
        res.status(400).json({
          error: {
            code: 'LEGACY_API_KEY',
            message: 'This API key was created before the reveal feature was available. Please create a new API key to use the reveal functionality.',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }

      // Decrypt and return the full API key
      const { decryptAPIKey } = await import('../models/APIKey.model');
      const fullKey = decryptAPIKey(apiKey.encryptedKey);

      res.json({
        success: true,
        data: {
          key: fullKey, // Full decrypted API key
          label: apiKey.label,
          keyId: apiKey._id,
          warning: 'Keep this API key secure. Do not share it publicly.'
        }
      });

    } catch (error) {
      logger.error('Reveal API key error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to reveal API key',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
}