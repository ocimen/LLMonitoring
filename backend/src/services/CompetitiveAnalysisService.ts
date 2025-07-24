import { query } from '../config/database';
import { VisibilityMetrics } from '../types/database';
import { AIModelManager } from './ai/AIModelManager';

export interface CompetitorComparison {
  brand_id: string;
  brand_name: string;
  competitor_name: string;
  comparison_period: {
    start_date: Date;
    end_date: Date;
  };
  metrics_comparison: {
    overall_score: {
      brand: number;
      competitor: number;
      difference: number;
      advantage: 'brand' | 'competitor' | 'neutral';
    };
    mention_frequency: {
      brand: number;
      competitor: number;
      difference: number;
      advantage: 'brand' | 'competitor' | 'neutral';
    };
    sentiment_score: {
      brand: number;
      competitor: number;
      difference: number;
      advantage: 'brand' | 'competitor' | 'neutral';
    };
    ranking_position: {
      brand: number;
      competitor: number;
      difference: number;
      advantage: 'brand' | 'competitor' | 'neutral';
    };
  };
  market_share_analysis: {
    brand_share: number;
    competitor_share: number;
    total_mentions: number;
    brand_dominance: 'leading' | 'competitive' | 'trailing';
  };
  competitive_gaps: CompetitiveGap[];
  recommendations: string[];
  generated_at: Date;
}

export interface CompetitiveGap {
  category: 'visibility' | 'sentiment' | 'ranking' | 'mentions';
  gap_size: 'small' | 'medium' | 'large';
  description: string;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface MarketPositioning {
  brand_id: string;
  brand_name: string;
  analysis_period: {
    start_date: Date;
    end_date: Date;
  };
  market_position: {
    rank: number;
    total_competitors: number;
    percentile: number;
    position_category: 'leader' | 'challenger' | 'follower' | 'niche';
  };
  competitive_landscape: {
    competitor_name: string;
    relative_position: number;
    score_difference: number;
    market_share: number;
  }[];
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  generated_at: Date;
}

// Legacy interfaces for backward compatibility
export interface CompetitorData {
  brand_id: string;
  brand_name: string;
  overall_score: number;
  mention_frequency: number;
  sentiment_score: number;
  ranking_position: number;
  citation_count: number;
  market_share_estimate: number;
  visibility_trend: 'up' | 'down' | 'stable';
  last_updated: Date;
}

export interface MarketPosition {
  brand_id: string;
  brand_name: string;
  market_rank: number;
  total_competitors: number;
  percentile: number;
  category: 'leader' | 'challenger' | 'follower' | 'niche';
}

export interface CompetitiveAnalysisResult {
  brand: CompetitorData;
  competitors: CompetitorData[];
  market_position: MarketPosition;
  competitive_gaps: CompetitiveGap[];
  market_insights: string[];
  strategic_recommendations: string[];
  analysis_date: Date;
}

export class CompetitiveAnalysisService {
  private aiModelManager: AIModelManager;

  constructor() {
    this.aiModelManager = new AIModelManager();
  }

  /**
   * Compare a brand against a specific competitor
   */
  async compareBrandWithCompetitor(
    brandId: string,
    competitorName: string,
    startDate: Date,
    endDate: Date
  ): Promise<CompetitorComparison> {
    try {
      // Get brand information
      const brandResult = await query(
        'SELECT id, name FROM brands WHERE id = $1',
        [brandId]
      );

      if (brandResult.rows.length === 0) {
        throw new Error(`Brand with ID ${brandId} not found`);
      }

      const brand = brandResult.rows[0];

      // Get brand metrics for the period
      const brandMetrics = await this.getBrandMetrics(brandId, startDate, endDate);
      
      // Get competitor metrics by analyzing AI responses
      const competitorMetrics = await this.getCompetitorMetrics(
        competitorName,
        startDate,
        endDate
      );

      // Calculate metrics comparison
      const metricsComparison = this.calculateMetricsComparison(
        brandMetrics,
        competitorMetrics
      );

      // Calculate market share analysis
      const marketShareAnalysis = this.calculateMarketShare(
        brandMetrics,
        competitorMetrics,
        brand.name,
        competitorName
      );

      // Identify competitive gaps
      const competitiveGaps = this.identifyCompetitiveGaps(
        metricsComparison,
        marketShareAnalysis
      );

      // Generate recommendations
      const recommendations = await this.generateCompetitiveRecommendations(
        brand.name,
        competitorName,
        metricsComparison,
        competitiveGaps
      );

      return {
        brand_id: brandId,
        brand_name: brand.name,
        competitor_name: competitorName,
        comparison_period: {
          start_date: startDate,
          end_date: endDate
        },
        metrics_comparison: metricsComparison,
        market_share_analysis: marketShareAnalysis,
        competitive_gaps: competitiveGaps,
        recommendations,
        generated_at: new Date()
      };
    } catch (error) {
      console.error(`Failed to compare brand ${brandId} with competitor ${competitorName}:`, error);
      throw error;
    }
  }

