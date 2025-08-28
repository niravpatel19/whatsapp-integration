import { z } from 'zod';
import { logger } from '../utils/logger';
import axios from 'axios';

// Phone number validation using E.164 format
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

// Email validation using RFC 5322 compliant regex (simplified)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// URL validation regex - More permissive to allow cloud storage URLs
const URL_REGEX = /^https?:\/\/(?:[-\w.])+(?:\:[0-9]+)?(?:\/(?:[\w\/_.\-~!$&'()*+,;=:@])*(?:\?(?:[\w&=%.\-~!$'()*+,;:@/])*)?(?:\#(?:[\w.\-~!$&'()*+,;=:@/])*)?)?$/;

// Media file type whitelist
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv'
];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/webm'];
const ALLOWED_AUDIO_TYPES = ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac'];

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

// Disposable email domains (partial list)
const DISPOSABLE_EMAIL_DOMAINS = [
  '10minutemail.com',
  'tempmail.org',
  'guerrillamail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'yopmail.com',
  'maildrop.cc'
];

// Malicious URL patterns
const MALICIOUS_URL_PATTERNS = [
  /bit\.ly/i,
  /tinyurl\.com/i,
  /t\.co/i,
  /goo\.gl/i,
  /ow\.ly/i,
  /is\.gd/i,
  /buff\.ly/i,
  // Add more patterns as needed
];

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface MediaInfo {
  url: string;
  type: string;
  size?: number;
  isValid: boolean;
  errors: string[];
  warning?: string;
}

export interface PhoneValidationResult {
  isValid: boolean;
  formatted?: string;
  country?: string;
  type?: 'mobile' | 'landline' | 'unknown';
  errors: string[];
}

export class ValidationService {
  /**
   * Validate phone number in E.164 format
   */
  static validatePhoneNumber(phone: string): PhoneValidationResult {
    const errors: string[] = [];
    
    if (!phone) {
      errors.push('Phone number is required');
      return { isValid: false, errors };
    }
    
    // Remove all non-digit characters except +
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    
    // Check E.164 format
    if (!E164_REGEX.test(cleanPhone)) {
      errors.push('Phone number must be in E.164 format (e.g., +1234567890)');
      return { isValid: false, errors };
    }
    
    // Basic country code validation
    const countryCode = cleanPhone.substring(1, 4);
    const nationalNumber = cleanPhone.substring(countryCode.length + 1);
    
    if (nationalNumber.length < 4) {
      errors.push('Phone number is too short');
      return { isValid: false, errors };
    }
    
    if (nationalNumber.length > 15) {
      errors.push('Phone number is too long');
      return { isValid: false, errors };
    }
    
    // Detect mobile vs landline (basic heuristics)
    let type: 'mobile' | 'landline' | 'unknown' = 'unknown';
    
    // US/Canada mobile patterns
    if (countryCode === '1' && nationalNumber.length === 10) {
      const areaCode = nationalNumber.substring(0, 3);
      // Mobile area codes typically start with certain digits
      if (['2', '3', '4', '5', '6', '7', '8', '9'].includes(areaCode[0])) {
        type = 'mobile';
      }
    }
    
    // UK mobile patterns
    if (countryCode === '44' && nationalNumber.startsWith('7')) {
      type = 'mobile';
    }
    
    // Add more country-specific patterns as needed
    
    return {
      isValid: true,
      formatted: cleanPhone,
      type,
      errors: []
    };
  }
  
