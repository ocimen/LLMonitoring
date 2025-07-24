import { UserModel } from '../models/User';
import { BrandModel } from '../models/Brand';

// Mock the database query function
jest.mock('../config/database', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  closePool: jest.fn().mockResolvedValue(true)
}));

const mockQuery = require('../config/database').query;

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true)
}));

describe('User Management Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UserModel', () => {
    describe('create', () => {
      it('should create a new user successfully', async () => {
        const userData = {
          email: 'test@example.com',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          role: 'analyst' as const
        };

        const mockUser = {
          id: 'user-id',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          role: 'analyst',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        };

        mockQuery
          .mockResolvedValueOnce({ rows: [] }) // Check existing user
          .mockResolvedValueOnce({ rows: [mockUser] }); // Create user

        const result = await UserModel.create(userData);

        expect(result.email).toBe('test@example.com');
        expect(result.first_name).toBe('Test');
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });

      it('should throw error if user already exists', async () => {
        const userData = {
          email: 'existing@example.com',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User'
        };

        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

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

        const result = await UserModel.findByEmail('test@example.com');

        expect(result).toEqual(mockUser);
        expect(mockQuery).toHaveBeenCalledWith(
          'SELECT * FROM users WHERE email = $1 AND is_active = true',
          ['test@example.com']
        );
      });

      it('should return null if user not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await UserModel.findByEmail('nonexistent@example.com');

        expect(result).toBeNull();
      });
    });

    describe('hasAccessToBrand', () => {
      it('should return true for user with brand access', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

        const result = await UserModel.hasAccessToBrand('user-id', 'brand-id');

        expect(result).toBe(true);
      });

      it('should return false for user without brand access', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await UserModel.hasAccessToBrand('user-id', 'brand-id');

        expect(result).toBe(false);
      });

      it('should check owner role access', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

        await UserModel.hasAccessToBrand('user-id', 'brand-id', 'owner');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("AND ub.role = 'owner'"),
          ['user-id', 'brand-id']
        );
      });

      it('should check editor role access', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });

        await UserModel.hasAccessToBrand('user-id', 'brand-id', 'editor');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("AND ub.role IN ('owner', 'editor')"),
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
          last_name: 'User',
          role: 'analyst' as const,
          is_active: true,
          email_verified: false,
          created_at: new Date(),
          updated_at: new Date()
        };

        const sanitized = UserModel.sanitize(user);

        expect(sanitized).not.toHaveProperty('password_hash');
        expect(sanitized).toHaveProperty('email');
        expect(sanitized).toHaveProperty('first_name');
      });
    });
  });

  describe('BrandModel', () => {
    describe('create', () => {
      it('should create a new brand successfully', async () => {
        const brandData = {
          name: 'Test Brand',
          domain: 'testbrand.com',
          industry: 'Technology',
          created_by: 'user-id'
        };

        const mockBrand = {
          id: 'brand-id',
          name: 'Test Brand',
          domain: 'testbrand.com',
          industry: 'Technology',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        };

        mockQuery
          .mockResolvedValueOnce({ rows: [] }) // Check existing brand
          .mockResolvedValueOnce({ rows: [mockBrand] }); // Create brand

        const result = await BrandModel.create(brandData);

        expect(result.name).toBe('Test Brand');
        expect(result.domain).toBe('testbrand.com');
        expect(mockQuery).toHaveBeenCalledTimes(2);
      });

      it('should throw error if brand name already exists', async () => {
        const brandData = {
          name: 'Existing Brand',
          created_by: 'user-id'
        };

        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

        await expect(BrandModel.create(brandData)).rejects.toThrow(
          'Brand with this name already exists'
        );
      });
    });

    describe('addUser', () => {
      it('should add user to brand with specified role', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await BrandModel.addUser('brand-id', 'user-id', 'editor');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO user_brands'),
          ['brand-id', 'user-id', 'editor']
        );
      });
    });

    describe('removeUser', () => {
      it('should remove user from brand', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        await BrandModel.removeUser('brand-id', 'user-id');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM user_brands'),
          ['brand-id', 'user-id']
        );
      });

      it('should throw error if association not found', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 0 });

        await expect(BrandModel.removeUser('brand-id', 'user-id')).rejects.toThrow(
          'User-brand association not found'
        );
      });
    });

    describe('updateMonitoringKeywords', () => {
      it('should update monitoring keywords', async () => {
        const keywords = ['keyword1', 'keyword2'];
        const mockBrand = {
          id: 'brand-id',
          monitoring_keywords: keywords
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockBrand] });

        const result = await BrandModel.updateMonitoringKeywords('brand-id', keywords);

        expect(result.monitoring_keywords).toEqual(keywords);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('monitoring_keywords = $2'),
          ['brand-id', keywords]
        );
      });

      it('should throw error if too many keywords', async () => {
        const tooManyKeywords = new Array(51).fill('keyword');

        await expect(
          BrandModel.updateMonitoringKeywords('brand-id', tooManyKeywords)
        ).rejects.toThrow('Maximum 50 monitoring keywords allowed');
      });
    });

    describe('updateCompetitorBrands', () => {
      it('should update competitor brands', async () => {
        const competitors = ['Competitor A', 'Competitor B'];
        const mockBrand = {
          id: 'brand-id',
          competitor_brands: competitors
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockBrand] });

        const result = await BrandModel.updateCompetitorBrands('brand-id', competitors);

        expect(result.competitor_brands).toEqual(competitors);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('competitor_brands = $2'),
          ['brand-id', competitors]
        );
      });

      it('should throw error if too many competitors', async () => {
        const tooManyCompetitors = new Array(21).fill('competitor');

        await expect(
          BrandModel.updateCompetitorBrands('brand-id', tooManyCompetitors)
        ).rejects.toThrow('Maximum 20 competitor brands allowed');
      });
    });

    describe('getStatistics', () => {
      it('should return brand statistics', async () => {
        const mockStats = {
          total_responses: '10',
          total_mentions: '25',
          avg_sentiment: '0.75',
          latest_metrics_date: '2024-01-01'
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockStats] });

        const result = await BrandModel.getStatistics('brand-id');

        expect(result.total_responses).toBe(10);
        expect(result.total_mentions).toBe(25);
        expect(result.avg_sentiment).toBe(0.75);
      });
    });
  });
});