  /**
   * Analyze market positioning for a brand against multiple competitors
   */
  async analyzeMarketPositioning(
    brandId: string,
    competitors: string[],
    startDate: Date,
    endDate: Date
  ): Promise<MarketPositioning> {
    try {
      // Get brand information
      const brandResult = await query(
        'SELECT id, name FROM brands WHERE id = $1',
        [brandId]
      );

      if (brandResult.rows.length === 0) {
        throw new Error(`Brand with ID ${brandId} not found`);
      }

      const brand = brandResult.rows[0];

      // Get brand metrics
      const brandMetrics = await this.getBrandMetrics(brandId, startDate, endDate);
      const brandScore = this.calculateOverallScore(brandMetrics);

      // Get competitor metrics and scores
      const competitorData: Array<{
        name: string;
        score: number;
        metrics: VisibilityMetrics[];
      }> = [];
      for (const competitorName of competitors) {
        const competitorMetrics = await this.getCompetitorMetrics(
          competitorName,
          startDate,
          endDate
        );
        const competitorScore = this.calculateOverallScore(competitorMetrics);
        
        competitorData.push({
          name: competitorName,
          score: competitorScore,
          metrics: competitorMetrics
        });
      }

      // Calculate market positioning
      const allScores = [brandScore, ...competitorData.map(c => c.score)];
      allScores.sort((a, b) => b - a); // Sort descending
      
      const brandRank = allScores.indexOf(brandScore) + 1;
      const totalCompetitors = competitors.length + 1;
      const percentile = ((totalCompetitors - brandRank + 1) / totalCompetitors) * 100;
      
      let positionCategory: 'leader' | 'challenger' | 'follower' | 'niche';
      if (percentile >= 75) positionCategory = 'leader';
      else if (percentile >= 50) positionCategory = 'challenger';
      else if (percentile >= 25) positionCategory = 'follower';
      else positionCategory = 'niche';

      // Build competitive landscape
      const competitiveLandscape = competitorData.map(competitor => ({
        competitor_name: competitor.name,
        relative_position: allScores.indexOf(competitor.score) + 1,
        score_difference: competitor.score - brandScore,
        market_share: this.calculateMarketSharePercentage(
          competitor.metrics,
          brandMetrics,
          competitorData.map(c => c.metrics)
        )
      }));

      // Generate SWOT analysis
      const swotAnalysis = await this.generateSWOTAnalysis(
        brand.name,
        brandMetrics,
        competitorData,
        positionCategory
      );

      return {
        brand_id: brandId,
        brand_name: brand.name,
        analysis_period: {
          start_date: startDate,
          end_date: endDate
        },
        market_position: {
          rank: brandRank,
          total_competitors: totalCompetitors,
          percentile,
          position_category: positionCategory
        },
        competitive_landscape: competitiveLandscape,
        strengths: swotAnalysis.strengths,
        weaknesses: swotAnalysis.weaknesses,
        opportunities: swotAnalysis.opportunities,
        threats: swotAnalysis.threats,
        generated_at: new Date()
      };
    } catch (error) {
      console.error(`Failed to analyze market positioning for brand ${brandId}:`, error);
      throw error;
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async analyzeCompetitivePosition(
    brandId: string,
    competitors: string[],
    timeframeDays: number
  ): Promise<CompetitiveAnalysisResult> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframeDays);

    // Get brand information
    const brandResult = await query(
      'SELECT id, name FROM brands WHERE id = $1',
      [brandId]
    );

    if (brandResult.rows.length === 0) {
      throw new Error(`Brand with ID ${brandId} not found`);
    }

    const brand = brandResult.rows[0];
    const brandMetrics = await this.getBrandMetrics(brandId, startDate, endDate);
    const brandAvg = this.calculateAverageMetrics(brandMetrics);

    // Convert to legacy format
    const brandData: CompetitorData = {
      brand_id: brandId,
      brand_name: brand.name,
      overall_score: brandAvg.overall_score,
      mention_frequency: brandAvg.mention_frequency,
      sentiment_score: brandAvg.average_sentiment,
      ranking_position: brandAvg.ranking_position,
      citation_count: brandAvg.citation_count,
      market_share_estimate: 0, // Will be calculated
      visibility_trend: 'stable',
      last_updated: new Date()
    };

    // Get competitor data
    const competitorDataList: CompetitorData[] = [];
    for (const competitorName of competitors) {
      const competitorMetrics = await this.getCompetitorMetrics(competitorName, startDate, endDate);
      const competitorAvg = this.calculateAverageMetrics(competitorMetrics);
      
      competitorDataList.push({
        brand_id: 'competitor',
        brand_name: competitorName,
        overall_score: competitorAvg.overall_score,
        mention_frequency: competitorAvg.mention_frequency,
        sentiment_score: competitorAvg.average_sentiment,
        ranking_position: competitorAvg.ranking_position,
        citation_count: competitorAvg.citation_count,
        market_share_estimate: 0,
        visibility_trend: 'stable',
        last_updated: new Date()
      });
    }

    // Calculate market position
    const allScores = [brandData.overall_score, ...competitorDataList.map(c => c.overall_score)];
    allScores.sort((a, b) => b - a);
    const brandRank = allScores.indexOf(brandData.overall_score) + 1;
    const totalCompetitors = competitors.length + 1;
    const percentile = ((totalCompetitors - brandRank + 1) / totalCompetitors) * 100;

    let category: 'leader' | 'challenger' | 'follower' | 'niche';
    if (percentile >= 75) category = 'leader';
    else if (percentile >= 50) category = 'challenger';
    else if (percentile >= 25) category = 'follower';
    else category = 'niche';

    const marketPosition: MarketPosition = {
      brand_id: brandId,
      brand_name: brand.name,
      market_rank: brandRank,
      total_competitors: totalCompetitors,
      percentile,
      category
    };

    // Generate competitive gaps
    const competitiveGaps: CompetitiveGap[] = [];
    const competitorAvgScore = competitorDataList.reduce((sum, c) => sum + c.overall_score, 0) / competitorDataList.length;
    
    if (brandData.overall_score < competitorAvgScore) {
      const gap = competitorAvgScore - brandData.overall_score;
      competitiveGaps.push({
        category: 'visibility',
        gap_size: gap > 20 ? 'large' : gap > 10 ? 'medium' : 'small',
        description: `Overall visibility score is ${gap.toFixed(1)} points behind competitor average`,
        impact: gap > 20 ? 'high' : gap > 10 ? 'medium' : 'low',
        recommendation: 'Increase content marketing and thought leadership initiatives'
      });
    }

    return {
      brand: brandData,
      competitors: competitorDataList,
      market_position: marketPosition,
      competitive_gaps: competitiveGaps,
      market_insights: ['Market analysis completed'],
      strategic_recommendations: ['Focus on improving visibility metrics'],
      analysis_date: new Date()
    };
  }

