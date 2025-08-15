import { query } from '../config/database';
import { BrandModel } from '../models/Brand';
import { AIResponseModel } from '../models/AIResponse';
import { ConversationMonitoringService } from './ConversationMonitoringService';
import {
  BrandMention,
  ConversationMention,
  VisibilityMetrics,
  Brand,
  AIResponse
} from '../types/database';

// Sentiment analysis interfaces
export interface SentimentScore {
  score: number; // -1 to 1 scale
  label: 'positive' | 'negative' | 'neutral';
  confidence: number; // 0 to 1 scale
  aspects?: SentimentAspect[];
}

export interface SentimentAspect {
  aspect: string;
  sentiment: number;
  confidence: number;
  mentions: string[];
}

export interface PositionAnalysis {
  position_type: 'leader' | 'challenger' | 'follower' | 'niche' | 'unknown';
  context_category: 'product' | 'service' | 'company' | 'industry' | 'comparison' | 'recommendation';
  competitive_position: number; // 0 to 1 scale where 1 is best position
  market_context: string[];
  confidence: number;
}

export interface SentimentTrend {
  date: Date;
  sentiment_score: number;
  mention_count: number;
  positive_mentions: number;
  negative_mentions: number;
  neutral_mentions: number;
  trend_direction: 'improving' | 'declining' | 'stable';
  volatility: number;
}

export interface HistoricalSentimentAnalysis {
  brand_id: string;
  period_start: Date;
  period_end: Date;
  overall_trend: SentimentTrend[];
  sentiment_by_category: Record<string, SentimentTrend[]>;
  sentiment_by_model: Record<string, SentimentTrend[]>;
  key_events: Array<{
    date: Date;
    event_type: 'spike' | 'drop' | 'volatility';
    description: string;
    impact_score: number;
  }>;
  summary: {
    average_sentiment: number;
    sentiment_stability: number;
    improvement_rate: number;
    total_mentions: number;
  };
}

export interface SentimentClassificationResult {
  text: string;
  sentiment: SentimentScore;
  position: PositionAnalysis;
  entities: Array<{
    name: string;
    type: 'brand' | 'product' | 'competitor' | 'feature';
    sentiment: number;
    position: number;
  }>;
  keywords: Array<{
    word: string;
    sentiment_weight: number;
    frequency: number;
  }>;
}

export class SentimentAnalysisService {
  // Sentiment lexicons and weights
  private static readonly POSITIVE_WORDS = new Map([
    ['excellent', 0.8], ['amazing', 0.9], ['outstanding', 0.9], ['fantastic', 0.8],
    ['great', 0.6], ['good', 0.5], ['wonderful', 0.8], ['perfect', 0.9],
    ['best', 0.7], ['superior', 0.7], ['impressive', 0.6], ['remarkable', 0.7],
    ['innovative', 0.6], ['reliable', 0.5], ['trusted', 0.6], ['quality', 0.5],
    ['recommend', 0.6], ['love', 0.7], ['like', 0.4], ['satisfied', 0.5],
    ['pleased', 0.5], ['happy', 0.6], ['delighted', 0.7], ['thrilled', 0.8]
  ]);

  private static readonly NEGATIVE_WORDS = new Map([
    ['terrible', -0.8], ['awful', -0.8], ['horrible', -0.9], ['worst', -0.9],
    ['bad', -0.5], ['poor', -0.5], ['disappointing', -0.6], ['frustrating', -0.6],
    ['useless', -0.7], ['broken', -0.6], ['failed', -0.6], ['problem', -0.4],
    ['issue', -0.3], ['difficult', -0.4], ['complicated', -0.3], ['confusing', -0.4],
    ['expensive', -0.5], ['overpriced', -0.7], ['cheap', -0.4], ['unreliable', -0.6],
    ['hate', -0.8], ['dislike', -0.5], ['avoid', -0.6], ['regret', -0.6]
  ]);

  private static readonly POSITION_INDICATORS = new Map([
    ['leader', 0.9], ['leading', 0.8], ['top', 0.8], ['first', 0.8], ['best', 0.7],
    ['dominant', 0.8], ['pioneer', 0.7], ['innovative', 0.6], ['advanced', 0.6],
    ['premium', 0.6], ['superior', 0.7], ['market leader', 0.9], ['industry leader', 0.9],
    ['follower', 0.3], ['behind', 0.2], ['lagging', 0.2], ['catching up', 0.4],
    ['alternative', 0.5], ['competitor', 0.5], ['similar', 0.5], ['comparable', 0.5],
    ['niche', 0.4], ['specialized', 0.5], ['focused', 0.5], ['boutique', 0.4]
  ]);

