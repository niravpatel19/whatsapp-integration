import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

// Custom rate limit store using Redis
class RedisStore {
  private prefix: string;
  private windowMs: number;

  constructor(windowMs: number, prefix = 'rl:') {
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; timeToExpire?: number }> {
    const redisKey = `${this.prefix}${key}`;
    
    try {
      const current = await redis.incr(redisKey);
      
      if (current === 1) {
        // First request in window, set expiration
        await redis.expire(redisKey, Math.ceil(this.windowMs / 1000));
      }
      
      const ttl = await redis.get(`${redisKey}:ttl`);
      const timeToExpire = ttl ? parseInt(ttl) * 1000 : undefined;
      
      return {
        totalHits: current,
        timeToExpire
      };
    } catch (error) {
      logger.error('Redis rate limit error:', error);
      // Fallback to allowing the request if Redis fails
      return { totalHits: 1 };
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    
    try {
      const current = await redis.get(redisKey);
      if (current && parseInt(current) > 0) {
        await redis.incr(redisKey); // Decrement by incrementing with -1
      }
    } catch (error) {
      logger.error('Redis rate limit decrement error:', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    
    try {
      await redis.del(redisKey);
    } catch (error) {
      logger.error('Redis rate limit reset error:', error);
    }
  }
}

// Key generator function
const keyGenerator = (req: Request): string => {
  // Use API key if present, otherwise use IP
  const apiKey = req.headers['x-api-key'] as string;
  if (apiKey) {
    return `api:${apiKey}`;
  }
  
  return `ip:${req.ip}`;
};

// Rate limit message
const rateLimitMessage = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many requests, please try again later',
    timestamp: new Date().toISOString()
  }
};

// Skip function for health checks
const skipHealthChecks = (req: Request): boolean => {
  return req.path === '/health' || req.path === '/ready';
};

// Default rate limiter
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '60000'), // 1 minute
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '60'), // 60 requests per minute
  message: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  skip: skipHealthChecks,
  // store: new RedisStore(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000')), // Temporarily disabled
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      key: keyGenerator(req),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    res.status(429).json(rateLimitMessage);
  }
});

// Strict rate limiter for authentication endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: {
    error: {
      code: 'AUTH_RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `auth:${req.ip}`,
  // store: new RedisStore(15 * 60 * 1000, 'auth:'), // Temporarily disabled
  handler: (req: Request, res: Response) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });
    res.status(429).json({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts, please try again later',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Message sending rate limiter
export const messageRateLimiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '60000'), // 1 minute
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS_PER_ENDPOINT_MESSAGES'] || '30'), // 30 messages per minute
  message: {
    error: {
      code: 'MESSAGE_RATE_LIMITED',
      message: 'Too many messages sent, please slow down',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  // store: new RedisStore(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), 'msg:'), // Temporarily disabled
  handler: (req: Request, res: Response) => {
    logger.warn('Message rate limit exceeded', {
      key: keyGenerator(req),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    res.status(429).json({
      error: {
        code: 'MESSAGE_RATE_LIMITED',
        message: 'Too many messages sent, please slow down',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Session management rate limiter
export const sessionRateLimiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '60000'), // 1 minute
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS_PER_ENDPOINT_SESSIONS'] || '10'), // 10 session operations per minute
  message: {
    error: {
      code: 'SESSION_RATE_LIMITED',
      message: 'Too many session operations, please slow down',
      timestamp: new Date().toISOString()
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  // store: new RedisStore(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), 'session:'), // Temporarily disabled
  handler: (req: Request, res: Response) => {
    logger.warn('Session rate limit exceeded', {
      key: keyGenerator(req),
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    res.status(429).json({
      error: {
        code: 'SESSION_RATE_LIMITED',
        message: 'Too many session operations, please slow down',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Flexible rate limit middleware factory
export const rateLimitMiddleware = (
  type: string,
  maxRequests: number,
  windowSeconds: number
) => {
  const windowMs = windowSeconds * 1000;
  
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: `Too many ${type} requests, please try again later`,
        timestamp: new Date().toISOString()
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => `${type}:${keyGenerator(req)}`,
    // store: new RedisStore(windowMs, `${type}:`), // Temporarily disabled
    handler: (req: Request, res: Response) => {
      logger.warn(`${type} rate limit exceeded`, {
        key: keyGenerator(req),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many ${type} requests, please try again later`,
          timestamp: new Date().toISOString()
        }
      });
    }
  });
};