  /**
   * Get brand metrics for a specific period
   */
  private async getBrandMetrics(
    brandId: string,
    startDate: Date,
    endDate: Date
  ): Promise<VisibilityMetrics[]> {
    const result = await query(
      `SELECT * FROM visibility_metrics 
       WHERE brand_id = $1 
         AND metric_date >= $2 
         AND metric_date <= $3
       ORDER BY metric_date DESC`,
      [brandId, startDate, endDate]
    );

    return result.rows as VisibilityMetrics[];
  }

  /**
   * Get competitor metrics by analyzing AI responses
   */
  private async getCompetitorMetrics(
    competitorName: string,
    startDate: Date,
    endDate: Date
  ): Promise<VisibilityMetrics[]> {
    // Get AI responses that mention the competitor
    const result = await query(
      `SELECT ar.* FROM ai_responses ar
       JOIN citations c ON ar.id = c.response_id
       WHERE ar.response_text ILIKE $1
         AND ar.created_at >= $2
         AND ar.created_at <= $3
       ORDER BY ar.created_at DESC`,
      [`%${competitorName}%`, startDate, endDate]
    );

    const aiResponses = result.rows;
    
    // Analyze competitor mentions and calculate synthetic metrics
    const syntheticMetrics: VisibilityMetrics[] = [];
    
    for (const response of aiResponses) {
      const metrics = await this.analyzeMentionForMetrics(
        response,
        competitorName
      );
      if (metrics) {
        syntheticMetrics.push(metrics);
      }
    }

    return syntheticMetrics;
  }

