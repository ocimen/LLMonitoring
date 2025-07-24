import { Router } from 'express';
import { ReportsController } from '../controllers/reports';
import { authenticate } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Performance report endpoints
router.post('/brands/:brandId/performance', ReportsController.generatePerformanceReport);
router.get('/brands/:brandId/metrics', ReportsController.getAggregatedMetrics);
router.post('/brands/:brandId/export', ReportsController.exportReport);
router.get('/brands/:brandId/summary', ReportsController.getReportSummary);

// Report configuration endpoints
router.get('/options', ReportsController.getReportOptions);

export const reportsRouter = router;