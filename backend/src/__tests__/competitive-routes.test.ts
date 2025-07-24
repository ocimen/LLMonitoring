import request from 'supertest';
import express from 'express';
import { competitiveRouter } from '../routes/competitive';

// Mock database
jest.mock('../config/database', () => ({
  query: jest.fn()
}));

// Mock the competitive controller
jest.mock('../controllers/competitive', () => ({
  CompetitiveController: {
    analyzeCompetitivePosition: jest.fn((req, res) => {
      res.json({ message: 'Competitive analysis completed successfully' });
    }),
    getMarketPosition: jest.fn((req, res) => {
      res.json({ message: 'Market position retrieved successfully' });
    }),
    getCompetitiveGaps: jest.fn((req, res) => {
      res.json({ message: 'Competitive gaps retrieved successfully' });
    }),
    getCompetitiveInsights: jest.fn((req, res) => {
      res.json({ message: 'Competitive insights retrieved successfully' });
    }),
    compareMetrics: jest.fn((req, res) => {
      res.json({ message: 'Metrics comparison completed successfully' });
    })
  }
}));

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticate: jest.fn((req, res, next) => {
    req.user = { userId: 'test-user', role: 'brand_manager' };
    next();
  })
}));

describe('Competitive Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/competitive', competitiveRouter);
  });

  describe('POST /api/competitive/brands/:brandId/analyze', () => {
    it('should call analyzeCompetitivePosition controller', async () => {
      const response = await request(app)
        .post('/api/competitive/brands/brand-1/analyze')
        .send({
          competitors: ['CompetitorA'],
          timeframe_days: 30
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competitive analysis completed successfully');
    });
  });

  describe('GET /api/competitive/brands/:brandId/position', () => {
    it('should call getMarketPosition controller', async () => {
      const response = await request(app)
        .get('/api/competitive/brands/brand-1/position')
        .query({
          competitors: 'CompetitorA,CompetitorB',
          timeframe_days: 30
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Market position retrieved successfully');
    });
  });

  describe('GET /api/competitive/brands/:brandId/gaps', () => {
    it('should call getCompetitiveGaps controller', async () => {
      const response = await request(app)
        .get('/api/competitive/brands/brand-1/gaps')
        .query({
          competitors: 'CompetitorA',
          timeframe_days: 30
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competitive gaps retrieved successfully');
    });
  });

  describe('GET /api/competitive/brands/:brandId/insights', () => {
    it('should call getCompetitiveInsights controller', async () => {
      const response = await request(app)
        .get('/api/competitive/brands/brand-1/insights')
        .query({
          competitors: 'CompetitorA',
          timeframe_days: 30
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Competitive insights retrieved successfully');
    });
  });

  describe('POST /api/competitive/brands/:brandId/compare-metrics', () => {
    it('should call compareMetrics controller', async () => {
      const response = await request(app)
        .post('/api/competitive/brands/brand-1/compare-metrics')
        .send({
          competitors: ['CompetitorA'],
          metrics: ['overall_score', 'mention_frequency'],
          timeframe_days: 30
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Metrics comparison completed successfully');
    });
  });
});