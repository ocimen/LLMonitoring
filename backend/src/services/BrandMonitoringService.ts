import { AIModelManager } from './ai/AIModelManager';
import { BrandModel } from '../models/Brand';
import { AIResponseModel } from '../models/AIResponse';
import { query } from '../config/database';
import { BrandMonitoringQuery, BRAND_QUERY_TEMPLATES } from '../types/ai';
import { Brand, VisibilityMetrics, CreateVisibilityMetricsInput } from '../types/database';

export interface VisibilityScore {
  overall_score: number;
  mention_frequency: number;
  sentiment_score: number;
  citation_quality: number;
  ranking_position: number;
  confidence: number;
}

export interface BrandMonitoringResult {
  brand_id: string;
  visibility_score: VisibilityScore;
  ai_responses: any[];
  citations: any[];
  mentions: any[];
  timestamp: Date;
}

export class BrandMonitoringService {
  private aiModelManager: AIModelManager;

  constructor() {
    this.aiModelManager = new AIModelManager();
  }

  /**
   * Execute comprehensive brand monitoring for a specific brand
   */
  async monitorBrand(brandId: string, queryTypes?: string[]): Promise<BrandMonitoringResult> {
    const brand = await BrandModel.findById(brandId);
    if (!brand) {
      throw new Error(`Brand with ID ${brandId} not found`);
    }

    // Default query types for comprehensive monitoring
    const defaultQueryTypes = ['visibility', 'sentiment', 'reputation', 'news'];
    const queries = queryTypes || defaultQueryTypes;

    // Generate monitoring queries for the brand
    const brandQueries = this.generateBrandQueries(brand, queries);

    // Execute queries across multiple AI models
    const responses = [];
    const allCitations = [];
    const allMentions = [];

    for (const brandQuery of brandQueries) {
      try {
        const result = await this.aiModelManager.executeBrandMonitoring(brandQuery);
        
        // Store AI responses in database
        for (const response of result.responses) {
          const createData: any = {
            brand_id: brandId,
            ai_model_id: response.model_name, // This should be the actual model ID
            query: response.query_id,
            response: response.response,
            processing_time_ms: response.processing_time_ms,
            tokens_used: response.usage.total_tokens,
            cost: response.cost
          };

          // Only add optional properties if they have values
          if (response.metadata) {
            createData.response_metadata = response.metadata;
          }
          if (response.confidence_score !== undefined) {
            createData.confidence_score = response.confidence_score;
          }

          const storedResponse = await AIResponseModel.create(createData);

          responses.push(storedResponse);
        }

        // Collect parsed data
        for (const parsed of result.parsed_responses) {
          allCitations.push(...parsed.citations);
          allMentions.push(...parsed.brand_mentions);
        }
      } catch (error) {
        console.error(`Failed to execute brand query for ${brand.name}:`, error);
      }
    }

    // Calculate visibility score
    const visibilityScore = await this.calculateVisibilityScore(
      brand,
      responses,
      allCitations,
      allMentions
    );

    // Store visibility metrics
    await this.storeVisibilityMetrics(brandId, visibilityScore);

    return {
      brand_id: brandId,
      visibility_score: visibilityScore,
      ai_responses: responses,
      citations: allCitations,
      mentions: allMentions,
      timestamp: new Date()
    };
  }

  /**
   * Generate brand monitoring queries based on brand data and query types
   */
  private generateBrandQueries(brand: Brand, queryTypes: string[]): BrandMonitoringQuery[] {
    const queries: BrandMonitoringQuery[] = [];

    for (const queryType of queryTypes) {
      if (queryType in BRAND_QUERY_TEMPLATES) {
        const query: BrandMonitoringQuery = {
          brand_name: brand.name,
          query_type: queryType as any,
          query_template: BRAND_QUERY_TEMPLATES[queryType as keyof typeof BRAND_QUERY_TEMPLATES]
        };

        // Add optional properties only if they have values
        if (brand.industry) {
          query.context = brand.industry;
        }
        if (brand.competitor_brands.length > 0) {
          query.competitors = brand.competitor_brands;
        }
        if (brand.monitoring_keywords.length > 0) {
          query.products = brand.monitoring_keywords;
        }

        queries.push(query);
      }
    }

    return queries;
  }

