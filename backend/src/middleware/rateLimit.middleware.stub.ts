// Temporary stub for rate limiting middleware to avoid TypeScript compilation errors
import { Request, Response, NextFunction } from 'express';

// Simple pass-through middleware for development
export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  next();
};

export const authRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  next();
};

export const messageRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  next();
};

export const sessionRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  next();
};

export const createRateLimiter = (type: string, windowMs: number, maxRequests: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    next();
  };
};