  /**
   * Analyze a mention to extract synthetic metrics
   */
  private async analyzeMentionForMetrics(
    aiResponse: any,
    competitorName: string
  ): Promise<VisibilityMetrics | null> {
    try {
      const aiModel = this.aiModelManager.getModel();
      
      if (!aiModel) {
        throw new Error('No AI model available');
      }
      
      const analysisPrompt = `
Analyze this AI response for mentions of "${competitorName}" and provide metrics:

Response: ${aiResponse.response_text}

Provide a JSON response with these metrics (0-100 scale):
{
  "overall_score": number,
  "ranking_position": number (1-10, where 1 is best),
  "mention_frequency": number,
  "sentiment_score": number (-1 to 1, where 1 is most positive),
  "citation_quality": number
}
`;

      const analysisResult = await aiModel.query({
        id: `competitor-analysis-${Date.now()}`,
        brand_id: 'competitor',
        query: analysisPrompt
      });
      const metrics = JSON.parse(analysisResult.response);

      return {
        id: `synthetic-${Date.now()}-${Math.random()}`,
        brand_id: 'competitor',
        metric_date: new Date(aiResponse.created_at),
        metric_hour: new Date(aiResponse.created_at).getHours(),
        overall_score: metrics.overall_score,
        ranking_position: metrics.ranking_position,
        mention_frequency: metrics.mention_frequency,
        average_sentiment: metrics.sentiment_score,
        citation_count: 1,
        source_quality_score: metrics.citation_quality,
        query_category: aiResponse.query_type || 'general',
        created_at: new Date(aiResponse.created_at)
      };
    } catch (error) {
      console.error('Failed to analyze mention for metrics:', error);
      return null;
    }
  }

  /**
   * Calculate metrics comparison between brand and competitor
   */
  private calculateMetricsComparison(
    brandMetrics: VisibilityMetrics[],
    competitorMetrics: VisibilityMetrics[]
  ) {
    const brandAvg = this.calculateAverageMetrics(brandMetrics);
    const competitorAvg = this.calculateAverageMetrics(competitorMetrics);

    return {
      overall_score: {
        brand: brandAvg.overall_score,
        competitor: competitorAvg.overall_score,
        difference: brandAvg.overall_score - competitorAvg.overall_score,
        advantage: this.determineAdvantage(
          brandAvg.overall_score,
          competitorAvg.overall_score
        )
      },
      mention_frequency: {
        brand: brandAvg.mention_frequency,
        competitor: competitorAvg.mention_frequency,
        difference: brandAvg.mention_frequency - competitorAvg.mention_frequency,
        advantage: this.determineAdvantage(
          brandAvg.mention_frequency,
          competitorAvg.mention_frequency
        )
      },
      sentiment_score: {
        brand: brandAvg.average_sentiment,
        competitor: competitorAvg.average_sentiment,
        difference: brandAvg.average_sentiment - competitorAvg.average_sentiment,
        advantage: this.determineAdvantage(
          brandAvg.average_sentiment,
          competitorAvg.average_sentiment
        )
      },
      ranking_position: {
        brand: brandAvg.ranking_position,
        competitor: competitorAvg.ranking_position,
        difference: competitorAvg.ranking_position - brandAvg.ranking_position, // Lower is better for ranking
        advantage: this.determineAdvantage(
          competitorAvg.ranking_position,
          brandAvg.ranking_position
        )
      }
    };
  }

