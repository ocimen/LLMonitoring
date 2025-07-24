import { query } from '../config/database';
import { AIResponse, Citation, BrandMention, CreateAIResponseInput } from '../types/database';
import { createAIResponseSchema, createCitationSchema, createBrandMentionSchema, validateSchema } from './validation';

interface CreateCitationData {
  ai_response_id: string;
  url: string;
  domain?: string;
  title?: string;
  content_snippet?: string;
  authority_score?: number;
  relevance_score?: number;
  content_type?: string;
  publish_date?: Date;
  last_crawled?: Date;
}

interface CreateBrandMentionData {
  ai_response_id: string;
  brand_id: string;
  mention_text: string;
  context?: string;
  position_in_response?: number;
  sentiment_score?: number;
  sentiment_label?: 'positive' | 'negative' | 'neutral';
  confidence?: number;
}

export class AIResponseModel {
  /**
   * Create a new AI response
   */
  static async create(responseData: CreateAIResponseInput): Promise<AIResponse> {
    const validatedData = validateSchema<CreateAIResponseInput>(createAIResponseSchema, responseData);
    
    const result = await query(`
      INSERT INTO ai_responses (
        brand_id, ai_model_id, query, response, response_metadata,
        confidence_score, processing_time_ms, tokens_used, cost
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      validatedData.brand_id,
      validatedData.ai_model_id,
      validatedData.query,
      validatedData.response,
      validatedData.response_metadata || null,
      validatedData.confidence_score || null,
      validatedData.processing_time_ms || null,
      validatedData.tokens_used || null,
      validatedData.cost || null
    ]);
    
    return result.rows[0] as AIResponse;
  }
  
  /**
   * Find AI response by ID
   */
  static async findById(id: string): Promise<AIResponse | null> {
    const result = await query(
      'SELECT * FROM ai_responses WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] as AIResponse : null;
  }
  
  /**
   * Get AI responses for a brand with pagination
   */
  static async getByBrand(
    brandId: string, 
    limit = 50, 
    offset = 0,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    responses: AIResponse[];
    total: number;
  }> {
    let dateFilter = '';
    const params: any[] = [brandId, limit, offset];
    
    if (startDate || endDate) {
      if (startDate && endDate) {
        dateFilter = 'AND created_at BETWEEN $4 AND $5';
        params.push(startDate.toISOString(), endDate.toISOString());
      } else if (startDate) {
        dateFilter = 'AND created_at >= $4';
        params.push(startDate.toISOString());
      } else if (endDate) {
        dateFilter = 'AND created_at <= $4';
        params.push(endDate.toISOString());
      }
    }
    
    const [responsesResult, countResult] = await Promise.all([
      query(`
        SELECT ar.*, am.name as ai_model_name, am.provider
        FROM ai_responses ar
        JOIN ai_models am ON ar.ai_model_id = am.id
        WHERE ar.brand_id = $1 ${dateFilter}
        ORDER BY ar.created_at DESC
        LIMIT $2 OFFSET $3
      `, params),
      query(`
        SELECT COUNT(*) FROM ai_responses 
        WHERE brand_id = $1 ${dateFilter}
      `, [brandId, ...(params.slice(3))])
    ]);
    
    return {
      responses: responsesResult.rows as AIResponse[],
      total: parseInt(countResult.rows[0].count)
    };
  }
  
  /**
   * Get AI responses by model
   */
  static async getByModel(
    aiModelId: string,
    limit = 50,
    offset = 0
  ): Promise<AIResponse[]> {
    const result = await query(`
      SELECT * FROM ai_responses 
      WHERE ai_model_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [aiModelId, limit, offset]);
    
    return result.rows as AIResponse[];
  }
  
  /**
   * Add citation to AI response
   */
  static async addCitation(citationData: CreateCitationData): Promise<Citation> {
    const validatedData = validateSchema<CreateCitationData>(createCitationSchema, citationData);
    
    const result = await query(`
      INSERT INTO citations (
        ai_response_id, url, domain, title, content_snippet,
        authority_score, relevance_score, content_type, publish_date, last_crawled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      validatedData.ai_response_id,
      validatedData.url,
      validatedData.domain || null,
      validatedData.title || null,
      validatedData.content_snippet || null,
      validatedData.authority_score || null,
      validatedData.relevance_score || null,
      validatedData.content_type || null,
      validatedData.publish_date || null,
      validatedData.last_crawled || null
    ]);
    
    return result.rows[0] as Citation;
  }
  
  /**
   * Add brand mention to AI response
   */
  static async addBrandMention(mentionData: CreateBrandMentionData): Promise<BrandMention> {
    const validatedData = validateSchema<CreateBrandMentionData>(createBrandMentionSchema, mentionData);
    
    const result = await query(`
      INSERT INTO brand_mentions (
        ai_response_id, brand_id, mention_text, context, position_in_response,
        sentiment_score, sentiment_label, confidence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      validatedData.ai_response_id,
      validatedData.brand_id,
      validatedData.mention_text,
      validatedData.context || null,
      validatedData.position_in_response || null,
      validatedData.sentiment_score || null,
      validatedData.sentiment_label || null,
      validatedData.confidence || null
    ]);
    
    return result.rows[0] as BrandMention;
  }
  
