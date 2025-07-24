import { AuthService } from '../services/auth';
import { UserModel } from '../models/User';
import { query } from '../config/database';

// Mock the database query function
jest.mock('../config/database');
const mockQuery = query as jest.MockedFunction<typeof query>;

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true)
}));

// Mock JWT
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn().mockReturnValue({
    userId: 'user-id',
    email: 'test@example.com',
    role: 'analyst',
    sessionId: 'session-id'
  })
}));

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        role: 'analyst'
      } as any;

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'session-id' }] }) // INSERT session
        .mockResolvedValueOnce({ rows: [] }); // UPDATE session

      const tokens = await AuthService.generateTokens(mockUser);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresIn');
      expect(tokens.expiresIn).toBe(15 * 60); // 15 minutes
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_active: true }]
      });

      const payload = await AuthService.verifyAccessToken('valid_token');

      expect(payload).toEqual({
        userId: 'user-id',
        email: 'test@example.com',
        role: 'analyst',
        sessionId: 'session-id'
      });
    });

    it('should return null for invalid token', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      const payload = await AuthService.verifyAccessToken('invalid_token');

      expect(payload).toBeNull();
    });

    it('should return null for inactive user session', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_active: false }]
      });

      const payload = await AuthService.verifyAccessToken('valid_token');

      expect(payload).toBeNull();
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh valid refresh token', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            email: 'test@example.com',
            role: 'analyst',
            is_active: true,
            user_agent: 'test-agent',
            ip_address: '127.0.0.1'
          }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 'new-session-id' }] }) // New session
        .mockResolvedValueOnce({ rows: [] }) // Update new session
        .mockResolvedValueOnce({ rows: [] }); // Revoke old session

      const tokens = await AuthService.refreshAccessToken('valid_refresh_token');

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
    });

    it('should return null for invalid refresh token', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      const tokens = await AuthService.refreshAccessToken('invalid_refresh_token');

      expect(tokens).toBeNull();
    });
  });

  describe('revokeSession', () => {
    it('should revoke session successfully', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await AuthService.revokeSession('session-id');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE user_sessions SET is_revoked = true WHERE id = $1',
        ['session-id']
      );
    });

    it('should return false if session not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await AuthService.revokeSession('non-existent-session');

      expect(result).toBe(false);
    });
  });

  describe('revokeAllUserSessions', () => {
    it('should revoke all user sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 3 });

      const result = await AuthService.revokeAllUserSessions('user-id');

      expect(result).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE user_sessions SET is_revoked = true WHERE user_id = $1 AND is_revoked = false',
        ['user-id']
      );
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should clean up expired sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5 });

      const result = await AuthService.cleanupExpiredSessions();

      expect(result).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM user_sessions WHERE expires_at < NOW() OR is_revoked = true'
      );
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer header', () => {
      const token = AuthService.extractTokenFromHeader('Bearer abc123');
      expect(token).toBe('abc123');
    });

    it('should return null for invalid header format', () => {
      const token = AuthService.extractTokenFromHeader('Invalid abc123');
      expect(token).toBeNull();
    });

    it('should return null for missing header', () => {
      const token = AuthService.extractTokenFromHeader(undefined);
      expect(token).toBeNull();
    });
  });

  describe('generatePasswordResetToken', () => {
    it('should generate password reset token', () => {
      const token = AuthService.generatePasswordResetToken('user-id');
      expect(token).toBe('mock_token');
    });
  });

  describe('verifyPasswordResetToken', () => {
    it('should verify valid password reset token', () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValueOnce({
        userId: 'user-id',
        type: 'password_reset'
      });

      const result = AuthService.verifyPasswordResetToken('valid_token');
      expect(result).toEqual({ userId: 'user-id' });
    });

    it('should return null for wrong token type', () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValueOnce({
        userId: 'user-id',
        type: 'email_verification'
      });

      const result = AuthService.verifyPasswordResetToken('valid_token');
      expect(result).toBeNull();
    });
  });
});

describe('UserModel Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create user with hashed password', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ // Create user
          rows: [{
            id: 'user-id',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            role: 'analyst'
          }]
        });

      const userData = {
        email: 'test@example.com',
        password: 'password123',
        first_name: 'Test',
        last_name: 'User'
      };

      const user = await UserModel.create(userData);

      expect(user.email).toBe('test@example.com');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw error if user already exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'existing-user-id' }]
      });

      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        first_name: 'Test',
        last_name: 'User'
      };

      await expect(UserModel.create(userData)).rejects.toThrow(
        'User with this email already exists'
      );
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User'
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });

      const user = await UserModel.findByEmail('test@example.com');

      expect(user).toEqual(mockUser);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        ['test@example.com']
      );
    });

    it('should return null if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await UserModel.findByEmail('nonexistent@example.com');

      expect(user).toBeNull();
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValueOnce(true);

      const user = { password_hash: 'hashed_password' } as any;
      const isValid = await UserModel.verifyPassword(user, 'correct_password');

      expect(isValid).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('correct_password', 'hashed_password');
    });

    it('should reject incorrect password', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValueOnce(false);

      const user = { password_hash: 'hashed_password' } as any;
      const isValid = await UserModel.verifyPassword(user, 'wrong_password');

      expect(isValid).toBe(false);
    });
  });

  describe('hasAccessToBrand', () => {
    it('should return true for user with brand access', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const hasAccess = await UserModel.hasAccessToBrand('user-id', 'brand-id');

      expect(hasAccess).toBe(true);
    });

    it('should return false for user without brand access', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const hasAccess = await UserModel.hasAccessToBrand('user-id', 'brand-id');

      expect(hasAccess).toBe(false);
    });

    it('should check role-based access for owner role', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await UserModel.hasAccessToBrand('user-id', 'brand-id', 'owner');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("AND ub.role = 'owner'"),
        ['user-id', 'brand-id']
      );
    });
  });

  describe('sanitize', () => {
    it('should remove password_hash from user object', () => {
      const user = {
        id: 'user-id',
        email: 'test@example.com',
        password_hash: 'secret_hash',
        first_name: 'Test',
        last_name: 'User'
      } as any;

      const sanitized = UserModel.sanitize(user);

      expect(sanitized).not.toHaveProperty('password_hash');
      expect(sanitized).toHaveProperty('email');
      expect(sanitized).toHaveProperty('first_name');
    });
  });
});