  /**
   * Calculate average metrics from an array of metrics
   */
  private calculateAverageMetrics(metrics: VisibilityMetrics[]) {
    if (metrics.length === 0) {
      return {
        overall_score: 0,
        ranking_position: 10,
        mention_frequency: 0,
        average_sentiment: 0,
        citation_count: 0,
        source_quality_score: 0
      };
    }

    const totals = metrics.reduce(
      (acc, metric) => ({
        overall_score: acc.overall_score + (metric.overall_score || 0),
        ranking_position: acc.ranking_position + (metric.ranking_position || 0),
        mention_frequency: acc.mention_frequency + (metric.mention_frequency || 0),
        average_sentiment: acc.average_sentiment + (metric.average_sentiment || 0),
        citation_count: acc.citation_count + (metric.citation_count || 0),
        source_quality_score: acc.source_quality_score + (metric.source_quality_score || 0)
      }),
      {
        overall_score: 0,
        ranking_position: 0,
        mention_frequency: 0,
        average_sentiment: 0,
        citation_count: 0,
        source_quality_score: 0
      }
    );

    const count = metrics.length;
    return {
      overall_score: totals.overall_score / count,
      ranking_position: totals.ranking_position / count,
      mention_frequency: totals.mention_frequency / count,
      average_sentiment: totals.average_sentiment / count,
      citation_count: totals.citation_count / count,
      source_quality_score: totals.source_quality_score / count
    };
  }

  /**
   * Calculate overall score from metrics
   */
  private calculateOverallScore(metrics: VisibilityMetrics[]): number {
    const avgMetrics = this.calculateAverageMetrics(metrics);
    
    // Weighted score calculation
    const weights = {
      overall_score: 0.3,
      mention_frequency: 0.25,
      sentiment: 0.2,
      ranking: 0.15,
      quality: 0.1
    };

    const normalizedRanking = Math.max(0, (11 - avgMetrics.ranking_position) * 10); // Convert ranking to 0-100 scale
    const normalizedSentiment = (avgMetrics.average_sentiment + 1) * 50; // Convert -1 to 1 scale to 0-100

    return (
      avgMetrics.overall_score * weights.overall_score +
      avgMetrics.mention_frequency * weights.mention_frequency +
      normalizedSentiment * weights.sentiment +
      normalizedRanking * weights.ranking +
      avgMetrics.source_quality_score * weights.quality
    );
  }

  /**
   * Determine advantage between two values
   */
  private determineAdvantage(
    value1: number,
    value2: number
  ): 'brand' | 'competitor' | 'neutral' {
    const difference = Math.abs(value1 - value2);
    const threshold = Math.max(value1, value2) * 0.05; // 5% threshold

    if (difference < threshold) return 'neutral';
    return value1 > value2 ? 'brand' : 'competitor';
  }

  /**
   * Calculate market share analysis
   */
  private calculateMarketShare(
    brandMetrics: VisibilityMetrics[],
    competitorMetrics: VisibilityMetrics[],
    brandName: string,
    competitorName: string
  ) {
    const brandMentions = brandMetrics.reduce(
      (sum, metric) => sum + metric.mention_frequency,
      0
    );
    const competitorMentions = competitorMetrics.reduce(
      (sum, metric) => sum + metric.mention_frequency,
      0
    );
    const totalMentions = brandMentions + competitorMentions;

    const brandShare = totalMentions > 0 ? (brandMentions / totalMentions) * 100 : 0;
    const competitorShare = totalMentions > 0 ? (competitorMentions / totalMentions) * 100 : 0;

    let brandDominance: 'leading' | 'competitive' | 'trailing';
    if (brandShare > competitorShare * 1.2) brandDominance = 'leading';
    else if (brandShare < competitorShare * 0.8) brandDominance = 'trailing';
    else brandDominance = 'competitive';

    return {
      brand_share: brandShare,
      competitor_share: competitorShare,
      total_mentions: totalMentions,
      brand_dominance: brandDominance
    };
  }

