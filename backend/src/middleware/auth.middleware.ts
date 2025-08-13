import { Request, Response, NextFunction } from 'express';
import { AuthService, UserContext } from '../services/auth.service';
import { APIKey } from '../models/APIKey.model';
import { logger } from '../utils/logger';

// Extend Express Request interface to include user context
declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
      apiKey?: {
        keyId: string;
        userId: string;
        label?: string;
        lastUsedAt: Date;
      };
    }
  }
}

/**
 * JWT Authentication Middleware
 * Validates JWT tokens from Authorization header or cookies
 */
export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;
    
    // Try to get token from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // Try to get token from cookies if not in header
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    
    if (!token) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Access token required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    
    // Validate token
    const userContext = await AuthService.validateJWT(token);
    if (!userContext) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    
    // Attach user context to request
    req.user = userContext;
    next();
    
  } catch (error) {
    logger.error('JWT authentication error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL',
        message: 'Authentication service error',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
  }
};

/**
 * API Key Authentication Middleware
 * Validates API keys from x-api-key header
 */
export const authenticateAPIKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    
    // Validate API key
    const keyData = await APIKey.validateAPIKey(apiKey);
    if (!keyData) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    
    // Update last used timestamp
    await APIKey.updateLastUsed(keyData._id.toString());
    
    // Attach API key context to request
    req.apiKey = {
      keyId: keyData._id.toString(),
      userId: keyData.userId.toString(),
      label: keyData.label,
      lastUsedAt: new Date()
    };
    
    // Also set user context for consistency
    req.user = {
      userId: keyData.userId.toString(),
      email: '', // Will be populated if needed
      permissions: ['api'] // API key permissions
    };
    
    next();
    
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL',
        message: 'Authentication service error',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
  }
};

/**
 * Flexible Authentication Middleware
 * Accepts either JWT or API key authentication
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Check for API key first
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    return authenticateAPIKey(req, res, next);
  }
  
  // Fall back to JWT authentication
  return authenticateJWT(req, res, next);
};

/**
 * Optional Authentication Middleware
 * Attaches user context if token is present, but doesn't require it
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Try API key first
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      const keyData = await APIKey.validateAPIKey(apiKey);
      if (keyData) {
        await APIKey.updateLastUsed(keyData._id.toString());
        req.apiKey = {
          keyId: keyData._id.toString(),
          userId: keyData.userId.toString(),
          label: keyData.label,
          lastUsedAt: new Date()
        };
        req.user = {
          userId: keyData.userId.toString(),
          email: '',
          permissions: ['api']
        };
      }
    } else {
      // Try JWT token
      let token: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (req.cookies?.accessToken) {
        token = req.cookies.accessToken;
      }
      
      if (token) {
        const userContext = await AuthService.validateJWT(token);
        if (userContext) {
          req.user = userContext;
        }
      }
    }
    
    next();
    
  } catch (error) {
    logger.error('Optional authentication error:', error);
    // Continue without authentication on error
    next();
  }
};

/**
 * Permission Check Middleware
 * Requires specific permissions to access endpoint
 */
export const requirePermissions = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    
    const userPermissions = req.user.permissions || [];
    const hasPermission = permissions.some(permission => 
      userPermissions.includes(permission) || userPermissions.includes('admin')
    );
    
    if (!hasPermission) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
      return;
    }
    
    next();
  };
};

/**
 * User Context Middleware
 * Ensures user context is available (for authenticated routes)
 */
export const requireUser = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user?.userId) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User authentication required',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      }
    });
    return;
  }
  
  next();
};