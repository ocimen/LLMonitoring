import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { AuthService } from '../services/auth';
import { validateSchema, createUserSchema, loginSchema } from '../models/validation';

export class AuthController {
  /**
   * User registration
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = validateSchema<{
        email: string;
        password: string;
        first_name: string;
        last_name: string;
        role?: 'admin' | 'brand_manager' | 'analyst';
      }>(createUserSchema, req.body);
      
      // Create user
      const user = await UserModel.create(validatedData);
      
      // Generate tokens
      const tokens = await AuthService.generateTokens(
        user,
        req.headers['user-agent'],
        req.ip
      );
      
      // Generate email verification token
      const emailVerificationToken = AuthService.generateEmailVerificationToken(
        user.id,
        user.email
      );
      
      res.status(201).json({
        message: 'User registered successfully',
        user: UserModel.sanitize(user),
        tokens,
        emailVerificationToken // In production, this would be sent via email
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          res.status(409).json({
            error: 'Registration failed',
            message: error.message
          });
          return;
        }
        
        if (error.message.includes('Validation error')) {
          res.status(400).json({
            error: 'Validation failed',
            message: error.message
          });
          return;
        }
      }
      
      res.status(500).json({
        error: 'Registration failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * User login
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = validateSchema<{
        email: string;
        password: string;
      }>(loginSchema, req.body);
      
      // Find user by email
      const user = await UserModel.findByEmail(validatedData.email);
      
      if (!user) {
        res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid email or password'
        });
        return;
      }
      
      // Verify password
      const isValidPassword = await UserModel.verifyPassword(user, validatedData.password);
      
      if (!isValidPassword) {
        res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid email or password'
        });
        return;
      }
      
      // Update last login
      await UserModel.updateLastLogin(user.id);
      
      // Generate tokens
      const tokens = await AuthService.generateTokens(
        user,
        req.headers['user-agent'],
        req.ip
      );
      
      res.json({
        message: 'Login successful',
        user: UserModel.sanitize(user),
        tokens
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Validation error')) {
        res.status(400).json({
          error: 'Validation failed',
          message: error.message
        });
        return;
      }
      
      res.status(500).json({
        error: 'Login failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Refresh access token
   */
  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Refresh token is required'
        });
        return;
      }
      
      const tokens = await AuthService.refreshAccessToken(refreshToken);
      
      if (!tokens) {
        res.status(401).json({
          error: 'Token refresh failed',
          message: 'Invalid or expired refresh token'
        });
        return;
      }
      
      res.json({
        message: 'Token refreshed successfully',
        tokens
      });
    } catch (error) {
      res.status(500).json({
        error: 'Token refresh failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Logout (revoke current session)
   */
  static async logout(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }
      
      const revoked = await AuthService.revokeSession(req.user.sessionId);
      
      if (revoked) {
        res.json({
          message: 'Logout successful'
        });
      } else {
        res.status(400).json({
          error: 'Logout failed',
          message: 'Session not found'
        });
      }
    } catch (error) {
      res.status(500).json({
        error: 'Logout failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Logout from all devices (revoke all sessions)
   */
  static async logoutAll(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }
      
      const revokedCount = await AuthService.revokeAllUserSessions(req.user.userId);
      
      res.json({
        message: 'Logged out from all devices',
        revokedSessions: revokedCount
      });
    } catch (error) {
      res.status(500).json({
        error: 'Logout failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get current user profile
   */
  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }
      
      const user = await UserModel.findById(req.user.userId);
      
      if (!user) {
        res.status(404).json({
          error: 'User not found',
          message: 'User account may have been deleted'
        });
        return;
      }
      
      // Get user's brands
      const brandsResult = await UserModel.getBrands(user.id);
      
      res.json({
        user: UserModel.sanitize(user),
        brands: brandsResult.rows
      });
    } catch (error) {
      res.status(500).json({
        error: 'Profile fetch failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Update user profile
   */
  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }
      
      const updatedUser = await UserModel.update(req.user.userId, req.body);
      
      res.json({
        message: 'Profile updated successfully',
        user: UserModel.sanitize(updatedUser)
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Validation error')) {
        res.status(400).json({
          error: 'Validation failed',
          message: error.message
        });
        return;
      }
      
      res.status(500).json({
        error: 'Profile update failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Get user sessions
   */
  static async getSessions(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }
      
      const sessions = await AuthService.getUserSessions(req.user.userId);
      
      // Sanitize session data
      const sanitizedSessions = sessions.map(session => ({
        id: session.id,
        user_agent: session.user_agent,
        ip_address: session.ip_address,
        created_at: session.created_at,
        expires_at: session.expires_at,
        is_current: session.id === req.user!.sessionId
      }));
      
      res.json({
        sessions: sanitizedSessions
      });
    } catch (error) {
      res.status(500).json({
        error: 'Sessions fetch failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Revoke a specific session
   */
  static async revokeSession(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }
      
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Session ID is required'
        });
        return;
      }
      
      const revoked = await AuthService.revokeSession(sessionId);
      
      if (revoked) {
        res.json({
          message: 'Session revoked successfully'
        });
      } else {
        res.status(404).json({
          error: 'Session not found',
          message: 'Session may have already been revoked'
        });
      }
    } catch (error) {
      res.status(500).json({
        error: 'Session revocation failed',
        message: 'Internal server error'
      });
    }
  }
  
  /**
   * Verify email address
   */
  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;
      
      if (!token) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Verification token is required'
        });
        return;
      }
      
      const decoded = AuthService.verifyEmailVerificationToken(token);
      
      if (!decoded) {
        res.status(400).json({
          error: 'Verification failed',
          message: 'Invalid or expired verification token'
        });
        return;
      }
      
      // Update user email verification status
      await UserModel.update(decoded.userId, { email_verified: true });
      
      res.json({
        message: 'Email verified successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Email verification failed',
        message: 'Internal server error'
      });
    }
  }
}