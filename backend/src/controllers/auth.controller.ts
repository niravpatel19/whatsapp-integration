import { Request, Response } from 'express';
import { AuthService, LoginCredentials } from '../services/auth.service';
import { User } from '../models/User.model';
import { APIKey } from '../models/APIKey.model';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().optional(),
  rememberMe: z.boolean().optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  email: z.string().email('Invalid email format').optional()
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export class AuthController {
  /**
   * User Registration
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const { email, password, name } = validation.data;
      
      // Create user
      const user = await User.createUser({ email, password, name });
      
      // Generate tokens
      const tokens = await AuthService.generateTokens(user);
      
      // Set secure cookies
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        maxAge: 15 * 60 * 1000 // 15 minutes
      };
      
      res.cookie('accessToken', tokens.accessToken, cookieOptions);
      res.cookie('refreshToken', tokens.refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      logger.info(`User registered successfully: ${email}`);
      
      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            twoFAEnabled: user.twoFAEnabled,
            createdAt: user.createdAt
          },
          tokens: {
            accessToken: tokens.accessToken,
            expiresIn: tokens.expiresIn
          }
        }
      });
      
    } catch (error: any) {
      logger.error('Registration error:', error);
      
      if (error.message.includes('already exists')) {
        res.status(409).json({
          error: {
            code: 'USER_EXISTS',
            message: 'User with this email already exists',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      if (error.details) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Password validation failed',
            details: error.details,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Registration failed',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * User Login
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const credentials: LoginCredentials = validation.data as LoginCredentials;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      
      // Authenticate user
      const result = await AuthService.authenticateUser(credentials, ipAddress, userAgent);
      
      if (!result.success) {
        const statusCode = result.requiresTwoFA ? 200 : 401;
        res.status(statusCode).json({
          success: false,
          error: {
            code: result.requiresTwoFA ? 'TWO_FA_REQUIRED' : 'UNAUTHORIZED',
            message: result.error,
            requiresTwoFA: result.requiresTwoFA,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Set secure cookies
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const,
        maxAge: validation.data.rememberMe ? 7 * 24 * 60 * 60 * 1000 : 15 * 60 * 1000
      };
      
      res.cookie('accessToken', result.tokens!.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000 // Always 15 minutes for access token
      });
      res.cookie('refreshToken', result.tokens!.refreshToken, cookieOptions);
      
      logger.info(`User logged in successfully: ${result.user!.email}`);
      
      res.json({
        success: true,
        data: {
          user: {
            id: result.user!._id,
            email: result.user!.email,
            name: result.user!.name,
            twoFAEnabled: result.user!.twoFAEnabled
          },
          tokens: {
            accessToken: result.tokens!.accessToken,
            expiresIn: result.tokens!.expiresIn
          }
        }
      });
      
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Login failed',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * User Logout
   */
  static async logout(req: Request, res: Response): Promise<void> {
    try {
      // Get token from header or cookie
      let token: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (req.cookies?.accessToken) {
        token = req.cookies.accessToken;
      }
      
      // Blacklist the token
      if (token) {
        await AuthService.blacklistToken(token);
      }
      
      // Clear cookies
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      
      logger.info(`User logged out: ${req.user?.email || 'unknown'}`);
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
      
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Logout failed',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Refresh Access Token
   */
  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      let refreshToken: string | undefined;
      
      // Get refresh token from body or cookie
      if (req.body.refreshToken) {
        const validation = refreshTokenSchema.safeParse(req.body);
        if (!validation.success) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid refresh token',
              timestamp: new Date().toISOString(),
              requestId: req.headers['x-request-id'] || 'unknown'
            }
          });
          return;
        }
        refreshToken = validation.data.refreshToken;
      } else if (req.cookies?.refreshToken) {
        refreshToken = req.cookies.refreshToken;
      }
      
      if (!refreshToken) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Refresh token required',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Refresh tokens
      const tokens = await AuthService.refreshToken(refreshToken);
      if (!tokens) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired refresh token',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Set new cookies
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict' as const
      };
      
      res.cookie('accessToken', tokens.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000 // 15 minutes
      });
      res.cookie('refreshToken', tokens.refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn
        }
      });
      
    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Token refresh failed',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Get User Profile
   */
  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const user = await User.findById(req.user!.userId);
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            twoFAEnabled: user.twoFAEnabled,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        }
      });
      
    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to get profile',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Update User Profile
   */
  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const validation = updateProfileSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const updates = validation.data;
      const user = await User.updateProfile(req.user!.userId, updates);
      
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      logger.info(`Profile updated for user: ${user.email}`);
      
      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            twoFAEnabled: user.twoFAEnabled,
            updatedAt: user.updatedAt
          }
        }
      });
      
    } catch (error: any) {
      logger.error('Update profile error:', error);
      
      if (error.message.includes('already in use')) {
        res.status(409).json({
          error: {
            code: 'EMAIL_EXISTS',
            message: 'Email already in use by another user',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to update profile',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
  
  /**
   * Change Password
   */
  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const validation = changePasswordSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input data',
            details: validation.error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      const { currentPassword, newPassword } = validation.data;
      
      // Get user
      const user = await User.findById(req.user!.userId);
      if (!user) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'User not found',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        res.status(400).json({
          error: {
            code: 'INVALID_PASSWORD',
            message: 'Current password is incorrect',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Validate new password strength
      const passwordValidation = AuthService.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        res.status(400).json({
          error: {
            code: 'WEAK_PASSWORD',
            message: 'New password does not meet requirements',
            details: passwordValidation.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown'
          }
        });
        return;
      }
      
      // Hash new password and update
      const newPasswordHash = await AuthService.hashPassword(newPassword);
      user.passwordHash = newPasswordHash;
      await user.save();
      
      // Invalidate all existing tokens for security
      await AuthService.invalidateAllUserTokens(user._id.toString());
      
      logger.info(`Password changed for user: ${user.email}`);
      
      res.json({
        success: true,
        message: 'Password changed successfully. Please log in again.'
      });
      
    } catch (error) {
      logger.error('Change password error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL',
          message: 'Failed to change password',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown'
        }
      });
    }
  }
}