  /**
   * Validate email address with domain checking
   */
  static async validateEmail(email: string, checkDisposable: boolean = true): Promise<ValidationResult<{ email: string; isDisposable: boolean }>> {
    const errors: ValidationError[] = [];
    
    if (!email) {
      errors.push({ field: 'email', message: 'Email is required', code: 'REQUIRED' });
      return { success: false, errors };
    }
    
    // Basic format validation
    if (!EMAIL_REGEX.test(email)) {
      errors.push({ field: 'email', message: 'Invalid email format', code: 'INVALID_FORMAT' });
      return { success: false, errors };
    }
    
    const [localPart, domain] = email.toLowerCase().split('@');
    
    // Local part validation
    if (localPart.length > 64) {
      errors.push({ field: 'email', message: 'Email local part too long', code: 'LOCAL_PART_TOO_LONG' });
    }
    
    // Domain validation
    if (domain.length > 253) {
      errors.push({ field: 'email', message: 'Email domain too long', code: 'DOMAIN_TOO_LONG' });
    }
    
    // Check for disposable email
    let isDisposable = false;
    if (checkDisposable) {
      isDisposable = DISPOSABLE_EMAIL_DOMAINS.includes(domain);
      if (isDisposable) {
        errors.push({ field: 'email', message: 'Disposable email addresses are not allowed', code: 'DISPOSABLE_EMAIL' });
      }
    }
    
    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    return {
      success: true,
      data: {
        email: email.toLowerCase(),
        isDisposable
      }
    };
  }
  
  /**
   * Validate URL with security checks
   */
  static async validateUrl(url: string, allowedProtocols: string[] = ['http', 'https']): Promise<ValidationResult<{ url: string; isSecure: boolean }>> {
    const errors: ValidationError[] = [];
    
    if (!url) {
      errors.push({ field: 'url', message: 'URL is required', code: 'REQUIRED' });
      return { success: false, errors };
    }
    
    // Parse and validate URL using built-in URL constructor
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      errors.push({ field: 'url', message: 'Invalid URL format', code: 'INVALID_FORMAT' });
      return { success: false, errors };
    }
    
    // Protocol validation
    if (!allowedProtocols.includes(parsedUrl.protocol.slice(0, -1))) {
      errors.push({ 
        field: 'url', 
        message: `Protocol must be one of: ${allowedProtocols.join(', ')}`, 
        code: 'INVALID_PROTOCOL' 
      });
    }
    
    // Check for malicious patterns
    const isSuspicious = MALICIOUS_URL_PATTERNS.some(pattern => pattern.test(url));
    if (isSuspicious) {
      errors.push({ field: 'url', message: 'URL appears to be suspicious', code: 'SUSPICIOUS_URL' });
    }
    