  /**
   * Calculate market share percentage for a competitor
   */
  private calculateMarketSharePercentage(
    competitorMetrics: VisibilityMetrics[],
    brandMetrics: VisibilityMetrics[],
    allCompetitorMetrics: VisibilityMetrics[][]
  ): number {
    const competitorMentions = competitorMetrics.reduce(
      (sum, metric) => sum + metric.mention_frequency,
      0
    );
    
    const brandMentions = brandMetrics.reduce(
      (sum, metric) => sum + metric.mention_frequency,
      0
    );
    
    const totalCompetitorMentions = allCompetitorMetrics.reduce(
      (total, metrics) => total + metrics.reduce(
        (sum, metric) => sum + metric.mention_frequency,
        0
      ),
      0
    );

    const totalMentions = brandMentions + totalCompetitorMentions;
    return totalMentions > 0 ? (competitorMentions / totalMentions) * 100 : 0;
  }

  /**
   * Identify competitive gaps
   */
  private identifyCompetitiveGaps(
    metricsComparison: any,
    marketShareAnalysis: any
  ): CompetitiveGap[] {
    const gaps: CompetitiveGap[] = [];

    // Check visibility gap
    if (metricsComparison.overall_score.advantage === 'competitor') {
      const gapSize = this.determineGapSize(Math.abs(metricsComparison.overall_score.difference));
      gaps.push({
        category: 'visibility',
        gap_size: gapSize,
        description: `Overall visibility score is ${Math.abs(metricsComparison.overall_score.difference).toFixed(1)} points behind competitor`,
        impact: gapSize === 'large' ? 'high' : gapSize === 'medium' ? 'medium' : 'low',
        recommendation: 'Increase content marketing and thought leadership initiatives'
      });
    }

    // Check sentiment gap
    if (metricsComparison.sentiment_score.advantage === 'competitor') {
      const gapSize = this.determineGapSize(Math.abs(metricsComparison.sentiment_score.difference) * 100);
      gaps.push({
        category: 'sentiment',
        gap_size: gapSize,
        description: `Sentiment score is ${(Math.abs(metricsComparison.sentiment_score.difference) * 100).toFixed(1)}% behind competitor`,
        impact: gapSize === 'large' ? 'high' : gapSize === 'medium' ? 'medium' : 'low',
        recommendation: 'Focus on customer satisfaction and positive brand messaging'
      });
    }

    // Check ranking gap
    if (metricsComparison.ranking_position.advantage === 'competitor') {
      const gapSize = this.determineGapSize(Math.abs(metricsComparison.ranking_position.difference) * 10);
      gaps.push({
        category: 'ranking',
        gap_size: gapSize,
        description: `Average ranking position is ${Math.abs(metricsComparison.ranking_position.difference).toFixed(1)} positions behind competitor`,
        impact: gapSize === 'large' ? 'high' : gapSize === 'medium' ? 'medium' : 'low',
        recommendation: 'Improve SEO and content relevance for better search rankings'
      });
    }

    // Check mentions gap
    if (metricsComparison.mention_frequency.advantage === 'competitor') {
      const gapSize = this.determineGapSize(Math.abs(metricsComparison.mention_frequency.difference));
      gaps.push({
        category: 'mentions',
        gap_size: gapSize,
        description: `Mention frequency is ${Math.abs(metricsComparison.mention_frequency.difference).toFixed(1)} mentions behind competitor`,
        impact: gapSize === 'large' ? 'high' : gapSize === 'medium' ? 'medium' : 'low',
        recommendation: 'Increase brand awareness campaigns and PR activities'
      });
    }

    return gaps;
  }

  /**
   * Determine gap size based on difference value
   */
  private determineGapSize(difference: number): 'small' | 'medium' | 'large' {
    if (difference < 10) return 'small';
    if (difference < 25) return 'medium';
    return 'large';
  }

