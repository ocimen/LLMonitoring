import request from 'supertest';
import express from 'express';
import { reportsRouter } from '../routes/reports';
import jwt from 'jsonwebtoken';

// Create a simple test app
const app = express();
app.use(express.json());
app.use('/api/reports', reportsRouter);

// Mock database queries
jest.mock('../config/database', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  closePool: jest.fn().mockResolvedValue(true)
}));

// Mock UserModel
jest.mock('../models/User', () => ({
  UserModel: {
    hasAccessToBrand: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      role: 'admin'
    })
  }
}));

// Mock AuthService
jest.mock('../services/auth', () => ({
  AuthService: {
    extractTokenFromHeader: jest.fn(header => header ? header.replace('Bearer ', '') : null),
    verifyAccessToken: jest.fn().mockResolvedValue({ 
      userId: 'user-1', 
      role: 'admin',
      email: 'test@example.com'
    }),
    validateConfiguration: jest.fn()
  }
}));

// Mock PerformanceReportingService
jest.mock('../services/PerformanceReportingService', () => ({
  PerformanceReportingService: jest.fn().mockImplementation(() => ({
    generatePerformanceReport: jest.fn().mockResolvedValue({
      brand_id: 'brand-1',
      brand_name: 'TechCorp',
      report_period: {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-01-31'),
        period: 'daily'
      },
      summary_metrics: {
        overall_score: { current: 75, previous: 70, change: 5, trend: 'up' },
        mention_frequency: { current: 8, previous: 6, change: 2, trend: 'up' },
        sentiment_score: { current: 0.6, previous: 0.5, change: 0.1, trend: 'up' },
        ranking_position: { current: 5, previous: 7, change: -2, trend: 'up' }
      },
      chart_data: [
        { date: '2024-01-15', overall_score: 75, mention_frequency: 8, sentiment_score: 80, ranking_position: 5 }
      ],
      insights: ['Test insight'],
      recommendations: ['Test recommendation'],
      generated_at: new Date()
    }),
    getAggregatedMetrics: jest.fn().mockResolvedValue([
      {
        date: '2024-01-15',
        overall_score: 75,
        mention_frequency: 8,
        average_sentiment: 0.6,
        ranking_position: 5
      },
      {
        date: '2024-01-16',
        overall_score: 78,
        mention_frequency: 9,
        average_sentiment: 0.7,
        ranking_position: 4
      }
    ]),
    exportReport: jest.fn().mockImplementation((report, options) => {
      if (options.format === 'json') {
        return Promise.resolve({
          data: JSON.stringify(report),
          filename: 'report.json',
          contentType: 'application/json'
        });
      } else if (options.format === 'csv') {
        return Promise.resolve({
          data: 'Date,Overall Score,Mention Frequency\n2024-01-15,75,8',
          filename: 'report.csv',
          contentType: 'text/csv'
        });
      } else if (options.format === 'pdf') {
        return Promise.resolve({
          data: 'BRAND PERFORMANCE REPORT\n========================\n\nBrand: TechCorp',
          filename: 'report.txt',
          contentType: 'text/plain'
        });
      } else {
        return Promise.reject(new Error(`Unsupported export format: ${options.format}`));
      }
    })
  }))
}));

describe('Reports API Integration Tests', () => {
  let authToken: string;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a test JWT token
    authToken = jwt.sign(
      { userId: 'user-1', role: 'admin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/reports/brands/:brandId/performance', () => {
    it('should generate performance report successfully', async () => {
      const response = await request(app)
        .post('/api/reports/brands/brand-1/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          period: 'daily'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Performance report generated successfully');
      expect(response.body).toHaveProperty('report');
      expect(response.body.report).toHaveProperty('brand_id', 'brand-1');
      expect(response.body.report).toHaveProperty('brand_name', 'TechCorp');
    });

    it('should return 400 for missing date parameters', async () => {
      const response = await request(app)
        .post('/api/reports/brands/brand-1/performance')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period: 'daily'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad request');
    });

    it('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post('/api/reports/brands/brand-1/performance')
        .send({
          start_date: '2024-01-01',
          end_date: '2024-01-31'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/reports/brands/:brandId/metrics', () => {
    it('should return aggregated metrics', async () => {
      const response = await request(app)
        .get('/api/reports/brands/brand-1/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          period: 'daily'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('brand_id', 'brand-1');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body).toHaveProperty('total_data_points', 2);
    });

    it('should return 400 for missing date parameters', async () => {
      const response = await request(app)
        .get('/api/reports/brands/brand-1/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          period: 'daily'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad request');
    });
  });

  describe('POST /api/reports/brands/:brandId/export', () => {
    it('should export report as JSON', async () => {
      const response = await request(app)
        .post('/api/reports/brands/brand-1/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          period: 'daily',
          format: 'json'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should export report as CSV', async () => {
      const response = await request(app)
        .post('/api/reports/brands/brand-1/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          period: 'daily',
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should return 400 for unsupported export format', async () => {
      // Mock the service to reject for unsupported format
      const { PerformanceReportingService } = require('../services/PerformanceReportingService');
      const mockService = new PerformanceReportingService();
      mockService.exportReport.mockRejectedValueOnce(new Error('Unsupported export format: xml'));

      const response = await request(app)
        .post('/api/reports/brands/brand-1/export')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          format: 'xml'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/reports/brands/:brandId/summary', () => {
    it('should return report summary for dashboard', async () => {
      const response = await request(app)
        .get('/api/reports/brands/brand-1/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ days: 30 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('brand_id', 'brand-1');
      expect(response.body).toHaveProperty('period_days', 30);
      expect(response.body).toHaveProperty('summary_metrics');
    });

    it('should use default 30 days if not specified', async () => {
      const response = await request(app)
        .get('/api/reports/brands/brand-1/summary')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('period_days', 30);
    });
  });

  describe('GET /api/reports/options', () => {
    it('should return available report options', async () => {
      const response = await request(app)
        .get('/api/reports/options')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('periods');
      expect(response.body).toHaveProperty('formats');
      expect(response.body.periods).toContain('daily');
      expect(response.body.formats).toContain('json');
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        { method: 'post', path: '/api/reports/brands/brand-1/performance' },
        { method: 'get', path: '/api/reports/brands/brand-1/metrics' },
        { method: 'post', path: '/api/reports/brands/brand-1/export' },
        { method: 'get', path: '/api/reports/brands/brand-1/summary' },
        { method: 'get', path: '/api/reports/options' }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method as 'get' | 'post'](endpoint.path);
        expect(response.status).toBe(401);
      }
    });
  });
});