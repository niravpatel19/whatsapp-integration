import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';

// Extend Request interface to include custom properties
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate unique request ID
  req.requestId = req.headers['x-request-id'] as string || 
                  req.headers['x-correlation-id'] as string ||
                  uuidv4();
  
  // Record start time
  req.startTime = Date.now();

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);

  // Log incoming request
  logger.info('Incoming Request', {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString(),
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const duration = Date.now() - req.startTime;
    
    // Log response
    logger.info('Outgoing Response', {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: JSON.stringify(body).length,
      timestamp: new Date().toISOString(),
    });

    // Log performance warning for slow requests
    if (duration > 1000) {
      logger.warn('Slow Request', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
    }

    return originalJson.call(this, body);
  };

  // Override res.send to log response for non-JSON responses
  const originalSend = res.send;
  res.send = function(body: any) {
    const duration = Date.now() - req.startTime;
    
    // Only log if json wasn't called (to avoid double logging)
    if (!res.headersSent || res.getHeader('Content-Type')?.toString().includes('json')) {
      logger.info('Outgoing Response', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: body?.length || 0,
        timestamp: new Date().toISOString(),
      });
    }

    return originalSend.call(this, body);
  };

  next();
};