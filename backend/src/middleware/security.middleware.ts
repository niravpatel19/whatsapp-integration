import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';
import crypto from 'crypto';

// IP blocking and whitelisting
const BLOCKED_IPS = new Set<string>();
const WHITELISTED_IPS = new Set<string>();

// Security event tracking
interface SecurityEvent {
  type: 'SUSPICIOUS_ACTIVITY' | 'RATE_LIMIT_EXCEEDED' | 'INVALID_SIGNATURE' | 'BLOCKED_IP';
  ip: string;
  userAgent?: string;
  path: string;
  timestamp: Date;
  details?: any;
}

export class SecurityMiddleware {
  /**
   * CORS middleware with environment-specific configuration
   */
  static corsMiddleware() {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ];
    
    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) {
        res.header('Access-Control-Allow-Origin', '*');
      } else if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      } else {
        // Log suspicious origin
        logger.warn('Blocked request from unauthorized origin', {
          origin,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          path: req.path
        });
        
        res.status(403).json({
          error: {
            code: 'FORBIDDEN_ORIGIN',
            message: 'Origin not allowed',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }
      
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-signature, x-timestamp, Idempotency-Key, x-request-id');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours
      
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      
      next();
    };
  }
  
  /**
   * Security headers middleware
   */
  static securityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Strict Transport Security
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      
      // Content Security Policy
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self' ws: wss:",
        "media-src 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ');
      
      res.header('Content-Security-Policy', csp);
      
      // Other security headers
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Remove server information
      res.removeHeader('X-Powered-By');
      res.header('Server', 'WhatsApp-Integration');
      
      next();
    };
  }
  
  /**
   * Request size limiting middleware
   */
  static requestSizeLimit(maxSize: string = '1mb') {
    const maxBytes = this.parseSize(maxSize);
    
    return (req: Request, res: Response, next: NextFunction) => {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      
      if (contentLength > maxBytes) {
        logger.warn('Request size limit exceeded', {
          ip: req.ip,
          path: req.path,
          contentLength,
          maxBytes,
          userAgent: req.headers['user-agent']
        });
        
        res.status(413).json({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Request size exceeds limit of ${maxSize}`,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      next();
    };
  }
  
  /**
   * Request timeout middleware
   */
  static requestTimeout(timeoutMs: number = 30000) {
    return (req: Request, res: Response, next: NextFunction) => {
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          logger.warn('Request timeout', {
            ip: req.ip,
            path: req.path,
            method: req.method,
            timeoutMs,
            userAgent: req.headers['user-agent']
          });
          
          res.status(408).json({
            error: {
              code: 'REQUEST_TIMEOUT',
              message: 'Request timeout',
              timestamp: new Date().toISOString(),
              requestId: req.headers['x-request-id'] || 'unknown'
            }
          });
        }
      }, timeoutMs);
      
      res.on('finish', () => {
        clearTimeout(timeout);
      });
      
      res.on('close', () => {
        clearTimeout(timeout);
      });
      
      next();
    };
  }
  
  /**
   * IP blocking and whitelisting middleware
   */
  static ipFilter() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      
      // Check if IP is blocked
      const isBlocked = await this.isIPBlocked(clientIP);
      if (isBlocked) {
        logger.warn('Blocked IP attempted access', {
          ip: clientIP,
          path: req.path,
          userAgent: req.headers['user-agent']
        });
        
        res.status(403).json({
          error: {
            code: 'IP_BLOCKED',
            message: 'Access denied',
            timestamp: new Date().toISOString()
          }
        });
        return;
      }
      
      // Check whitelist for sensitive endpoints
      if (this.isSensitiveEndpoint(req.path)) {
        const isWhitelisted = await this.isIPWhitelisted(clientIP);
        if (!isWhitelisted && process.env.NODE_ENV === 'production') {
          logger.warn('Non-whitelisted IP attempted sensitive endpoint access', {
            ip: clientIP,
            path: req.path,
            userAgent: req.headers['user-agent']
          });
          
          res.status(403).json({
            error: {
              code: 'IP_NOT_WHITELISTED',
              message: 'Access denied to sensitive endpoint',
              timestamp: new Date().toISOString()
            }
          });
          return;
        }
      }
      
      next();
    };
  }
  
  /**
   * Request signature validation middleware
   */
  static requestSignature(secret: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const signature = req.headers['x-signature'] as string;
      const timestamp = req.headers['x-timestamp'] as string;
      
      if (!signature || !timestamp) {
        res.status(401).json({
          error: {
            code: 'MISSING_SIGNATURE',
            message: 'Request signature required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Check timestamp (prevent replay attacks)
      const requestTime = parseInt(timestamp);
      const currentTime = Date.now();
      const timeDiff = Math.abs(currentTime - requestTime);
      
      if (timeDiff > 300000) { // 5 minutes
        res.status(401).json({
          error: {
            code: 'INVALID_TIMESTAMP',
            message: 'Request timestamp too old',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Validate signature
      const payload = JSON.stringify(req.body) + timestamp;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        logger.warn('Invalid request signature', {
          ip: req.ip,
          path: req.path,
          expectedSignature: expectedSignature.substring(0, 8) + '...',
          receivedSignature: signature.substring(0, 8) + '...'
        });
        
        res.status(401).json({
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Invalid request signature',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      next();
    };
  }
  
  /**
   * CSRF protection middleware
   */
  static csrfProtection() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip CSRF for API key authenticated requests
      if (req.headers['x-api-key']) {
        next();
        return;
      }
      
      // Skip for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        next();
        return;
      }
      
      const csrfToken = req.headers['x-csrf-token'] as string;
      const sessionToken = req.cookies?.csrfToken;
      
      if (!csrfToken || !sessionToken || csrfToken !== sessionToken) {
        res.status(403).json({
          error: {
            code: 'CSRF_TOKEN_MISMATCH',
            message: 'CSRF token validation failed',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      next();
    };
  }
  
  /**
   * Security event logging middleware
   */
  static securityEventLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Track suspicious patterns
      const suspiciousPatterns = [
        /\.\./,  // Directory traversal
        /<script/i,  // XSS attempts
        /union.*select/i,  // SQL injection
        /javascript:/i,  // JavaScript injection
        /vbscript:/i,  // VBScript injection
        /onload=/i,  // Event handler injection
        /onerror=/i  // Error handler injection
      ];
      
      const requestData = JSON.stringify(req.body) + req.url + (req.headers['user-agent'] || '');
      const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));
      
      if (isSuspicious) {
        this.logSecurityEvent({
          type: 'SUSPICIOUS_ACTIVITY',
          ip: req.ip || 'unknown',
          userAgent: req.headers['user-agent'],
          path: req.path,
          timestamp: new Date(),
          details: {
            method: req.method,
            body: req.body,
            query: req.query
          }
        });
      }
      
      next();
    };
  }
  
  /**
   * Check if IP is blocked
   */
  private static async isIPBlocked(ip: string): Promise<boolean> {
    try {
      const blocked = await redis.get(`blocked_ip:${ip}`);
      return !!blocked || BLOCKED_IPS.has(ip);
    } catch (error) {
      logger.error('Error checking blocked IP:', error);
      return BLOCKED_IPS.has(ip);
    }
  }
  
  /**
   * Check if IP is whitelisted
   */
  private static async isIPWhitelisted(ip: string): Promise<boolean> {
    try {
      const whitelisted = await redis.get(`whitelisted_ip:${ip}`);
      return !!whitelisted || WHITELISTED_IPS.has(ip);
    } catch (error) {
      logger.error('Error checking whitelisted IP:', error);
      return WHITELISTED_IPS.has(ip);
    }
  }
  
  /**
   * Check if endpoint is sensitive
   */
  private static isSensitiveEndpoint(path: string): boolean {
    const sensitivePatterns = [
      /\/admin/,
      /\/api\/v1\/auth\/register/,
      /\/api\/v1\/auth\/2fa/,
      /\/api\/v1\/api-keys/
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(path));
  }
  
  /**
   * Block IP address
   */
  static async blockIP(ip: string, duration: number = 3600): Promise<void> {
    try {
      await redis.set(`blocked_ip:${ip}`, '1', duration);
      BLOCKED_IPS.add(ip);
      logger.info(`IP blocked: ${ip} for ${duration} seconds`);
    } catch (error) {
      logger.error('Error blocking IP:', error);
      BLOCKED_IPS.add(ip);
    }
  }
  
  /**
   * Whitelist IP address
   */
  static async whitelistIP(ip: string): Promise<void> {
    try {
      await redis.set(`whitelisted_ip:${ip}`, '1');
      WHITELISTED_IPS.add(ip);
      logger.info(`IP whitelisted: ${ip}`);
    } catch (error) {
      logger.error('Error whitelisting IP:', error);
      WHITELISTED_IPS.add(ip);
    }
  }
  
  /**
   * Log security event
   */
  private static async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      logger.warn('Security event detected', event);
      
      // Store in Redis for analysis
      const eventKey = `security_event:${Date.now()}:${Math.random()}`;
      await redis.set(eventKey, JSON.stringify(event), 86400); // 24 hours
      
      // Increment counter for this IP
      const counterKey = `security_events:${event.ip}`;
      const count = await redis.incr(counterKey);
      await redis.expire(counterKey, 3600); // 1 hour
      
      // Auto-block if too many security events
      if (count >= 10) {
        await this.blockIP(event.ip, 3600); // Block for 1 hour
        logger.warn(`Auto-blocked IP due to security events: ${event.ip}`);
      }
      
    } catch (error) {
      logger.error('Error logging security event:', error);
    }
  }
  
  /**
   * Parse size string to bytes
   */
  private static parseSize(size: string): number {
    const units: { [key: string]: number } = {
      'b': 1,
      'kb': 1024,
      'mb': 1024 * 1024,
      'gb': 1024 * 1024 * 1024
    };
    
    const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
    if (!match) {
      throw new Error(`Invalid size format: ${size}`);
    }
    
    const value = parseFloat(match[1]);
    const unit = match[2] || 'b';
    
    return Math.floor(value * units[unit]);
  }
}