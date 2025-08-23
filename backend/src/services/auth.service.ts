import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { User, IUser } from '../models/User.model';
import { APIKey } from '../models/APIKey.model';
import { AuditLog } from '../models/AuditLog.model';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';

// JWT Configuration
const JWT_ACCESS_SECRET = process.env['JWT_SECRET'] || 'fallback-access-secret';
const JWT_REFRESH_SECRET = process.env['JWT_REFRESH_SECRET'] || 'fallback-refresh-secret';
const JWT_ACCESS_EXPIRY = process.env['JWT_EXPIRES_IN'] || '30d'; // 30 days - Extended for better UX
const JWT_REFRESH_EXPIRY = process.env['JWT_REFRESH_EXPIRES_IN'] || '90d'; // 90 days - Extended refresh period

// Rate limiting configuration
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60; // 15 minutes in seconds

export interface JWTPayload {
  userId: string;
  email: string;
  permissions: string[];
  iat: number;
  exp: number;
  jti: string; // JWT ID for blacklisting
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
  totpCode?: string;
}

export interface AuthResult {
  success: boolean;
  user?: IUser;
  tokens?: AuthTokens;
  error?: string;
  requiresTwoFA?: boolean;
}

export interface UserContext {
  userId: string;
  email: string;
  permissions: string[];
}

export class AuthService {
  /**
   * Authenticate user with email and password
   */
  static async authenticateUser(
    credentials: LoginCredentials,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResult> {
    try {
      const { email, password, totpCode } = credentials;

      // Check for account lockout
      const lockoutKey = `lockout:${email.toLowerCase()}`;
      const isLockedOut = await redis.get(lockoutKey);
      if (isLockedOut) {
        await this.logAuditEvent(null, 'LOGIN_ATTEMPT_BLOCKED', {
          email,
          reason: 'account_locked',
          ipAddress,
        });
        return {
          success: false,
          error: 'Account temporarily locked due to too many failed login attempts',
        };
      }

      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        await this.incrementLoginAttempts(email);
        await this.logAuditEvent(null, 'LOGIN_FAILED', {
          email,
          reason: 'user_not_found',
          ipAddress,
        });
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        await this.incrementLoginAttempts(email);
        await this.logAuditEvent(user._id.toString(), 'LOGIN_FAILED', {
          email,
          reason: 'invalid_password',
          ipAddress,
        });
        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      // Check if 2FA is required
      if (user.twoFAEnabled) {
        if (!totpCode) {
          return {
            success: false,
            requiresTwoFA: true,
            error: 'Two-factor authentication code required',
          };
        }

        // Validate TOTP code
        const isTotpValid = user.validateTOTP(totpCode);
        if (!isTotpValid) {
          await this.incrementLoginAttempts(email);
          await this.logAuditEvent(user._id.toString(), 'LOGIN_FAILED', {
            email,
            reason: 'invalid_2fa',
            ipAddress,
          });
          return {
            success: false,
            error: 'Invalid two-factor authentication code',
          };
        }
      }

      // Clear login attempts on successful login
      await this.clearLoginAttempts(email);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Log successful login
      await this.logAuditEvent(user._id.toString(), 'LOGIN_SUCCESS', {
        email,
        ipAddress,
        userAgent,
      });

      return {
        success: true,
        user,
        tokens,
      };
    } catch (error) {
      logger.error('Authentication error:', error);
      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  /**
   * Generate JWT access and refresh tokens
   */
  static async generateTokens(user: IUser): Promise<AuthTokens> {
    const jti = crypto.randomUUID();
    const permissions = ['user']; // Basic user permissions

    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user._id.toString(),
      email: user.email,
      permissions,
      jti,
    };

    const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, {
      expiresIn: JWT_ACCESS_EXPIRY,
      issuer: 'whatsapp-integration',
      audience: 'whatsapp-integration-client',
    } as any);

    const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRY,
      issuer: 'whatsapp-integration',
      audience: 'whatsapp-integration-client',
    } as any);

