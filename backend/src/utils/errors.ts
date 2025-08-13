export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;
    
    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

// Authentication Errors
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: any) {
    super('UNAUTHORIZED', message, 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: any) {
    super('FORBIDDEN', message, 403, details);
  }
}

export class InvalidTokenError extends AppError {
  constructor(message: string = 'Invalid token', details?: any) {
    super('INVALID_TOKEN', message, 401, details);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token expired', details?: any) {
    super('TOKEN_EXPIRED', message, 401, details);
  }
}

// Validation Errors
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class InvalidInputError extends AppError {
  constructor(message: string = 'Invalid input', details?: any) {
    super('INVALID_INPUT', message, 400, details);
  }
}

// Resource Errors
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', details?: any) {
    super('NOT_FOUND', `${resource} not found`, 404, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', details?: any) {
    super('CONFLICT', message, 409, details);
  }
}

export class DuplicateError extends AppError {
  constructor(resource: string = 'Resource', details?: any) {
    super('DUPLICATE', `${resource} already exists`, 409, details);
  }
}

// Rate Limiting Errors
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', details?: any) {
    super('RATE_LIMITED', message, 429, details);
  }
}

// Session Errors
export class SessionNotFoundError extends AppError {
  constructor(sessionId?: string) {
    super(
      'SESSION_NOT_FOUND',
      'Session not found',
      404,
      { sessionId }
    );
  }
}

export class SessionNotConnectedError extends AppError {
  constructor(sessionId?: string) {
    super(
      'SESSION_NOT_CONNECTED',
      'Session is not connected',
      400,
      { sessionId }
    );
  }
}

export class SessionExpiredError extends AppError {
  constructor(sessionId?: string) {
    super(
      'SESSION_EXPIRED',
      'Session has expired',
      400,
      { sessionId }
    );
  }
}

// WPPConnect Errors
export class WPPError extends AppError {
  constructor(message: string = 'WhatsApp operation failed', details?: any) {
    super('WPP_ERROR', message, 500, details);
  }
}

export class QRGenerationError extends AppError {
  constructor(sessionId?: string) {
    super(
      'QR_GENERATION_ERROR',
      'Failed to generate QR code',
      500,
      { sessionId }
    );
  }
}

// Message Errors
export class MessageSendError extends AppError {
  constructor(message: string = 'Failed to send message', details?: any) {
    super('MESSAGE_SEND_ERROR', message, 500, details);
  }
}

export class InvalidPhoneNumberError extends AppError {
  constructor(phoneNumber?: string) {
    super(
      'INVALID_PHONE_NUMBER',
      'Invalid phone number format',
      400,
      { phoneNumber }
    );
  }
}

export class MediaValidationError extends AppError {
  constructor(message: string = 'Media validation failed', details?: any) {
    super('MEDIA_VALIDATION_ERROR', message, 400, details);
  }
}

// Webhook Errors
export class WebhookDeliveryError extends AppError {
  constructor(message: string = 'Webhook delivery failed', details?: any) {
    super('WEBHOOK_DELIVERY_ERROR', message, 500, details);
  }
}

export class InvalidWebhookUrlError extends AppError {
  constructor(url?: string) {
    super(
      'INVALID_WEBHOOK_URL',
      'Invalid webhook URL',
      400,
      { url }
    );
  }
}

// Database Errors
export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed', details?: any) {
    super('DATABASE_ERROR', message, 500, details);
  }
}

export class ConnectionError extends AppError {
  constructor(service: string = 'Service', details?: any) {
    super(
      'CONNECTION_ERROR',
      `Failed to connect to ${service}`,
      503,
      details
    );
  }
}

// API Key Errors
export class InvalidAPIKeyError extends AppError {
  constructor() {
    super('INVALID_API_KEY', 'Invalid API key', 401);
  }
}

export class APIKeyExpiredError extends AppError {
  constructor() {
    super('API_KEY_EXPIRED', 'API key has expired', 401);
  }
}

export class APIKeyRevokedError extends AppError {
  constructor() {
    super('API_KEY_REVOKED', 'API key has been revoked', 401);
  }
}

// Two-Factor Authentication Errors
export class TwoFactorRequiredError extends AppError {
  constructor() {
    super('TWO_FACTOR_REQUIRED', 'Two-factor authentication required', 401);
  }
}

export class InvalidTwoFactorCodeError extends AppError {
  constructor() {
    super('INVALID_TWO_FACTOR_CODE', 'Invalid two-factor authentication code', 401);
  }
}

// File Upload Errors
export class FileTooLargeError extends AppError {
  constructor(maxSize: string) {
    super(
      'FILE_TOO_LARGE',
      `File size exceeds maximum allowed size of ${maxSize}`,
      413
    );
  }
}

export class UnsupportedFileTypeError extends AppError {
  constructor(fileType: string) {
    super(
      'UNSUPPORTED_FILE_TYPE',
      `File type ${fileType} is not supported`,
      415
    );
  }
}

// Helper function to check if error is operational
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
};