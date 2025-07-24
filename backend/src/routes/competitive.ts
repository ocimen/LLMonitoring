import { Router } from 'express';
import { CompetitiveController } from '../controllers/competitive';
import { authenticate } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Competitive analysis endpoints
router.post('/brands/:brandId/analyze', CompetitiveController.analyzeCompetitivePosition);
router.get('/brands/:brandId/position', CompetitiveController.getMarketPosition);
router.get('/brands/:brandId/gaps', CompetitiveController.getCompetitiveGaps);
router.get('/brands/:brandId/insights', CompetitiveController.getCompetitiveInsights);
router.post('/brands/:brandId/compare-metrics', CompetitiveController.compareMetrics);

export const competitiveRouter = router;