    // Check for localhost/private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsedUrl.hostname;
      if (hostname === 'localhost' || 
          hostname.startsWith('127.') || 
          hostname.startsWith('192.168.') || 
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')) {
        errors.push({ field: 'url', message: 'Private/local URLs are not allowed', code: 'PRIVATE_URL' });
      }
    }
    
    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    return {
      success: true,
      data: {
        url,
        isSecure: parsedUrl.protocol === 'https:'
      }
    };
  }
  
  /**
   * Validate media file URL and metadata
   */
  static async validateMediaUrl(url: string, expectedType: 'image' | 'document' | 'video' | 'audio'): Promise<ValidationResult<MediaInfo>> {
    const errors: string[] = [];
    
    // First validate the URL
    const urlValidation = await this.validateUrl(url);
    if (!urlValidation.success) {
      return {
        success: false,
        data: {
          url,
          type: expectedType,
          isValid: false,
          errors: urlValidation.errors?.map(e => e.message) || ['Invalid URL']
        }
      };
    }
    
    try {
      // Make HEAD request to get content type and size
      const response = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 3,
        validateStatus: (status) => status < 400
      });
      
      const contentType = response.headers['content-type']?.toLowerCase() || '';
      const contentLength = parseInt(response.headers['content-length'] || '0');
      
      // Validate content type
      let allowedTypes: string[] = [];
      let maxSize = 0;
      
      switch (expectedType) {
        case 'image':
          allowedTypes = ALLOWED_IMAGE_TYPES;
          maxSize = MAX_IMAGE_SIZE;
          break;
        case 'document':
          allowedTypes = ALLOWED_DOCUMENT_TYPES;
          maxSize = MAX_DOCUMENT_SIZE;
          break;
        case 'video':
          allowedTypes = ALLOWED_VIDEO_TYPES;
          maxSize = MAX_VIDEO_SIZE;
          break;
        case 'audio':
          allowedTypes = ALLOWED_AUDIO_TYPES;
          maxSize = MAX_AUDIO_SIZE;
          break;
      }
      
      const actualType = contentType.split(';')[0].trim();
      if (!allowedTypes.includes(actualType)) {
        errors.push(`Invalid ${expectedType} type. Allowed types: ${allowedTypes.join(', ')}`);
      }
      
      // Validate file size
      if (contentLength > maxSize) {
        errors.push(`File size (${Math.round(contentLength / 1024 / 1024)}MB) exceeds maximum allowed size (${Math.round(maxSize / 1024 / 1024)}MB)`);
      }
      
      if (contentLength === 0) {
        errors.push('File appears to be empty');
      }
      
      return {
        success: errors.length === 0,
        data: {
          url,
          type: actualType,
          size: contentLength,
          isValid: errors.length === 0,
          errors
        }
      };
      
    } catch (error: any) {
      logger.warn('Media URL validation error (allowing fallback):', error);
      
      // If SKIP_MEDIA_VALIDATION is enabled, or if it's a network/auth error, allow the URL
      const skipValidation = process.env.SKIP_MEDIA_VALIDATION === 'true';
      const isNetworkError = error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT';
      const isAuthError = error.response?.status === 403 || error.response?.status === 401;
      
      if (skipValidation || isNetworkError || isAuthError) {
        logger.info(`Allowing media URL despite validation error: ${url}`);
        return {
          success: true,
          data: {
            url,
            type: expectedType,
            size: 0,
            isValid: true,
            errors: [],
            warning: 'Media validation skipped due to network/auth restrictions'
          }
        };
      }
      
      // Only fail for actual file not found or server errors
      if (error.response?.status === 404) {
        errors.push('File not found at URL');
      } else {
        errors.push('Failed to validate media URL');
      }
      
      return {
        success: false,
        data: {
          url,
          type: expectedType,
          isValid: false,
          errors
        }
      };
    }
  }
  
  /**
   * Sanitize HTML content to prevent XSS
   */
  static sanitizeHtml(input: string): string {
    if (!input) return '';
    
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  /**
   * Sanitize input to prevent SQL injection (basic)
   */
  static sanitizeInput(input: string): string {
    if (!input) return '';
    
    // Remove or escape potentially dangerous characters
    return input
      .replace(/['"\\;]/g, '') // Remove quotes and semicolons
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove SQL block comments start
      .replace(/\*\//g, '') // Remove SQL block comments end
      .trim();
  }
  
  /**
   * Validate request using Zod schema
   */
  static validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
    try {
      const result = schema.safeParse(data);
      
      if (!result.success) {
        const errors: ValidationError[] = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        return { success: false, errors };
      }
      
      return { success: true, data: result.data };
    } catch (error) {
      logger.error('Schema validation error:', error);
      return {
        success: false,
        errors: [{ field: 'unknown', message: 'Validation failed', code: 'VALIDATION_ERROR' }]
      };
    }
  }
  
  /**
   * Create validation middleware for Express routes
   */
  static createValidationMiddleware<T>(schema: z.ZodSchema<T>) {
    return (req: any, res: any, next: any) => {
      const validation = this.validateRequest(schema, req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
      }
      
      req.validatedBody = validation.data;
      next();
    };
  }
}

// Common validation schemas
export const CommonSchemas = {
  email: z.string().email('Invalid email format').max(254, 'Email too long'),
  
  phone: z.string().regex(E164_REGEX, 'Phone number must be in E.164 format'),
  
  url: z.string().url('Invalid URL format').max(2048, 'URL too long'),
  
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/\d/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain at least one special character'),
  
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
  
  label: z.string().min(1, 'Label is required').max(50, 'Label too long').trim(),
  
  uuid: z.string().uuid('Invalid UUID format'),
  
  objectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format'),
  
  totpCode: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d{6}$/, 'TOTP code must be numeric'),
  
  mediaUrl: z.string().max(2048, 'Media URL too long').refine((url) => {
    if (!url) return true;
    try {
      new URL(url);
      return url.startsWith('http://') || url.startsWith('https://');
    } catch {
      return false;
    }
  }, 'Invalid media URL')
};