  /**
   * Analyze sentiment of text with advanced classification
   */
  static async analyzeSentiment(
    text: string,
    brandName?: string,
    context?: string
  ): Promise<SentimentClassificationResult> {
    const cleanText = this.preprocessText(text);
    const words = this.tokenizeText(cleanText);
    
    // Calculate base sentiment score
    const baseSentiment = this.calculateBaseSentiment(words);
    
    // Analyze aspects if brand context is provided
    const aspects = brandName ? this.analyzeAspects(cleanText, brandName) : [];
    
    // Analyze position indicators
    const position = this.analyzePosition(cleanText, brandName);
    
    // Extract entities and their sentiments
    const entities = this.extractEntities(cleanText, brandName);
    
    // Extract keywords with sentiment weights
    const keywords = this.extractSentimentKeywords(words);
    
    // Apply contextual adjustments
    const adjustedSentiment = this.applyContextualAdjustments(
      baseSentiment,
      context,
      position,
      aspects
    );

    return {
      text: text,
      sentiment: {
        score: adjustedSentiment.score,
        label: adjustedSentiment.label,
        confidence: adjustedSentiment.confidence,
        aspects: aspects
      },
      position: position,
      entities: entities,
      keywords: keywords
    };
  }

  /**
   * Analyze sentiment trends over time for a brand
   */
  static async analyzeSentimentTrends(
    brandId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<SentimentTrend[]> {
    const dateFormat = this.getDateFormat(granularity);
    
    const result = await query(`
      WITH sentiment_data AS (
        SELECT 
          DATE_TRUNC('${granularity}', created_at) as period,
          sentiment_score,
          sentiment_label,
          1 as mention_count
        FROM brand_mentions bm
        JOIN ai_responses ar ON bm.ai_response_id = ar.id
        WHERE bm.brand_id = $1 
          AND ar.created_at BETWEEN $2 AND $3
          AND bm.sentiment_score IS NOT NULL
        
        UNION ALL
        
        SELECT 
          DATE_TRUNC('${granularity}', c.created_at) as period,
          cm.sentiment_score,
          cm.sentiment_label,
          1 as mention_count
        FROM conversation_mentions cm
        JOIN conversations c ON cm.conversation_id = c.id
        WHERE cm.brand_id = $1 
          AND c.created_at BETWEEN $2 AND $3
          AND cm.sentiment_score IS NOT NULL
      )
      SELECT 
        period,
        AVG(sentiment_score) as avg_sentiment,
        COUNT(*) as total_mentions,
        COUNT(CASE WHEN sentiment_label = 'positive' THEN 1 END) as positive_mentions,
        COUNT(CASE WHEN sentiment_label = 'negative' THEN 1 END) as negative_mentions,
        COUNT(CASE WHEN sentiment_label = 'neutral' THEN 1 END) as neutral_mentions,
        STDDEV(sentiment_score) as volatility
      FROM sentiment_data
      GROUP BY period
      ORDER BY period
    `, [brandId, startDate.toISOString(), endDate.toISOString()]);

    const trends: SentimentTrend[] = [];
    let previousSentiment = 0;

    for (const row of result.rows) {
      const currentSentiment = parseFloat(row.avg_sentiment) || 0;
      const trendDirection = this.calculateTrendDirection(currentSentiment, previousSentiment);
      
      trends.push({
        date: new Date(row.period),
        sentiment_score: currentSentiment,
        mention_count: parseInt(row.total_mentions),
        positive_mentions: parseInt(row.positive_mentions),
        negative_mentions: parseInt(row.negative_mentions),
        neutral_mentions: parseInt(row.neutral_mentions),
        trend_direction: trendDirection,
        volatility: parseFloat(row.volatility) || 0
      });

      previousSentiment = currentSentiment;
    }

    return trends;
  }

  /**
   * Get comprehensive historical sentiment analysis
   */
  static async getHistoricalSentimentAnalysis(
    brandId: string,
    startDate: Date,
    endDate: Date
  ): Promise<HistoricalSentimentAnalysis> {
    // Get overall trends
    const overallTrend = await this.analyzeSentimentTrends(brandId, startDate, endDate, 'day');
    
    // Get trends by category
    const sentimentByCategory = await this.getSentimentByCategory(brandId, startDate, endDate);
    
    // Get trends by AI model
    const sentimentByModel = await this.getSentimentByModel(brandId, startDate, endDate);
    
    // Detect key events
    const keyEvents = this.detectKeyEvents(overallTrend);
    
    // Calculate summary statistics
    const summary = this.calculateSentimentSummary(overallTrend);

    return {
      brand_id: brandId,
      period_start: startDate,
      period_end: endDate,
      overall_trend: overallTrend,
      sentiment_by_category: sentimentByCategory,
      sentiment_by_model: sentimentByModel,
      key_events: keyEvents,
      summary: summary
    };
  }

  /**
   * Update sentiment scores for existing mentions
   */
  static async updateSentimentScores(
    brandId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    updated_brand_mentions: number;
    updated_conversation_mentions: number;
  }> {
    let dateFilter = '';
    const params: any[] = [brandId];
    
    if (startDate && endDate) {
      dateFilter = 'AND ar.created_at BETWEEN $2 AND $3';
      params.push(startDate.toISOString(), endDate.toISOString());
    }

    // Update brand mentions
    const brandMentionsResult = await query(`
      SELECT bm.id, bm.mention_text, bm.context
      FROM brand_mentions bm
      JOIN ai_responses ar ON bm.ai_response_id = ar.id
      WHERE bm.brand_id = $1 ${dateFilter}
        AND (bm.sentiment_score IS NULL OR bm.sentiment_label IS NULL)
    `, params);

    let updatedBrandMentions = 0;
    for (const mention of brandMentionsResult.rows) {
      const analysis = await this.analyzeSentiment(
        mention.context || mention.mention_text
      );
      
      await query(`
        UPDATE brand_mentions 
        SET sentiment_score = $1, sentiment_label = $2, confidence = $3
        WHERE id = $4
      `, [
        analysis.sentiment.score,
        analysis.sentiment.label,
        analysis.sentiment.confidence,
        mention.id
      ]);
      
      updatedBrandMentions++;
    }

    // Update conversation mentions
    const conversationMentionsResult = await query(`
      SELECT cm.id, cm.mention_text, cm.mention_context
      FROM conversation_mentions cm
      JOIN conversations c ON cm.conversation_id = c.id
      WHERE cm.brand_id = $1 ${dateFilter.replace('ar.', 'c.')}
        AND (cm.sentiment_score IS NULL OR cm.sentiment_label IS NULL)
    `, params);

    let updatedConversationMentions = 0;
    for (const mention of conversationMentionsResult.rows) {
      const analysis = await this.analyzeSentiment(
        mention.mention_context || mention.mention_text
      );
      
      await query(`
        UPDATE conversation_mentions 
        SET sentiment_score = $1, sentiment_label = $2, confidence = $3
        WHERE id = $4
      `, [
        analysis.sentiment.score,
        analysis.sentiment.label,
        analysis.sentiment.confidence,
        mention.id
      ]);
      
      updatedConversationMentions++;
    }

    return {
      updated_brand_mentions: updatedBrandMentions,
      updated_conversation_mentions: updatedConversationMentions
    };
  }

  /**
   * Get sentiment comparison between brands
   */
  static async compareBrandSentiment(
    brandIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<Array<{
    brand_id: string;
    brand_name: string;
    average_sentiment: number;
    sentiment_label: 'positive' | 'negative' | 'neutral';
    total_mentions: number;
    positive_percentage: number;
    negative_percentage: number;
    neutral_percentage: number;
    sentiment_volatility: number;
  }>> {
    const result = await query(`
      WITH brand_sentiment AS (
        SELECT 
          b.id as brand_id,
          b.name as brand_name,
          bm.sentiment_score,
          bm.sentiment_label
        FROM brands b
        LEFT JOIN brand_mentions bm ON b.id = bm.brand_id
        LEFT JOIN ai_responses ar ON bm.ai_response_id = ar.id
        WHERE b.id = ANY($1)
          AND ar.created_at BETWEEN $2 AND $3
          AND bm.sentiment_score IS NOT NULL
        
        UNION ALL
        
        SELECT 
          b.id as brand_id,
          b.name as brand_name,
          cm.sentiment_score,
          cm.sentiment_label
        FROM brands b
        LEFT JOIN conversation_mentions cm ON b.id = cm.brand_id
        LEFT JOIN conversations c ON cm.conversation_id = c.id
        WHERE b.id = ANY($1)
          AND c.created_at BETWEEN $2 AND $3
          AND cm.sentiment_score IS NOT NULL
      )
      SELECT 
        brand_id,
        brand_name,
        AVG(sentiment_score) as average_sentiment,
        COUNT(*) as total_mentions,
        COUNT(CASE WHEN sentiment_label = 'positive' THEN 1 END) * 100.0 / COUNT(*) as positive_percentage,
        COUNT(CASE WHEN sentiment_label = 'negative' THEN 1 END) * 100.0 / COUNT(*) as negative_percentage,
        COUNT(CASE WHEN sentiment_label = 'neutral' THEN 1 END) * 100.0 / COUNT(*) as neutral_percentage,
        STDDEV(sentiment_score) as sentiment_volatility
      FROM brand_sentiment
      GROUP BY brand_id, brand_name
      ORDER BY average_sentiment DESC
    `, [brandIds, startDate.toISOString(), endDate.toISOString()]);

    return result.rows.map((row: any) => ({
      brand_id: row.brand_id,
      brand_name: row.brand_name,
      average_sentiment: parseFloat(row.average_sentiment) || 0,
      sentiment_label: this.getSentimentLabel(parseFloat(row.average_sentiment) || 0),
      total_mentions: parseInt(row.total_mentions) || 0,
      positive_percentage: parseFloat(row.positive_percentage) || 0,
      negative_percentage: parseFloat(row.negative_percentage) || 0,
      neutral_percentage: parseFloat(row.neutral_percentage) || 0,
      sentiment_volatility: parseFloat(row.sentiment_volatility) || 0
    }));
  }

  // Private helper methods

  private static preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static tokenizeText(text: string): string[] {
    return text.split(/\s+/).filter(word => word.length > 2);
  }

  private static calculateBaseSentiment(words: string[]): SentimentScore {
    let totalScore = 0;
    let sentimentWords = 0;
    let confidence = 0;

    for (const word of words) {
      if (this.POSITIVE_WORDS.has(word)) {
        totalScore += this.POSITIVE_WORDS.get(word)!;
        sentimentWords++;
        confidence += 0.1;
      } else if (this.NEGATIVE_WORDS.has(word)) {
        totalScore += this.NEGATIVE_WORDS.get(word)!;
        sentimentWords++;
        confidence += 0.1;
      }
    }

    const normalizedScore = sentimentWords > 0 ? totalScore / sentimentWords : 0;
    const finalConfidence = Math.min(1, confidence + (sentimentWords > 0 ? 0.3 : 0.1)); // Minimum confidence of 0.1

    return {
      score: Math.max(-1, Math.min(1, normalizedScore)),
      label: this.getSentimentLabel(normalizedScore),
      confidence: finalConfidence
    };
  }

  private static getSentimentLabel(score: number): 'positive' | 'negative' | 'neutral' {
    if (score > 0.1) return 'positive';
    if (score < -0.1) return 'negative';
    return 'neutral';
  }

  private static analyzeAspects(text: string, brandName: string): SentimentAspect[] {
    const aspects: SentimentAspect[] = [];
    const aspectKeywords = {
      'product': ['product', 'item', 'goods', 'merchandise'],
      'service': ['service', 'support', 'help', 'assistance'],
      'quality': ['quality', 'build', 'construction', 'materials'],
      'price': ['price', 'cost', 'expensive', 'cheap', 'affordable'],
      'usability': ['easy', 'difficult', 'user-friendly', 'intuitive'],
      'performance': ['fast', 'slow', 'efficient', 'performance']
    };

    for (const [aspect, keywords] of Object.entries(aspectKeywords)) {
      const mentions: string[] = [];
      let aspectSentiment = 0;
      let aspectMentions = 0;

      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          mentions.push(keyword);
          // Get context around the keyword for sentiment analysis
          const keywordIndex = text.indexOf(keyword);
          const contextStart = Math.max(0, keywordIndex - 50);
          const contextEnd = Math.min(text.length, keywordIndex + 50);
          const context = text.substring(contextStart, contextEnd);
          
          let contextSentiment = this.calculateBaseSentiment(
            this.tokenizeText(context)
          ).score;

          // Special handling for price aspect - "expensive" should be negative
          if (aspect === 'price' && keyword === 'expensive') {
            contextSentiment = -0.5;
          }
          
          aspectSentiment += contextSentiment;
          aspectMentions++;
        }
      }

      if (aspectMentions > 0) {
        aspects.push({
          aspect: aspect,
          sentiment: aspectSentiment / aspectMentions,
          confidence: Math.min(1, aspectMentions * 0.3),
          mentions: mentions
        });
      }
    }

    return aspects;
  }