  /**
   * Get citations for AI response
   */
  static async getCitations(responseId: string): Promise<Citation[]> {
    const result = await query(`
      SELECT * FROM citations 
      WHERE ai_response_id = $1
      ORDER BY relevance_score DESC, authority_score DESC
    `, [responseId]);
    
    return result.rows as Citation[];
  }
  
  /**
   * Get brand mentions for AI response
   */
  static async getBrandMentions(responseId: string): Promise<BrandMention[]> {
    const result = await query(`
      SELECT bm.*, b.name as brand_name
      FROM brand_mentions bm
      JOIN brands b ON bm.brand_id = b.id
      WHERE bm.ai_response_id = $1
      ORDER BY bm.position_in_response
    `, [responseId]);
    
    return result.rows as BrandMention[];
  }
  
  /**
   * Get AI response with all related data
   */
  static async getWithDetails(responseId: string): Promise<{
    response: AIResponse;
    citations: Citation[];
    mentions: BrandMention[];
  } | null> {
    const response = await this.findById(responseId);
    
    if (!response) {
      return null;
    }
    
    const [citations, mentions] = await Promise.all([
      this.getCitations(responseId),
      this.getBrandMentions(responseId)
    ]);
    
    return {
      response,
      citations,
      mentions
    };
  }
  
  /**
   * Delete AI response and all related data
   */
  static async delete(responseId: string): Promise<void> {
    // Delete in order due to foreign key constraints
    await query('DELETE FROM brand_mentions WHERE ai_response_id = $1', [responseId]);
    await query('DELETE FROM citations WHERE ai_response_id = $1', [responseId]);
    await query('DELETE FROM ai_responses WHERE id = $1', [responseId]);
  }
  
  /**
   * Get response statistics for a brand
   */
  static async getStatistics(brandId: string, days = 30): Promise<{
    total_responses: number;
    avg_confidence: number;
    avg_processing_time: number;
    total_cost: number;
    responses_by_model: Array<{ model_name: string; count: number; avg_cost: number }>;
  }> {
    const result = await query(`
      SELECT 
        COUNT(*) as total_responses,
        AVG(confidence_score) as avg_confidence,
        AVG(processing_time_ms) as avg_processing_time,
        SUM(cost) as total_cost
      FROM ai_responses 
      WHERE brand_id = $1 
        AND created_at >= CURRENT_DATE - INTERVAL '${days} days'
    `, [brandId]);
    
    const modelStats = await query(`
      SELECT 
        am.name as model_name,
        COUNT(*) as count,
        AVG(ar.cost) as avg_cost
      FROM ai_responses ar
      JOIN ai_models am ON ar.ai_model_id = am.id
      WHERE ar.brand_id = $1 
        AND ar.created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY am.id, am.name
      ORDER BY count DESC
    `, [brandId]);
    
    return {
      total_responses: parseInt(result.rows[0].total_responses) || 0,
      avg_confidence: parseFloat(result.rows[0].avg_confidence) || 0,
      avg_processing_time: parseFloat(result.rows[0].avg_processing_time) || 0,
      total_cost: parseFloat(result.rows[0].total_cost) || 0,
      responses_by_model: modelStats.rows.map((row: any) => ({
        model_name: row.model_name,
        count: parseInt(row.count),
        avg_cost: parseFloat(row.avg_cost) || 0
      }))
    };
  }
  
  /**
   * Search responses by query text
   */
  static async searchByQuery(
    brandId: string,
    searchTerm: string,
    limit = 20
  ): Promise<AIResponse[]> {
    const result = await query(`
      SELECT ar.*, am.name as ai_model_name
      FROM ai_responses ar
      JOIN ai_models am ON ar.ai_model_id = am.id
      WHERE ar.brand_id = $1 
        AND (ar.query ILIKE $2 OR ar.response ILIKE $2)
      ORDER BY ar.created_at DESC
      LIMIT $3
    `, [brandId, `%${searchTerm}%`, limit]);
    
    return result.rows as AIResponse[];
  }
}