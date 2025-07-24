import { Request, Response } from 'express';
import { CompetitiveAnalysisService } from '../services/CompetitiveAnalysisService';
import { UserModel } from '../models/User';

export class CompetitiveController {
  private static competitiveAnalysisService = new CompetitiveAnalysisService();

  /**
   * Analyze competitive position for a brand
   */
  static async analyzeCompetitivePosition(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { competitors, timeframe_days = 30 } = req.body;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!competitors || !Array.isArray(competitors) || competitors.length === 0) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Competitors array is required and must contain at least one competitor'
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

      // Validate timeframe
      const timeframeDays = parseInt(timeframe_days.toString(), 10);
      if (isNaN(timeframeDays) || timeframeDays < 1 || timeframeDays > 365) {
        res.status(400).json({
          error: 'Invalid timeframe',
          message: 'Timeframe must be between 1 and 365 days'
        });
        return;
      }

      // Validate competitors array
      if (competitors.some((comp: any) => typeof comp !== 'string' || comp.trim().length === 0)) {
        res.status(400).json({
          error: 'Invalid competitors',
          message: 'All competitors must be non-empty strings'
        });
        return;
      }

      const analysis = await CompetitiveController.competitiveAnalysisService.analyzeCompetitivePosition(
        brandId,
        competitors,
        timeframeDays
      );

      res.json({
        message: 'Competitive analysis completed successfully',
        analysis
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

      console.error('Failed to analyze competitive position:', error);
      res.status(500).json({
        error: 'Analysis failed',
        message: 'Internal server error during competitive analysis'
      });
    }
  }

  /**
   * Get market position for a brand
   */
  static async getMarketPosition(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { competitors, timeframe_days = 30 } = req.query;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!competitors) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Competitors parameter is required'
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

      // Parse competitors from query string
      const competitorList = Array.isArray(competitors) ? competitors : [competitors];
      const competitorNames = competitorList.map(c => c.toString().trim()).filter(c => c.length > 0);

      if (competitorNames.length === 0) {
        res.status(400).json({
          error: 'Invalid competitors',
          message: 'At least one valid competitor name is required'
        });
        return;
      }

      const timeframeDays = parseInt(timeframe_days?.toString() || '30', 10);

      const analysis = await CompetitiveController.competitiveAnalysisService.analyzeCompetitivePosition(
        brandId,
        competitorNames,
        timeframeDays
      );

      res.json({
        brand_id: brandId,
        market_position: analysis.market_position,
        competitors_analyzed: analysis.competitors.length,
        analysis_date: analysis.analysis_date
      });
    } catch (error) {
      console.error('Failed to get market position:', error);
      res.status(500).json({
        error: 'Failed to get market position',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get competitive gaps for a brand
   */
  static async getCompetitiveGaps(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { competitors, timeframe_days = 30, severity_filter } = req.query;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!competitors) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Competitors parameter is required'
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

      // Parse competitors from query string
      const competitorList = Array.isArray(competitors) ? competitors : [competitors];
      const competitorNames = competitorList.map(c => c.toString().trim()).filter(c => c.length > 0);

      const timeframeDays = parseInt(timeframe_days?.toString() || '30', 10);

      const analysis = await CompetitiveController.competitiveAnalysisService.analyzeCompetitivePosition(
        brandId,
        competitorNames,
        timeframeDays
      );

      // Filter gaps by severity if requested
      let filteredGaps = analysis.competitive_gaps;
      if (severity_filter) {
        const severityLevels = Array.isArray(severity_filter) ? severity_filter : [severity_filter];
        filteredGaps = analysis.competitive_gaps.filter((gap: any) => 
          severityLevels.includes(gap.impact) // Use impact instead of severity
        );
      }

      res.json({
        brand_id: brandId,
        competitive_gaps: filteredGaps,
        total_gaps: analysis.competitive_gaps.length,
        filtered_gaps: filteredGaps.length,
        analysis_date: analysis.analysis_date
      });
    } catch (error) {
      console.error('Failed to get competitive gaps:', error);
      res.status(500).json({
        error: 'Failed to get competitive gaps',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get competitive insights and recommendations
   */
  static async getCompetitiveInsights(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { competitors, timeframe_days = 30 } = req.query;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!competitors) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Competitors parameter is required'
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

      // Parse competitors from query string
      const competitorList = Array.isArray(competitors) ? competitors : [competitors];
      const competitorNames = competitorList.map(c => c.toString().trim()).filter(c => c.length > 0);

      const timeframeDays = parseInt(timeframe_days?.toString() || '30', 10);

      const analysis = await CompetitiveController.competitiveAnalysisService.analyzeCompetitivePosition(
        brandId,
        competitorNames,
        timeframeDays
      );

      res.json({
        brand_id: brandId,
        market_insights: analysis.market_insights,
        strategic_recommendations: analysis.strategic_recommendations,
        market_position: analysis.market_position,
        analysis_date: analysis.analysis_date
      });
    } catch (error) {
      console.error('Failed to get competitive insights:', error);
      res.status(500).json({
        error: 'Failed to get competitive insights',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Compare specific metrics between brand and competitors
   */
  static async compareMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { competitors, metrics, timeframe_days = 30 } = req.body;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!competitors || !Array.isArray(competitors)) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Competitors array is required'
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

      const timeframeDays = parseInt(timeframe_days.toString(), 10);
      const analysis = await CompetitiveController.competitiveAnalysisService.analyzeCompetitivePosition(
        brandId,
        competitors,
        timeframeDays
      );

      // Filter metrics if specific ones are requested
      const requestedMetrics = metrics || ['overall_score', 'mention_frequency', 'sentiment_score', 'ranking_position'];
      
      const comparison = {
        brand: analysis.brand,
        competitors: analysis.competitors,
        metric_comparison: requestedMetrics.map((metric: string) => {
          const brandValue = analysis.brand[metric as keyof typeof analysis.brand] as number;
          const competitorValues = analysis.competitors.map(c => ({
            name: c.brand_name,
            value: c[metric as keyof typeof c] as number
          }));
          
          return {
            metric,
            brand_value: brandValue,
            competitors: competitorValues,
            brand_rank: competitorValues.filter(c => c.value > brandValue).length + 1
          };
        })
      };

      res.json({
        message: 'Metric comparison completed successfully',
        comparison,
        analysis_date: analysis.analysis_date
      });
    } catch (error) {
      console.error('Failed to compare metrics:', error);
      res.status(500).json({
        error: 'Comparison failed',
        message: 'Internal server error during metric comparison'
      });
    }
  }
}