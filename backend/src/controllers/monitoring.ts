import { Request, Response } from 'express';
import { BrandMonitoringService } from '../services/BrandMonitoringService';
import { UserModel } from '../models/User';
import { BrandModel } from '../models/Brand';

export class MonitoringController {
  private static brandMonitoringService = new BrandMonitoringService();

  /**
   * Execute brand monitoring for a specific brand
   */
  static async monitorBrand(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { queryTypes } = req.body;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check if user has access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId);

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this brand'
        });
        return;
      }

      // Execute monitoring
      const result = await MonitoringController.brandMonitoringService.monitorBrand(
        brandId, 
        queryTypes
      );

      res.json({
        message: 'Brand monitoring completed successfully',
        result: {
          brand_id: result.brand_id,
          visibility_score: result.visibility_score,
          response_count: result.ai_responses.length,
          citation_count: result.citations.length,
          mention_count: result.mentions.length,
          timestamp: result.timestamp
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({
            error: 'Brand not found',
            message: error.message
          });
          return;
        }
      }

      console.error('Brand monitoring failed:', error);
      res.status(500).json({
        error: 'Monitoring failed',
        message: 'Internal server error during brand monitoring'
      });
    }
  }

  /**
   * Get visibility trends for a brand
   */
  static async getVisibilityTrends(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { days = 30 } = req.query;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check if user has access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId);

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this brand'
        });
        return;
      }

      const trends = await MonitoringController.brandMonitoringService.getVisibilityTrends(
        brandId,
        Number(days)
      );

      res.json({
        brand_id: brandId,
        trends,
        period_days: Number(days),
        total_data_points: trends.length
      });
    } catch (error) {
      console.error('Failed to get visibility trends:', error);
      res.status(500).json({
        error: 'Failed to get trends',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Compare brand with competitors
   */
  static async compareWithCompetitors(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { competitors, days = 7 } = req.body;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!Array.isArray(competitors) || competitors.length === 0) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Competitors array is required and must not be empty'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check if user has access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId);

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this brand'
        });
        return;
      }

      const comparison = await MonitoringController.brandMonitoringService.compareWithCompetitors(
        brandId,
        competitors,
        Number(days)
      );

      res.json({
        brand_id: brandId,
        comparison_period_days: Number(days),
        brand_metrics: comparison.brand_metrics,
        competitor_analysis: comparison.competitor_data
      });
    } catch (error) {
      console.error('Failed to compare with competitors:', error);
      res.status(500).json({
        error: 'Comparison failed',
        message: 'Internal server error during competitor comparison'
      });
    }
  }

  /**
   * Batch monitor multiple brands
   */
  static async batchMonitorBrands(req: Request, res: Response): Promise<void> {
    try {
      const { brandIds } = req.body;

      if (!Array.isArray(brandIds) || brandIds.length === 0) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand IDs array is required and must not be empty'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check access to all brands
      const accessChecks = await Promise.all(
        brandIds.map(async (brandId: string) => {
          if (req.user!.role === 'admin') return true;
          return await UserModel.hasAccessToBrand(req.user!.userId, brandId);
        })
      );

      const unauthorizedBrands = brandIds.filter((_, index) => !accessChecks[index]);
      
      if (unauthorizedBrands.length > 0) {
        res.status(403).json({
          error: 'Access denied',
          message: `You do not have access to brands: ${unauthorizedBrands.join(', ')}`
        });
        return;
      }

      // Execute batch monitoring
      const results = await MonitoringController.brandMonitoringService.batchMonitorBrands(brandIds);

      res.json({
        message: 'Batch monitoring completed',
        total_brands: brandIds.length,
        successful_monitors: results.length,
        results: results.map(result => ({
          brand_id: result.brand_id,
          visibility_score: result.visibility_score,
          timestamp: result.timestamp
        }))
      });
    } catch (error) {
      console.error('Batch monitoring failed:', error);
      res.status(500).json({
        error: 'Batch monitoring failed',
        message: 'Internal server error during batch monitoring'
      });
    }
  }

  /**
   * Get brand monitoring dashboard data
   */
  static async getDashboardData(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check if user has access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId);

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this brand'
        });
        return;
      }

      // Get brand details
      const brand = await BrandModel.findById(brandId);
      if (!brand) {
        res.status(404).json({
          error: 'Brand not found',
          message: 'Brand does not exist'
        });
        return;
      }

      // Get recent trends
      const trends = await MonitoringController.brandMonitoringService.getVisibilityTrends(brandId, 7);
      
      // Get brand statistics
      const statistics = await BrandModel.getStatistics(brandId);

      // Calculate current metrics
      const latestMetric = trends.length > 0 ? trends[0] : null;
      const previousMetric = trends.length > 1 ? trends[1] : null;
      
      const scoreChange = latestMetric && previousMetric 
        ? (latestMetric.overall_score || 0) - (previousMetric.overall_score || 0)
        : 0;

      res.json({
        brand: {
          id: brand.id,
          name: brand.name,
          domain: brand.domain,
          industry: brand.industry
        },
        current_metrics: {
          overall_score: latestMetric?.overall_score || 0,
          ranking_position: latestMetric?.ranking_position || 0,
          mention_frequency: latestMetric?.mention_frequency || 0,
          average_sentiment: latestMetric?.average_sentiment || 0,
          score_change: scoreChange
        },
        statistics,
        recent_trends: trends.slice(0, 30), // Last 30 data points
        monitoring_keywords: brand.monitoring_keywords,
        competitor_brands: brand.competitor_brands
      });
    } catch (error) {
      console.error('Failed to get dashboard data:', error);
      res.status(500).json({
        error: 'Failed to get dashboard data',
        message: 'Internal server error'
      });
    }
  }
}