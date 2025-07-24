import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { User, UserSession } from '../types/database';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private static readonly ACCESS_TOKEN_EXPIRY = '15m';
  private static readonly REFRESH_TOKEN_EXPIRY = '7d';
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
  private static readonly REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';

  /**
   * Generate JWT access and refresh tokens
   */
  static async generateTokens(user: User, userAgent?: string, ipAddress?: string): Promise<AuthTokens> {
    // Create session record
    const sessionResult = await query(`
      INSERT INTO user_sessions (user_id, token_hash, expires_at, user_agent, ip_address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      user.id,
      'temp-hash', // Will be updated with actual token hash
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      userAgent || null,
      ipAddress || null
    ]);

    const sessionId = sessionResult.rows[0].id;

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId
    };

    // Generate tokens
    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'llm-brand-monitoring',
      audience: 'llm-brand-monitoring-client'
    });

    const refreshToken = jwt.sign(
      { userId: user.id, sessionId },
      this.REFRESH_SECRET,
      {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
        issuer: 'llm-brand-monitoring',
        audience: 'llm-brand-monitoring-client'
      }
    );

    // Update session with actual token hash
    const tokenHash = this.hashToken(refreshToken);
    await query(
      'UPDATE user_sessions SET token_hash = $1 WHERE id = $2',
      [tokenHash, sessionId]
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60 // 15 minutes in seconds
    };
  }

  /**
   * Verify JWT access token
   */
  static async verifyAccessToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'llm-brand-monitoring',
        audience: 'llm-brand-monitoring-client'
      }) as JWTPayload;

      // Check if session is still valid
      const sessionResult = await query(`
        SELECT us.*, u.is_active 
        FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        WHERE us.id = $1 AND us.is_revoked = false AND us.expires_at > NOW()
      `, [decoded.sessionId]);

      if (sessionResult.rows.length === 0 || !sessionResult.rows[0].is_active) {
        return null;
      }

      return decoded;
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
    try {
      const decoded = jwt.verify(refreshToken, this.REFRESH_SECRET, {
        issuer: 'llm-brand-monitoring',
        audience: 'llm-brand-monitoring-client'
      }) as { userId: string; sessionId: string };

      // Verify refresh token hash matches stored hash
      const tokenHash = this.hashToken(refreshToken);
      const sessionResult = await query(`
        SELECT us.*, u.email, u.role, u.is_active
        FROM user_sessions us
        JOIN users u ON us.user_id = u.id
        WHERE us.id = $1 AND us.token_hash = $2 AND us.is_revoked = false AND us.expires_at > NOW()
      `, [decoded.sessionId, tokenHash]);

      if (sessionResult.rows.length === 0 || !sessionResult.rows[0].is_active) {
        return null;
      }

      const session = sessionResult.rows[0];
      const user = {
        id: decoded.userId,
        email: session.email,
        role: session.role
      } as User;

      // Generate new tokens (this will create a new session)
      const newTokens = await this.generateTokens(user, session.user_agent, session.ip_address);

      // Revoke old session
      await query(
        'UPDATE user_sessions SET is_revoked = true WHERE id = $1',
        [decoded.sessionId]
      );

      return newTokens;
    } catch (error) {
      return null;
    }
  }

  /**
   * Revoke a specific session
   */
  static async revokeSession(sessionId: string): Promise<boolean> {
    const result = await query(
      'UPDATE user_sessions SET is_revoked = true WHERE id = $1',
      [sessionId]
    );

    return result.rowCount > 0;
  }

  /**
   * Revoke all sessions for a user
   */
  static async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await query(
      'UPDATE user_sessions SET is_revoked = true WHERE user_id = $1 AND is_revoked = false',
      [userId]
    );

    return result.rowCount;
  }

  /**
   * Get active sessions for a user
   */
  static async getUserSessions(userId: string): Promise<UserSession[]> {
    const result = await query(`
      SELECT * FROM user_sessions 
      WHERE user_id = $1 AND is_revoked = false AND expires_at > NOW()
      ORDER BY created_at DESC
    `, [userId]);

    return result.rows as UserSession[];
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const result = await query(
      'DELETE FROM user_sessions WHERE expires_at < NOW() OR is_revoked = true'
    );

    return result.rowCount;
  }

  /**
   * Hash token for storage (simple hash for demo - use stronger hashing in production)
   */
  private static hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Validate JWT secret configuration
   */
  static validateConfiguration(): void {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'fallback-secret-key') {
      console.warn('⚠️  JWT_SECRET not configured properly. Using fallback secret.');
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      console.warn('⚠️  JWT_REFRESH_SECRET not configured. Using fallback secret.');
    }

    if (process.env.NODE_ENV === 'production' && 
        (this.JWT_SECRET === 'fallback-secret-key' || this.REFRESH_SECRET === 'fallback-refresh-secret')) {
      throw new Error('JWT secrets must be configured in production environment');
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Generate password reset token
   */
  static generatePasswordResetToken(userId: string): string {
    return jwt.sign(
      { userId, type: 'password_reset' },
      this.JWT_SECRET,
      {
        expiresIn: '1h',
        issuer: 'llm-brand-monitoring'
      }
    );
  }

  /**
   * Verify password reset token
   */
  static verifyPasswordResetToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'llm-brand-monitoring'
      }) as { userId: string; type: string };

      if (decoded.type !== 'password_reset') {
        return null;
      }

      return { userId: decoded.userId };
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate email verification token
   */
  static generateEmailVerificationToken(userId: string, email: string): string {
    return jwt.sign(
      { userId, email, type: 'email_verification' },
      this.JWT_SECRET,
      {
        expiresIn: '24h',
        issuer: 'llm-brand-monitoring'
      }
    );
  }

  /**
   * Verify email verification token
   */
  static verifyEmailVerificationToken(token: string): { userId: string; email: string } | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'llm-brand-monitoring'
      }) as { userId: string; email: string; type: string };

      if (decoded.type !== 'email_verification') {
        return null;
      }

      return { userId: decoded.userId, email: decoded.email };
    } catch (error) {
      return null;
    }
  }
}