  /**
   * Calculate comprehensive visibility score based on AI responses and analysis
   */
  private async calculateVisibilityScore(
    brand: Brand,
    responses: any[],
    citations: any[],
    mentions: any[]
  ): Promise<VisibilityScore> {
    if (responses.length === 0) {
      return {
        overall_score: 0,
        mention_frequency: 0,
        sentiment_score: 0,
        citation_quality: 0,
        ranking_position: 0,
        confidence: 0
      };
    }

    // Calculate mention frequency (0-100)
    const mentionFrequency = Math.min(mentions.length * 10, 100);

    // Calculate average sentiment (-1 to 1, normalized to 0-100)
    const sentimentScores = mentions
      .filter(m => m.sentiment_score !== undefined)
      .map(m => m.sentiment_score);
    
    const avgSentiment = sentimentScores.length > 0 
      ? sentimentScores.reduce((sum, score) => sum + score, 0) / sentimentScores.length
      : 0;
    
    const normalizedSentiment = ((avgSentiment + 1) / 2) * 100; // Convert -1,1 to 0,100

    // Calculate citation quality (0-100)
    const citationQuality = citations.length > 0
      ? citations.reduce((sum, citation) => {
          const authorityScore = citation.authority_score || 0.5;
          const relevanceScore = citation.relevance_score || 0.5;
          return sum + (authorityScore * relevanceScore);
        }, 0) / citations.length * 100
      : 0;

    // Calculate ranking position (simulated based on mentions and sentiment)
    const rankingPosition = this.calculateRankingPosition(mentions, avgSentiment);

    // Calculate overall confidence based on data quality
    const confidence = this.calculateConfidence(responses, mentions, citations);

    // Calculate overall score (weighted average)
    const weights = {
      mention: 0.3,
      sentiment: 0.25,
      citation: 0.25,
      ranking: 0.2
    };

    const overallScore = 
      (mentionFrequency * weights.mention) +
      (normalizedSentiment * weights.sentiment) +
      (citationQuality * weights.citation) +
      ((100 - rankingPosition) * weights.ranking); // Lower ranking position = higher score

    return {
      overall_score: Math.round(overallScore * 100) / 100,
      mention_frequency: Math.round(mentionFrequency * 100) / 100,
      sentiment_score: Math.round(normalizedSentiment * 100) / 100,
      citation_quality: Math.round(citationQuality * 100) / 100,
      ranking_position: rankingPosition,
      confidence: Math.round(confidence * 100) / 100
    };
  }

  /**
   * Calculate simulated ranking position based on mentions and sentiment
   */
  private calculateRankingPosition(mentions: any[], avgSentiment: number): number {
    // Simulated ranking algorithm
    // In a real system, this would be based on actual search result positions
    const mentionCount = mentions.length;
    const sentimentBonus = avgSentiment > 0 ? avgSentiment * 10 : 0;
    
    // Base ranking (higher mentions = better ranking)
    let position = Math.max(1, 20 - mentionCount - sentimentBonus);
    
    // Add some randomness to simulate real-world variability
    position += Math.random() * 5;
    
    return Math.max(1, Math.min(100, Math.round(position)));
  }

  /**
   * Calculate confidence score based on data quality and quantity
   */
  private calculateConfidence(responses: any[], mentions: any[], citations: any[]): number {
    let confidence = 0;

    // Base confidence from number of responses
    confidence += Math.min(responses.length * 20, 60);

    // Confidence from mentions
    confidence += Math.min(mentions.length * 5, 25);

    // Confidence from citations
    confidence += Math.min(citations.length * 3, 15);

    return Math.min(100, confidence);
  }

