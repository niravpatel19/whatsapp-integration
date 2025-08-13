import { Socket } from 'socket.io';
import { AuthService } from '../services/auth.service';
import { APIKey } from '../models/APIKey.model';
import { logger } from '../utils/logger';

// Extend Socket interface to include user context
export interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    email?: string;
    permissions?: string[];
  };
  apiKey?: {
    keyId: string;
    userId: string;
    label?: string;
    lastUsedAt: Date;
  };
}

/**
 * Socket.IO authentication middleware
 * Validates JWT tokens or API keys from the auth object
 */
export const socketAuthMiddleware = async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  try {
    const auth = socket.handshake.auth;
    
    // Try API key authentication first
    if (auth.apiKey) {
      try {
        const keyData = await APIKey.validateAPIKey(auth.apiKey);
        if (keyData) {
          // Update last used timestamp
          await APIKey.updateLastUsed(keyData._id.toString());
          
          // Set API key context
          socket.apiKey = {
            keyId: keyData._id.toString(),
            userId: keyData.userId.toString(),
            label: keyData.label,
            lastUsedAt: new Date()
          };
          
          // Set user context for consistency
          socket.user = {
            userId: keyData.userId.toString(),
            email: '', // Will be populated if needed
            permissions: ['api'] // API key permissions
          };
          
          logger.info('Socket.IO API key authentication successful', {
            socketId: socket.id,
            userId: socket.user.userId,
            keyLabel: keyData.label
          });
          
          return next();
        }
      } catch (error) {
        logger.error('Socket.IO API key authentication error:', error);
      }
    }
    
    // Try JWT token authentication
    if (auth.token) {
      try {
        const userContext = await AuthService.validateJWT(auth.token);
        if (userContext) {
          socket.user = userContext;
          
          logger.info('Socket.IO JWT authentication successful', {
            socketId: socket.id,
            userId: socket.user.userId,
            email: socket.user.email
          });
          
          return next();
        }
      } catch (error) {
        logger.error('Socket.IO JWT authentication error:', error);
      }
    }
    
    // No valid authentication found
    logger.warn('Socket.IO authentication failed - no valid credentials', {
      socketId: socket.id,
      hasApiKey: !!auth.apiKey,
      hasToken: !!auth.token
    });
    
    const authError = new Error('Authentication required');
    authError.name = 'AuthenticationError';
    next(authError);
    
  } catch (error) {
    logger.error('Socket.IO authentication middleware error:', error);
    const authError = new Error('Authentication service error');
    authError.name = 'AuthenticationError';
    next(authError);
  }
};

/**
 * Optional Socket.IO authentication middleware
 * Attaches user context if credentials are present, but doesn't require them
 */
export const socketOptionalAuthMiddleware = async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  try {
    const auth = socket.handshake.auth;
    
    // Try API key authentication first
    if (auth.apiKey) {
      try {
        const keyData = await APIKey.validateAPIKey(auth.apiKey);
        if (keyData) {
          await APIKey.updateLastUsed(keyData._id.toString());
          socket.apiKey = {
            keyId: keyData._id.toString(),
            userId: keyData.userId.toString(),
            label: keyData.label,
            lastUsedAt: new Date()
          };
          socket.user = {
            userId: keyData.userId.toString(),
            email: '',
            permissions: ['api']
          };
          
          logger.info('Socket.IO optional API key authentication successful', {
            socketId: socket.id,
            userId: socket.user.userId
          });
        }
      } catch (error) {
        logger.warn('Socket.IO optional API key authentication failed:', error);
      }
    }
    
    // Try JWT token authentication if no API key worked
    if (!socket.user && auth.token) {
      try {
        const userContext = await AuthService.validateJWT(auth.token);
        if (userContext) {
          socket.user = userContext;
          
          logger.info('Socket.IO optional JWT authentication successful', {
            socketId: socket.id,
            userId: socket.user.userId
          });
        }
      } catch (error) {
        logger.warn('Socket.IO optional JWT authentication failed:', error);
      }
    }
    
    // Continue regardless of authentication status
    next();
    
  } catch (error) {
    logger.error('Socket.IO optional authentication middleware error:', error);
    // Continue on error for optional auth
    next();
  }
};

/**
 * Check if socket has required permissions
 */
export const requireSocketPermissions = (permissions: string[]) => {
  return (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
    if (!socket.user) {
      const authError = new Error('Authentication required');
      authError.name = 'AuthenticationError';
      return next(authError);
    }
    
    const userPermissions = socket.user.permissions || [];
    const hasPermission = permissions.some(permission => 
      userPermissions.includes(permission) || userPermissions.includes('admin')
    );
    
    if (!hasPermission) {
      const permError = new Error('Insufficient permissions');
      permError.name = 'PermissionError';
      return next(permError);
    }
    
    next();
  };
};