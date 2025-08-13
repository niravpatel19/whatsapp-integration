import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/audit.service';
import { AuditAction } from '../types/database.types';

// Extend Request interface to include audit context
declare global {
  namespace Express {
    interface Request {
      auditContext?: {
        action?: AuditAction;
        targetType?: string;
        targetId?: string;
        metadata?: Record<string, any>;
      };
    }
  }
}

/**
 * Middleware to automatically log audit events after successful requests
 */
export const auditMiddleware = (
  action: AuditAction,
  targetType: string,
  options: {
    getTargetId?: (req: Request, res: Response) => string | undefined;
    getMetadata?: (req: Request, res: Response) => Record<string, any> | undefined;
    condition?: (req: Request, res: Response) => boolean;
  } = {}
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original res.json to intercept successful responses
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Only log if response is successful (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Check condition if provided
        if (options.condition && !options.condition(req, res)) {
          return originalJson.call(this, body);
        }
        
        // Extract user information
        const user = (req as any).user;
        if (user) {
          // Get target ID and metadata
          const targetId = options.getTargetId ? options.getTargetId(req, res) : undefined;
          const metadata = options.getMetadata ? options.getMetadata(req, res) : undefined;
          
          // Log audit event asynchronously (don't block response)
          setImmediate(async () => {
            try {
              await AuditService.logAction(
                user.userId,
                user.email || user.apiKeyPrefix || 'Unknown',
                action,
                targetType,
                {
                  targetId,
                  metadata,
                  req
                }
              );
            } catch (error) {
              console.error('Failed to log audit event:', error);
              // Don't throw error to avoid affecting the main request
            }
          });
        }
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
};

/**
 * Middleware to set audit context for manual logging
 */
export const setAuditContext = (
  action: AuditAction,
  targetType: string,
  options: {
    getTargetId?: (req: Request) => string | undefined;
    getMetadata?: (req: Request) => Record<string, any> | undefined;
  } = {}
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    req.auditContext = {
      action,
      targetType,
      targetId: options.getTargetId ? options.getTargetId(req) : undefined,
      metadata: options.getMetadata ? options.getMetadata(req) : undefined
    };
    
    next();
  };
};

/**
 * Helper function to manually log audit event using context
 */
export const logAuditEvent = async (req: Request, customMetadata?: Record<string, any>) => {
  const user = (req as any).user;
  const context = req.auditContext;
  
  if (!user || !context) {
    return;
  }
  
  try {
    await AuditService.logAction(
      user.userId,
      user.email || user.apiKeyPrefix || 'Unknown',
      context.action!,
      context.targetType!,
      {
        targetId: context.targetId,
        metadata: { ...context.metadata, ...customMetadata },
        req
      }
    );
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
};

/**
 * Predefined audit middleware for common actions
 */
export const auditMiddlewares = {
  // User authentication
  login: auditMiddleware(AuditAction.LOGIN, 'User', {
    getTargetId: (req) => (req as any).user?.userId,
    getMetadata: (req, res) => ({
      success: res.statusCode >= 200 && res.statusCode < 300,
      method: 'password'
    })
  }),
  
  logout: auditMiddleware(AuditAction.LOGOUT, 'User', {
    getTargetId: (req) => (req as any).user?.userId
  }),
  
  // API Key management
  apiKeyGenerated: auditMiddleware(AuditAction.API_KEY_GENERATED, 'APIKey', {
    getTargetId: (req, res) => {
      // Extract API key ID from response body
      const body = (res as any).body;
      return body?.data?.keyId;
    },
    getMetadata: (req) => ({
      label: req.body?.label
    })
  }),
  
  // Session management
  sessionCreated: auditMiddleware(AuditAction.SESSION_CREATED, 'Session', {
    getTargetId: (req, res) => {
      // Extract session ID from response body
      const body = (res as any).body;
      return body?.data?.sessionId;
    },
    getMetadata: (req) => ({
      deviceName: req.body?.deviceName
    })
  }),
  
  // Message sending
  messageSent: auditMiddleware(AuditAction.MESSAGE_SENT, 'Message', {
    getTargetId: (req, res) => {
      // Extract message ID from response body
      const body = (res as any).body;
      return body?.data?.messageId;
    },
    getMetadata: (req) => ({
      to: req.body?.to,
      messageType: req.body?.type
    })
  }),
  
  // Generic CRUD operations
  create: (targetType: string, getTargetId?: (req: Request, res: Response) => string | undefined) =>
    auditMiddleware(AuditAction.CREATE, targetType, { getTargetId }),
  
  update: (targetType: string, getTargetId?: (req: Request, res: Response) => string | undefined) =>
    auditMiddleware(AuditAction.UPDATE, targetType, { 
      getTargetId,
      getMetadata: (req) => ({
        changes: req.body
      })
    }),
  
  delete: (targetType: string, getTargetId?: (req: Request, res: Response) => string | undefined) =>
    auditMiddleware(AuditAction.DELETE, targetType, { getTargetId })
};

/**
 * Middleware to log failed authentication attempts
 */
export const auditFailedAuth = (req: Request, res: Response, next: NextFunction) => {
  // Store original res.status to intercept failed auth responses
  const originalStatus = res.status;
  
  res.status = function(code: number) {
    if (code === 401 || code === 403) {
      // Log failed authentication attempt
      setImmediate(async () => {
        try {
          await AuditService.logAction(
            'unknown', // No user ID for failed auth
            req.body?.email || req.headers['x-api-key'] || 'Unknown',
            AuditAction.LOGIN,
            'User',
            {
              metadata: {
                success: false,
                statusCode: code,
                reason: code === 401 ? 'Invalid credentials' : 'Access denied'
              },
              req
            }
          );
        } catch (error) {
          console.error('Failed to log failed auth attempt:', error);
        }
      });
    }
    
    return originalStatus.call(this, code);
  };
  
  next();
};