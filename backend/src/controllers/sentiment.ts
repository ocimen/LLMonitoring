import { Request, Response } from 'express';
import { SentimentAnalysisService } from '../services/SentimentAnalysisService';
import { BrandModel } from '../models/Brand';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    sessionId: string;
    id: string;
    role: string;
  };
}

/**
 * Analyze sentiment of provided text
 */
export const analyzeSentiment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { text, brandName, context } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({
        error: 'Text is required and must be a string'
      });
      return;
    }

    const analysis = await SentimentAnalysisService.analyzeSentiment(
      text,
      brandName,
      context
    );

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Error analyzing sentiment:', error);
    res.status(500).json({
      error: 'Failed to analyze sentiment',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get sentiment trends for a brand
 */
export const getSentimentTrends = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { brandId } = req.params;
    const { 
      startDate, 
      endDate, 
      granularity = 'day' 
    } = req.query;

    if (!brandId) {
      res.status(400).json({
        error: 'Brand ID is required'
      });
      return;
    }

    // Verify user has access to this brand
    const brand = await BrandModel.findById(brandId);
    if (!brand) {
      res.status(404).json({
        error: 'Brand not found'
      });
      return;
    }

    // Parse dates
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({
        error: 'Invalid date format'
      });
      return;
    }

    const validGranularities = ['hour', 'day', 'week', 'month'];
    if (!validGranularities.includes(granularity as string)) {
      res.status(400).json({
        error: 'Invalid granularity. Must be one of: hour, day, week, month'
      });
      return;
    }

    const trends = await SentimentAnalysisService.analyzeSentimentTrends(
      brandId,
      start,
      end,
      granularity as 'hour' | 'day' | 'week' | 'month'
    );

    res.json({
      success: true,
      data: {
        brand_id: brandId,
        brand_name: brand.name,
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
          granularity: granularity
        },
        trends: trends
      }
    });
  } catch (error) {
    console.error('Error getting sentiment trends:', error);
    res.status(500).json({
      error: 'Failed to get sentiment trends',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get comprehensive historical sentiment analysis
 */
export const getHistoricalSentimentAnalysis = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { brandId } = req.params;
    const { startDate, endDate } = req.query;

    if (!brandId) {
      res.status(400).json({
        error: 'Brand ID is required'
      });
      return;
    }

    // Verify user has access to this brand
    const brand = await BrandModel.findById(brandId);
    if (!brand) {
      res.status(404).json({
        error: 'Brand not found'
      });
      return;
    }

    // Parse dates
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({
        error: 'Invalid date format'
      });
      return;
    }

    const analysis = await SentimentAnalysisService.getHistoricalSentimentAnalysis(
      brandId,
      start,
      end
    );

    res.json({
      success: true,
      data: {
        brand_name: brand.name,
        ...analysis
      }
    });
  } catch (error) {
    console.error('Error getting historical sentiment analysis:', error);
    res.status(500).json({
      error: 'Failed to get historical sentiment analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Update sentiment scores for existing mentions
 */
export const updateSentimentScores = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { brandId } = req.params;
    const { startDate, endDate } = req.body;

    if (!brandId) {
      res.status(400).json({
        error: 'Brand ID is required'
      });
      return;
    }

    // Verify user has access to this brand
    const brand = await BrandModel.findById(brandId);
    if (!brand) {
      res.status(404).json({
        error: 'Brand not found'
      });
      return;
    }

    // Parse dates if provided
    let start: Date | undefined;
    let end: Date | undefined;

    if (startDate) {
      start = new Date(startDate);
      if (isNaN(start.getTime())) {
        res.status(400).json({
          error: 'Invalid start date format'
        });
        return;
      }
    }

    if (endDate) {
      end = new Date(endDate);
      if (isNaN(end.getTime())) {
        res.status(400).json({
          error: 'Invalid end date format'
        });
        return;
      }
    }

    const result = await SentimentAnalysisService.updateSentimentScores(
      brandId,
      start,
      end
    );

    res.json({
      success: true,
      data: {
        brand_id: brandId,
        brand_name: brand.name,
        updated_brand_mentions: result.updated_brand_mentions,
        updated_conversation_mentions: result.updated_conversation_mentions,
        total_updated: result.updated_brand_mentions + result.updated_conversation_mentions
      }
    });
  } catch (error) {
    console.error('Error updating sentiment scores:', error);
    res.status(500).json({
      error: 'Failed to update sentiment scores',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Compare sentiment between multiple brands
 */
export const compareBrandSentiment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { brandIds, startDate, endDate } = req.body;

    if (!brandIds || !Array.isArray(brandIds) || brandIds.length === 0) {
      res.status(400).json({
        error: 'Brand IDs array is required and must not be empty'
      });
      return;
    }

    if (brandIds.length > 10) {
      res.status(400).json({
        error: 'Maximum 10 brands can be compared at once'
      });
      return;
    }

    // Parse dates
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({
        error: 'Invalid date format'
      });
      return;
    }

    // Verify all brands exist
    const brands = await Promise.all(
      brandIds.map((id: string) => BrandModel.findById(id))
    );

    const missingBrands = brandIds.filter((id: string, index: number) => !brands[index]);
    if (missingBrands.length > 0) {
      res.status(404).json({
        error: 'Some brands not found',
        missing_brand_ids: missingBrands
      });
      return;
    }

    const comparison = await SentimentAnalysisService.compareBrandSentiment(
      brandIds,
      start,
      end
    );

    res.json({
      success: true,
      data: {
        period: {
          start: start.toISOString(),
          end: end.toISOString()
        },
        comparison: comparison,
        summary: {
          total_brands: comparison.length,
          best_sentiment: comparison.reduce((best, current) => 
            current.average_sentiment > best.average_sentiment ? current : best
          ),
          worst_sentiment: comparison.reduce((worst, current) => 
            current.average_sentiment < worst.average_sentiment ? current : worst
          ),
          average_sentiment: comparison.reduce((sum, brand) => 
            sum + brand.average_sentiment, 0
          ) / comparison.length
        }
      }
    });
  } catch (error) {
    console.error('Error comparing brand sentiment:', error);
    res.status(500).json({
      error: 'Failed to compare brand sentiment',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get sentiment analysis dashboard data
 */
export const getSentimentDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { brandId } = req.params;
    const { days = 30 } = req.query;

    if (!brandId) {
      res.status(400).json({
        error: 'Brand ID is required'
      });
      return;
    }

    // Verify user has access to this brand
    const brand = await BrandModel.findById(brandId);
    if (!brand) {
      res.status(404).json({
        error: 'Brand not found'
      });
      return;
    }

    const daysNumber = parseInt(days as string, 10);
    if (isNaN(daysNumber) || daysNumber < 1 || daysNumber > 365) {
      res.status(400).json({
        error: 'Days must be a number between 1 and 365'
      });
      return;
    }

    const endDate = new Date();
    const startDate = new Date(Date.now() - daysNumber * 24 * 60 * 60 * 1000);

    // Get multiple data sets in parallel
    const [
      trends,
      historicalAnalysis,
      recentUpdate
    ] = await Promise.all([
      SentimentAnalysisService.analyzeSentimentTrends(brandId, startDate, endDate, 'day'),
      SentimentAnalysisService.getHistoricalSentimentAnalysis(brandId, startDate, endDate),
      SentimentAnalysisService.updateSentimentScores(brandId, startDate, endDate)
    ]);

    // Calculate current sentiment status
    const latestTrend = trends[trends.length - 1];
    const currentSentiment = latestTrend?.sentiment_score || 0;
    const currentLabel = currentSentiment > 0.1 ? 'positive' : 
                        currentSentiment < -0.1 ? 'negative' : 'neutral';

    // Calculate change from previous period
    const previousTrend = trends[trends.length - 2];
    const sentimentChange = previousTrend ? 
      ((currentSentiment - previousTrend.sentiment_score) / Math.abs(previousTrend.sentiment_score || 1)) * 100 : 0;

    res.json({
      success: true,
      data: {
        brand_id: brandId,
        brand_name: brand.name,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: daysNumber
        },
        current_status: {
          sentiment_score: currentSentiment,
          sentiment_label: currentLabel,
          total_mentions: latestTrend?.mention_count || 0,
          sentiment_change_percentage: sentimentChange,
          trend_direction: latestTrend?.trend_direction || 'stable'
        },
        trends: trends,
        historical_analysis: historicalAnalysis,
        recent_updates: {
          updated_mentions: recentUpdate.updated_brand_mentions + recentUpdate.updated_conversation_mentions,
          last_updated: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error getting sentiment dashboard:', error);
    res.status(500).json({
      error: 'Failed to get sentiment dashboard',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};