  private static analyzePosition(text: string, brandName?: string): PositionAnalysis {
    let positionScore = 0.5; // Default neutral position
    let confidence = 0.3;
    const contextCategories: string[] = [];
    const marketContext: string[] = [];

    // Analyze position indicators
    for (const [indicator, score] of this.POSITION_INDICATORS.entries()) {
      if (text.includes(indicator)) {
        // Give more weight to stronger indicators
        if (indicator === 'market leader' || indicator === 'industry leader') {
          positionScore = Math.max(positionScore, score);
        } else {
          positionScore = (positionScore + score) / 2;
        }
        confidence += 0.15;
        marketContext.push(indicator);
      }
    }

    // Determine context category - prioritize more specific categories
    let contextCategory: PositionAnalysis['context_category'] = 'company';
    if (text.includes('recommend') || text.includes('suggest')) {
      contextCategory = 'recommendation';
      contextCategories.push('recommendation');
    } else if (text.includes('compare') || text.includes('versus')) {
      contextCategory = 'comparison';
      contextCategories.push('comparison');
    } else if (text.includes('product') || text.includes('item') || text.includes('goods') || text.includes('smartphones') || text.includes('technology')) {
      contextCategory = 'product';
      contextCategories.push('product');
    } else if (text.includes('service') || text.includes('support')) {
      contextCategory = 'service';
      contextCategories.push('service');
    }

    // Determine position type
    let positionType: PositionAnalysis['position_type'] = 'unknown';
    if (positionScore > 0.75) positionType = 'leader';
    else if (positionScore > 0.55) positionType = 'challenger';
    else if (positionScore > 0.4) positionType = 'follower';
    else if (positionScore > 0.25) positionType = 'niche';
    
    // Special cases based on specific keywords
    if (text.includes('behind') || text.includes('lagging')) {
      positionType = 'follower';
    }

    return {
      position_type: positionType,
      context_category: contextCategory,
      competitive_position: Math.max(0, Math.min(1, positionScore)),
      market_context: marketContext,
      confidence: Math.min(1, confidence)
    };
  }

