import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import {
  analyzeSentiment,
  getSentimentTrends,
  getHistoricalSentimentAnalysis,
  updateSentimentScores,
  compareBrandSentiment,
  getSentimentDashboard
} from '../controllers/sentiment';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sentiment analysis routes
router.post('/analyze', analyzeSentiment as any);
router.post('/compare', compareBrandSentiment as any);

// Brand-specific sentiment routes
router.get('/trends/:brandId', getSentimentTrends as any);
router.get('/historical/:brandId', getHistoricalSentimentAnalysis as any);
router.get('/dashboard/:brandId', getSentimentDashboard as any);

// Sentiment management routes
router.post('/update/:brandId', updateSentimentScores as any);

export default router;