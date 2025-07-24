import { Request, Response } from 'express';
import { PerformanceReportingService, ReportTimeRange, ExportOptions } from '../services/PerformanceReportingService';
import { UserModel } from '../models/User';

export class ReportsController {
  private static performanceReportingService = new PerformanceReportingService();

  /**
   * Generate performance report for a brand
   */
  static async generatePerformanceReport(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { start_date, end_date, period = 'daily' } = req.body;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!start_date || !end_date) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Start date and end date are required'
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

      const timeRange: ReportTimeRange = {
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        period: period as 'daily' | 'weekly' | 'monthly'
      };

      // Validate date range
      if (timeRange.start_date >= timeRange.end_date) {
        res.status(400).json({
          error: 'Invalid date range',
          message: 'Start date must be before end date'
        });
        return;
      }

      const report = await ReportsController.performanceReportingService.generatePerformanceReport(
        brandId,
        timeRange
      );

      res.json({
        message: 'Performance report generated successfully',
        report
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

      console.error('Failed to generate performance report:', error);
      res.status(500).json({
        error: 'Report generation failed',
        message: 'Internal server error during report generation'
      });
    }
  }

  /**
   * Get aggregated metrics for a brand
   */
  static async getAggregatedMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { start_date, end_date, period = 'daily' } = req.query;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      if (!start_date || !end_date) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Start date and end date are required'
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

      const timeRange: ReportTimeRange = {
        start_date: new Date(start_date as string),
        end_date: new Date(end_date as string),
        period: period as 'daily' | 'weekly' | 'monthly'
      };

      const metrics = await ReportsController.performanceReportingService.getAggregatedMetrics(
        brandId,
        timeRange
      );

      res.json({
        brand_id: brandId,
        time_range: timeRange,
        metrics,
        total_data_points: metrics.length
      });
    } catch (error) {
      console.error('Failed to get aggregated metrics:', error);
      res.status(500).json({
        error: 'Failed to get metrics',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Export performance report in different formats
   */
  static async exportReport(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { 
        start_date, 
        end_date, 
        period = 'daily',
        format = 'json',
        include_charts = true,
        include_insights = true
      } = req.body;

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

      const timeRange: ReportTimeRange = {
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        period: period as 'daily' | 'weekly' | 'monthly'
      };

      const exportOptions: ExportOptions = {
        format: format as 'pdf' | 'csv' | 'json',
        include_charts,
        include_insights,
        date_range: timeRange
      };

      // Generate the report first
      const report = await ReportsController.performanceReportingService.generatePerformanceReport(
        brandId,
        timeRange
      );

      // Export in requested format
      const exportResult = await ReportsController.performanceReportingService.exportReport(
        report,
        exportOptions
      );

      // Set appropriate headers for file download
      res.setHeader('Content-Type', exportResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      
      if (format === 'json') {
        res.json(JSON.parse(exportResult.data as string));
      } else {
        res.send(exportResult.data);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({
            error: 'Brand not found',
            message: error.message
          });
          return;
        }

        if (error.message.includes('Unsupported export format')) {
          res.status(400).json({
            error: 'Invalid format',
            message: error.message
          });
          return;
        }
      }

      console.error('Failed to export report:', error);
      res.status(500).json({
        error: 'Export failed',
        message: 'Internal server error during report export'
      });
    }
  }

  /**
   * Get available report periods and formats
   */
  static async getReportOptions(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        periods: ['daily', 'weekly', 'monthly'],
        formats: ['json', 'csv', 'pdf'],
        default_period: 'daily',
        default_format: 'json',
        max_date_range_days: {
          daily: 90,
          weekly: 365,
          monthly: 730
        }
      });
    } catch (error) {
      console.error('Failed to get report options:', error);
      res.status(500).json({
        error: 'Failed to get options',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get report summary for dashboard
   */
  static async getReportSummary(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

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

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const timeRange: ReportTimeRange = {
        start_date: startDate,
        end_date: endDate,
        period: 'daily'
      };

      const report = await ReportsController.performanceReportingService.generatePerformanceReport(
        brandId,
        timeRange
      );

      // Return summarized version for dashboard
      res.json({
        brand_id: brandId,
        period_days: days,
        summary_metrics: report.summary_metrics,
        latest_insights: report.insights.slice(0, 3), // Top 3 insights
        key_recommendations: report.recommendations.slice(0, 3), // Top 3 recommendations
        data_points_count: report.chart_data.length,
        generated_at: report.generated_at
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: 'Brand not found',
          message: error.message
        });
        return;
      }

      console.error('Failed to get report summary:', error);
      res.status(500).json({
        error: 'Failed to get summary',
        message: 'Internal server error'
      });
    }
  }
}