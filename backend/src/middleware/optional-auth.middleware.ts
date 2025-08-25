import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { logger } from '../utils/logger';

/**
 * Optional authentication middleware
 * If no user is authenticated, provides a default user for simple usage
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  // If user is already authenticated, continue
  if (req.user && req.user.userId) {
    next();
    return;
  }

  // If no authentication, provide a default user
  const defaultUserId = '000000000000000000000001'; // Fixed default user ID

  req.user = {
    userId: defaultUserId,
    email: 'default@whatsapp-integration.local',
    permissions: ['user'],
  };

  logger.debug('Using default user for unauthenticated request');
  next();
};

/**
 * Get user ID from request (authenticated or default)
 */
export const getUserId = (req: Request): string => {
  return req.user?.userId || '000000000000000000000001';
};

/**
 * Get user ID as ObjectId from request (authenticated or default)
 */
export const getUserObjectId = (req: Request): Types.ObjectId => {
  const userId = getUserId(req);
  return new Types.ObjectId(userId);
};