  /**
   * Store visibility metrics in the database
   */
  private async storeVisibilityMetrics(brandId: string, visibilityScore: VisibilityScore): Promise<void> {
    const now = new Date();
    const metricsData: CreateVisibilityMetricsInput = {
      brand_id: brandId,
      metric_date: now,
      metric_hour: now.getHours(),
      overall_score: visibilityScore.overall_score,
      ranking_position: visibilityScore.ranking_position,
      mention_frequency: visibilityScore.mention_frequency,
      average_sentiment: (visibilityScore.sentiment_score - 50) / 50, // Convert back to -1,1 range
      citation_count: 0, // Will be updated separately
      source_quality_score: visibilityScore.citation_quality / 100,
      query_category: 'comprehensive'
    };

    await query(`
      INSERT INTO visibility_metrics (
        brand_id, metric_date, metric_hour, overall_score, ranking_position,
        mention_frequency, average_sentiment, citation_count, source_quality_score,
        query_category, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (brand_id, ai_model_id, metric_date, metric_hour, geographic_region, query_category)
      DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        ranking_position = EXCLUDED.ranking_position,
        mention_frequency = EXCLUDED.mention_frequency,
        average_sentiment = EXCLUDED.average_sentiment,
        source_quality_score = EXCLUDED.source_quality_score,
        created_at = NOW()
    `, [
      metricsData.brand_id,
      metricsData.metric_date,
      metricsData.metric_hour,
      metricsData.overall_score,
      metricsData.ranking_position,
      metricsData.mention_frequency,
      metricsData.average_sentiment,
      metricsData.citation_count,
      metricsData.source_quality_score,
      metricsData.query_category
    ]);
  }

  /**
   * Get historical visibility trends for a brand
   */
  async getVisibilityTrends(
    brandId: string, 
    days: number = 30
  ): Promise<VisibilityMetrics[]> {
    const result = await query(`
      SELECT * FROM visibility_metrics
      WHERE brand_id = $1 
        AND metric_date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY metric_date DESC, metric_hour DESC
    `, [brandId]);

    return result.rows as VisibilityMetrics[];
  }

  /**
   * Compare brand visibility with competitors
   */
  async compareWithCompetitors(
    brandId: string,
    competitorNames: string[],
    days: number = 7
  ): Promise<{
    brand_metrics: VisibilityMetrics[];
    competitor_data: Array<{
      name: string;
      estimated_score: number;
      comparison: string;
    }>;
  }> {
    // Get brand's recent metrics
    const brandMetrics = await this.getVisibilityTrends(brandId, days);

    // For competitors, we'll simulate monitoring (in a real system, you'd monitor them too)
    const competitorData = [];
    
    for (const competitorName of competitorNames) {
      try {
        // Execute a quick visibility check for competitor
        const competitorQuery: BrandMonitoringQuery = {
          brand_name: competitorName,
          query_type: 'visibility',
          query_template: BRAND_QUERY_TEMPLATES.visibility
        };

        const result = await this.aiModelManager.executeBrandMonitoring(competitorQuery);
        
        // Calculate a simple estimated score
        const mentions = result.parsed_responses.flatMap(r => r.brand_mentions);
        const estimatedScore = Math.min(mentions.length * 15, 100);

        const brandAvgScore = brandMetrics.length > 0
          ? brandMetrics.reduce((sum, m) => sum + (m.overall_score || 0), 0) / brandMetrics.length
          : 0;

        let comparison = 'similar';
        if (estimatedScore > brandAvgScore + 10) comparison = 'ahead';
        else if (estimatedScore < brandAvgScore - 10) comparison = 'behind';

        competitorData.push({
          name: competitorName,
          estimated_score: estimatedScore,
          comparison
        });
      } catch (error) {
        console.error(`Failed to analyze competitor ${competitorName}:`, error);
        competitorData.push({
          name: competitorName,
          estimated_score: 0,
          comparison: 'unknown'
        });
      }
    }

    return {
      brand_metrics: brandMetrics,
      competitor_data: competitorData
    };
  }

  /**
   * Monitor multiple brands in batch
   */
  async batchMonitorBrands(brandIds: string[]): Promise<BrandMonitoringResult[]> {
    const results = [];

    for (const brandId of brandIds) {
      try {
        const result = await this.monitorBrand(brandId);
        results.push(result);
        
        // Add delay between brands to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to monitor brand ${brandId}:`, error);
      }
    }

    return results;
  }
}