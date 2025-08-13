import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate request ID if not present
  const requestId = req.headers['x-request-id'] as string || 
                   req.headers['x-correlation-id'] as string ||
                   Math.random().toString(36).substring(7);

  // Log the error
  logger.error('API Error', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    request: {
      id: requestId,
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    },
    timestamp: new Date().toISOString(),
  });

  // Handle different error types
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: any = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.message;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    statusCode = 500;
    errorCode = 'DATABASE_ERROR';
    message = 'Database operation failed';
    // Don't expose database details in production
    if (process.env.NODE_ENV !== 'production') {
      details = err.message;
    }
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token expired';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    errorCode = 'FILE_UPLOAD_ERROR';
    message = 'File upload failed';
    details = err.message;
  }

  // Create error response
  const errorResponse: ErrorResponse = {
    error: {
      code: errorCode,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };

  // Remove details in production for security
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    delete errorResponse.error.details;
  }

  res.status(statusCode).json(errorResponse);
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};