    // Store refresh token family in Redis for rotation tracking
    const refreshTokenKey = `refresh_token:${user._id}:${jti}`;
    await redis.set(refreshTokenKey, refreshToken, 7 * 24 * 60 * 60); // 7 days

    return {
      accessToken,
      refreshToken,
      expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
    };
  }

  /**
   * Validate JWT token and return user context
   */
  static async validateJWT(token: string): Promise<UserContext | null> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return null;
      }

      const decoded = jwt.verify(token, JWT_ACCESS_SECRET, {
        issuer: 'whatsapp-integration',
        audience: 'whatsapp-integration-client',
      }) as JWTPayload;

      return {
        userId: decoded.userId,
        email: decoded.email,
        permissions: decoded.permissions,
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid JWT token:', error.message);
      } else {
        logger.error('JWT validation error:', error);
      }
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshToken(refreshToken: string): Promise<AuthTokens | null> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
        issuer: 'whatsapp-integration',
        audience: 'whatsapp-integration-client',
      }) as JWTPayload & { type: string };

      if (decoded.type !== 'refresh') {
        return null;
      }

      // Check if refresh token exists in Redis (family tracking)
      const refreshTokenKey = `refresh_token:${decoded.userId}:${decoded.jti}`;
      const storedToken = await redis.get(refreshTokenKey);
      if (!storedToken || storedToken !== refreshToken) {
        // Token rotation detected - invalidate all tokens for this user
        await this.invalidateAllUserTokens(decoded.userId);
        return null;
      }

      // Get user
      const user = await User.findById(decoded.userId);
      if (!user) {
        return null;
      }

      // Generate new tokens
      const newTokens = await this.generateTokens(user);

      // Remove old refresh token
      await redis.del(refreshTokenKey);

      return newTokens;
    } catch (error) {
      logger.error('Token refresh error:', error);
      return null;
    }
  }

  /**
   * Blacklist JWT token (for logout)
   */
  static async blacklistToken(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.set(`blacklist:${token}`, '1', ttl);
        }
      }
    } catch (error) {
      logger.error('Token blacklisting error:', error);
    }
  }

  /**
   * Invalidate all tokens for a user
   */
  static async invalidateAllUserTokens(userId: string): Promise<void> {
    try {
      const pattern = `refresh_token:${userId}:*`;
      // Note: keys method not available in current Redis client, using alternative approach
      const keys: string[] = []; // Temporarily disabled - would need Redis client with keys support
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      logger.error('Token invalidation error:', error);
    }
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    return User.validatePassword(password);
  }

  /**
   * Hash password with bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Increment login attempts and lock account if necessary
   */
  private static async incrementLoginAttempts(email: string): Promise<void> {
    const attemptsKey = `login_attempts:${email.toLowerCase()}`;
    const attempts = await redis.incr(attemptsKey);

    if (attempts === 1) {
      // Set expiry for first attempt
      await redis.expire(attemptsKey, LOCKOUT_DURATION);
    }

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      // Lock account
      const lockoutKey = `lockout:${email.toLowerCase()}`;
      await redis.set(lockoutKey, '1', LOCKOUT_DURATION);

      logger.warn(`Account locked for ${email} after ${attempts} failed attempts`);
    }
  }

  /**
   * Clear login attempts on successful login
   */
  private static async clearLoginAttempts(email: string): Promise<void> {
    const attemptsKey = `login_attempts:${email.toLowerCase()}`;
    await redis.del(attemptsKey);
  }

  /**
   * Log audit events
   */
  private static async logAuditEvent(
    userId: string | null,
    action: string,
    metadata: any
  ): Promise<void> {
    try {
      await AuditLog.logAction({
        userId,
        actor: userId || 'anonymous',
        action: action as any,
        targetType: 'User',
        targetId: userId,
        metadata,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    } catch (error) {
      logger.error('Audit logging error:', error);
    }
  }
}