  /**
   * Generate competitive recommendations using AI
   */
  private async generateCompetitiveRecommendations(
    brandName: string,
    competitorName: string,
    metricsComparison: any,
    competitiveGaps: CompetitiveGap[]
  ): Promise<string[]> {
    try {
      const aiModel = this.aiModelManager.getModel();
      
      if (!aiModel) {
        throw new Error('No AI model available');
      }
      
      const prompt = `
As a brand strategy expert, analyze this competitive comparison and provide 5 specific, actionable recommendations for ${brandName} to improve against ${competitorName}.

Metrics Comparison:
- Overall Score: ${brandName} ${metricsComparison.overall_score.brand.toFixed(1)} vs ${competitorName} ${metricsComparison.overall_score.competitor.toFixed(1)}
- Mentions: ${brandName} ${metricsComparison.mention_frequency.brand.toFixed(1)} vs ${competitorName} ${metricsComparison.mention_frequency.competitor.toFixed(1)}
- Sentiment: ${brandName} ${metricsComparison.sentiment_score.brand.toFixed(2)} vs ${competitorName} ${metricsComparison.sentiment_score.competitor.toFixed(2)}
- Ranking: ${brandName} ${metricsComparison.ranking_position.brand.toFixed(1)} vs ${competitorName} ${metricsComparison.ranking_position.competitor.toFixed(1)}

Identified Gaps:
${competitiveGaps.map(gap => `- ${gap.category}: ${gap.description}`).join('\n')}

Provide recommendations as a JSON array of strings:
["recommendation 1", "recommendation 2", ...]
`;

      const result = await aiModel.query({
        id: `competitive-recommendations-${Date.now()}`,
        brand_id: brandName,
        query: prompt
      });
      return JSON.parse(result.response);
    } catch (error) {
      console.error('Failed to generate competitive recommendations:', error);
      return [
        'Increase content marketing efforts to improve visibility',
        'Focus on customer satisfaction to enhance sentiment',
        'Optimize SEO strategy for better search rankings',
        'Expand PR and media outreach activities',
        'Monitor competitor strategies and adapt accordingly'
      ];
    }
  }

  /**
   * Generate SWOT analysis using AI
   */
  private async generateSWOTAnalysis(
    brandName: string,
    brandMetrics: VisibilityMetrics[],
    competitorData: any[],
    positionCategory: string
  ): Promise<{
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  }> {
    try {
      const aiModel = this.aiModelManager.getModel();
      
      if (!aiModel) {
        throw new Error('No AI model available');
      }
      
      const avgMetrics = this.calculateAverageMetrics(brandMetrics);
      const competitorScores = competitorData.map(c => c.score);
      
      const prompt = `
As a strategic analyst, perform a SWOT analysis for ${brandName} based on their market position and competitive landscape.

Brand Performance:
- Overall Score: ${avgMetrics.overall_score.toFixed(1)}
- Market Position: ${positionCategory}
- Mention Frequency: ${avgMetrics.mention_frequency.toFixed(1)}
- Sentiment Score: ${avgMetrics.average_sentiment.toFixed(2)}
- Ranking Position: ${avgMetrics.ranking_position.toFixed(1)}

Competitor Scores: ${competitorScores.map(s => s.toFixed(1)).join(', ')}

Provide a SWOT analysis as JSON:
{
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2", "weakness 3"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "threats": ["threat 1", "threat 2", "threat 3"]
}
`;

      const result = await aiModel.query({
        id: `swot-analysis-${Date.now()}`,
        brand_id: brandName,
        query: prompt
      });
      return JSON.parse(result.response);
    } catch (error) {
      console.error('Failed to generate SWOT analysis:', error);
      return {
        strengths: ['Strong brand recognition', 'Quality products/services', 'Customer loyalty'],
        weaknesses: ['Limited market presence', 'Lower visibility', 'Competitive disadvantage'],
        opportunities: ['Market expansion', 'Digital transformation', 'Strategic partnerships'],
        threats: ['Increased competition', 'Market saturation', 'Economic uncertainty']
      };
    }
  }
}