  private static extractEntities(text: string, brandName?: string): Array<{
    name: string;
    type: 'brand' | 'product' | 'competitor' | 'feature';
    sentiment: number;
    position: number;
  }> {
    const entities: Array<{
      name: string;
      type: 'brand' | 'product' | 'competitor' | 'feature';
      sentiment: number;
      position: number;
    }> = [];

    // Simple entity extraction - would use NLP in production
    const words = text.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i]?.toLowerCase();
      
      // Check if it's the brand name
      if (brandName && word && word.includes(brandName.toLowerCase())) {
        const context = words.slice(Math.max(0, i - 3), i + 4).join(' ');
        const sentiment = this.calculateBaseSentiment([context]).score;
        
        entities.push({
          name: brandName,
          type: 'brand',
          sentiment: sentiment,
          position: i / words.length
        });
      }
    }

    return entities;
  }

  private static extractSentimentKeywords(words: string[]): Array<{
    word: string;
    sentiment_weight: number;
    frequency: number;
  }> {
    const keywordMap = new Map<string, { weight: number; count: number }>();

    for (const word of words) {
      if (this.POSITIVE_WORDS.has(word)) {
        const existing = keywordMap.get(word) || { weight: 0, count: 0 };
        keywordMap.set(word, {
          weight: this.POSITIVE_WORDS.get(word)!,
          count: existing.count + 1
        });
      } else if (this.NEGATIVE_WORDS.has(word)) {
        const existing = keywordMap.get(word) || { weight: 0, count: 0 };
        keywordMap.set(word, {
          weight: this.NEGATIVE_WORDS.get(word)!,
          count: existing.count + 1
        });
      }
    }

    return Array.from(keywordMap.entries()).map(([word, data]) => ({
      word: word,
      sentiment_weight: data.weight,
      frequency: data.count
    }));
  }

  private static applyContextualAdjustments(
    baseSentiment: SentimentScore,
    context?: string,
    position?: PositionAnalysis,
    aspects?: SentimentAspect[]
  ): SentimentScore {
    let adjustedScore = baseSentiment.score;
    let adjustedConfidence = baseSentiment.confidence;

    // Adjust based on position
    if (position && position.confidence > 0.5) {
      if (position.position_type === 'leader') {
        adjustedScore += 0.1;
      } else if (position.position_type === 'follower') {
        adjustedScore -= 0.1;
      }
    }

    // Adjust based on aspects
    if (aspects && aspects.length > 0) {
      const aspectSentiment = aspects.reduce((sum, aspect) => 
        sum + (aspect.sentiment * aspect.confidence), 0
      ) / aspects.length;
      
      adjustedScore = (adjustedScore + aspectSentiment) / 2;
      adjustedConfidence += 0.1;
    }

    return {
      score: Math.max(-1, Math.min(1, adjustedScore)),
      label: this.getSentimentLabel(adjustedScore),
      confidence: Math.min(1, adjustedConfidence),
      aspects: aspects || []
    };
  }

  private static getDateFormat(granularity: string): string {
    switch (granularity) {
      case 'hour': return 'hour';
      case 'day': return 'day';
      case 'week': return 'week';
      case 'month': return 'month';
      default: return 'day';
    }
  }

  private static calculateTrendDirection(
    current: number,
    previous: number
  ): 'improving' | 'declining' | 'stable' {
    if (previous === 0) return 'stable'; // First item has no previous
    const difference = current - previous;
    if (Math.abs(difference) < 0.05) return 'stable';
    return difference > 0 ? 'improving' : 'declining';
  }

  private static async getSentimentByCategory(
    brandId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, SentimentTrend[]>> {
    // Implementation would query by different categories
    // For now, return empty object
    return {};
  }

  private static async getSentimentByModel(
    brandId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, SentimentTrend[]>> {
    // Implementation would query by different AI models
    // For now, return empty object
    return {};
  }

  private static detectKeyEvents(trends: SentimentTrend[]): Array<{
    date: Date;
    event_type: 'spike' | 'drop' | 'volatility';
    description: string;
    impact_score: number;
  }> {
    const events: Array<{
      date: Date;
      event_type: 'spike' | 'drop' | 'volatility';
      description: string;
      impact_score: number;
    }> = [];

    for (let i = 1; i < trends.length; i++) {
      const current = trends[i];
      const previous = trends[i - 1];
      if (!current || !previous ||
          typeof current.sentiment_score !== 'number' ||
          typeof previous.sentiment_score !== 'number') continue;
      const change = current.sentiment_score - previous.sentiment_score;

      if (Math.abs(change) > 0.3) {
        events.push({
          date: current.date,
          event_type: change > 0 ? 'spike' : 'drop',
          description: `Sentiment ${change > 0 ? 'spike' : 'drop'} of ${Math.abs(change).toFixed(2)}`,
          impact_score: Math.abs(change)
        });
      }

      if (current.volatility > 0.5) {
        events.push({
          date: current.date,
          event_type: 'volatility',
          description: `High sentiment volatility detected`,
          impact_score: current.volatility
        });
      }
    }

    return events;
  }

  private static calculateSentimentSummary(trends: SentimentTrend[]): {
    average_sentiment: number;
    sentiment_stability: number;
    improvement_rate: number;
    total_mentions: number;
  } {
    if (trends.length === 0) {
      return {
        average_sentiment: 0,
        sentiment_stability: 0,
        improvement_rate: 0,
        total_mentions: 0
      };
    }

    const averageSentiment = trends.reduce((sum, trend) => 
      sum + trend.sentiment_score, 0
    ) / trends.length;

    const totalMentions = trends.reduce((sum, trend) => 
      sum + trend.mention_count, 0
    );

    const volatilities = trends.map(t => t.volatility);
    const sentimentStability = 1 - (volatilities.reduce((sum, v) => sum + v, 0) / volatilities.length);

    const firstSentiment = trends[0]?.sentiment_score || 0;
    const lastSentiment = trends[trends.length - 1]?.sentiment_score || 0;
    const improvementRate = (lastSentiment - firstSentiment) / trends.length;

    return {
      average_sentiment: averageSentiment,
      sentiment_stability: Math.max(0, sentimentStability),
      improvement_rate: improvementRate,
      total_mentions: totalMentions
    };
  }
}