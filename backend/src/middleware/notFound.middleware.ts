import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/errors';

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error = new AppError(
    'NOT_FOUND',
    `Route ${req.method} ${req.originalUrl} not found`,
    404
  );
  
  next(error);
};