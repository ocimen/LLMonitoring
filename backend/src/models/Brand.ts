import { query } from '../config/database';
import { Brand, CreateBrandInput, DatabaseQueryResult } from '../types/database';
import { createBrandSchema, updateBrandSchema, validateSchema } from './validation';

interface UpdateBrandData {
  name?: string;
  domain?: string;
  industry?: string;
  description?: string;
  logo_url?: string;
  website_url?: string;
  monitoring_keywords?: string[];
  competitor_brands?: string[];
  is_active?: boolean;
}

export class BrandModel {
  /**
   * Create a new brand
   */
  static async create(brandData: CreateBrandInput): Promise<Brand> {
    const validatedData = validateSchema<CreateBrandInput>(createBrandSchema, brandData);
    
    // Check if brand name already exists
    const existingBrand = await query(
      'SELECT id FROM brands WHERE name = $1 AND is_active = true',
      [validatedData.name]
    );
    
    if (existingBrand.rows.length > 0) {
      throw new Error('Brand with this name already exists');
    }
    
    const result = await query(`
      INSERT INTO brands (
        name, domain, industry, description, logo_url, website_url,
        monitoring_keywords, competitor_brands, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      validatedData.name,
      validatedData.domain || null,
      validatedData.industry || null,
      validatedData.description || null,
      validatedData.logo_url || null,
      validatedData.website_url || null,
      validatedData.monitoring_keywords || [],
      validatedData.competitor_brands || [],
      validatedData.created_by || null
    ]);
    
    return result.rows[0] as Brand;
  }
  
  /**
   * Find brand by ID
   */
  static async findById(id: string): Promise<Brand | null> {
    const result = await query(
      'SELECT * FROM brands WHERE id = $1 AND is_active = true',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] as Brand : null;
  }
  
  /**
   * Find brand by name
   */
  static async findByName(name: string): Promise<Brand | null> {
    const result = await query(
      'SELECT * FROM brands WHERE name = $1 AND is_active = true',
      [name]
    );
    
    return result.rows.length > 0 ? result.rows[0] as Brand : null;
  }
  
  /**
   * Update brand
   */
  static async update(id: string, updateData: UpdateBrandData): Promise<Brand> {
    const validatedData = validateSchema<UpdateBrandData>(updateBrandSchema, updateData);
    
    const fields = Object.keys(validatedData);
    const values = Object.values(validatedData);
    
    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    // Check if name is being updated and already exists
    if (validatedData.name) {
      const existingBrand = await query(
        'SELECT id FROM brands WHERE name = $1 AND id != $2 AND is_active = true',
        [validatedData.name, id]
      );
      
      if (existingBrand.rows.length > 0) {
        throw new Error('Brand with this name already exists');
      }
    }
    
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const result = await query(`
      UPDATE brands 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING *
    `, [id, ...values]);
    
    if (result.rows.length === 0) {
      throw new Error('Brand not found or inactive');
    }
    
    return result.rows[0] as Brand;
  }
  
  /**
   * Soft delete brand
   */
  static async softDelete(id: string): Promise<Brand> {
    const result = await query(`
      UPDATE brands 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      throw new Error('Brand not found');
    }
    
    return result.rows[0] as Brand;
  }
  
  /**
   * Get all brands with pagination
   */
  static async getAll(limit = 50, offset = 0): Promise<{
    brands: Brand[];
    total: number;
  }> {
    const [brandsResult, countResult] = await Promise.all([
      query(`
        SELECT * FROM brands 
        WHERE is_active = true
        ORDER BY name
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      query('SELECT COUNT(*) FROM brands WHERE is_active = true')
    ]);
    
    return {
      brands: brandsResult.rows as Brand[],
      total: parseInt(countResult.rows[0].count)
    };
  }
  
  /**
   * Get brands by industry
   */
  static async getByIndustry(industry: string): Promise<Brand[]> {
    const result = await query(`
      SELECT * FROM brands 
      WHERE industry = $1 AND is_active = true
      ORDER BY name
    `, [industry]);
    
    return result.rows as Brand[];
  }
  
  /**
   * Search brands by name or domain
   */
  static async search(searchTerm: string, limit = 20): Promise<Brand[]> {
    const result = await query(`
      SELECT * FROM brands 
      WHERE (
        name ILIKE $1 OR 
        domain ILIKE $1 OR 
        description ILIKE $1
      ) AND is_active = true
      ORDER BY 
        CASE 
          WHEN name ILIKE $1 THEN 1
          WHEN domain ILIKE $1 THEN 2
          ELSE 3
        END,
        name
      LIMIT $2
    `, [`%${searchTerm}%`, limit]);
    
    return result.rows as Brand[];
  }
  
  /**
   * Add user to brand
   */
  static async addUser(
    brandId: string, 
    userId: string, 
    role: 'owner' | 'editor' | 'viewer' = 'viewer'
  ): Promise<void> {
    await query(`
      INSERT INTO user_brands (brand_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, brand_id) 
      DO UPDATE SET role = EXCLUDED.role
    `, [brandId, userId, role]);
  }
  
  /**
   * Remove user from brand
   */
  static async removeUser(brandId: string, userId: string): Promise<void> {
    const result = await query(`
      DELETE FROM user_brands 
      WHERE brand_id = $1 AND user_id = $2
    `, [brandId, userId]);
    
    if (result.rowCount === 0) {
      throw new Error('User-brand association not found');
    }
  }
  
  /**
   * Get brand users
   */
  static async getUsers(brandId: string): Promise<DatabaseQueryResult> {
    return await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role as user_role, 
             ub.role as brand_role, ub.created_at as associated_at
      FROM users u
      JOIN user_brands ub ON u.id = ub.user_id
      WHERE ub.brand_id = $1 AND u.is_active = true
      ORDER BY ub.role, u.first_name, u.last_name
    `, [brandId]);
  }
  
  /**
   * Update monitoring keywords
   */
  static async updateMonitoringKeywords(
    brandId: string, 
    keywords: string[]
  ): Promise<Brand> {
    if (keywords.length > 50) {
      throw new Error('Maximum 50 monitoring keywords allowed');
    }
    
    const result = await query(`
      UPDATE brands 
      SET monitoring_keywords = $2, updated_at = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING *
    `, [brandId, keywords]);
    
    if (result.rows.length === 0) {
      throw new Error('Brand not found or inactive');
    }
    
    return result.rows[0] as Brand;
  }
  
  /**
   * Update competitor brands
   */
  static async updateCompetitorBrands(
    brandId: string, 
    competitors: string[]
  ): Promise<Brand> {
    if (competitors.length > 20) {
      throw new Error('Maximum 20 competitor brands allowed');
    }
    
    const result = await query(`
      UPDATE brands 
      SET competitor_brands = $2, updated_at = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING *
    `, [brandId, competitors]);
    
    if (result.rows.length === 0) {
      throw new Error('Brand not found or inactive');
    }
    
    return result.rows[0] as Brand;
  }
  
  /**
   * Get brand statistics
   */
  static async getStatistics(brandId: string): Promise<{
    total_responses: number;
    total_mentions: number;
    avg_sentiment: number;
    latest_metrics_date: Date | null;
  }> {
    const result = await query(`
      SELECT 
        (SELECT COUNT(*) FROM ai_responses WHERE brand_id = $1) as total_responses,
        (SELECT COUNT(*) FROM brand_mentions WHERE brand_id = $1) as total_mentions,
        (SELECT AVG(sentiment_score) FROM brand_mentions WHERE brand_id = $1) as avg_sentiment,
        (SELECT MAX(metric_date) FROM visibility_metrics WHERE brand_id = $1) as latest_metrics_date
    `, [brandId]);
    
    return {
      total_responses: parseInt(result.rows[0].total_responses) || 0,
      total_mentions: parseInt(result.rows[0].total_mentions) || 0,
      avg_sentiment: parseFloat(result.rows[0].avg_sentiment) || 0,
      latest_metrics_date: result.rows[0].latest_metrics_date
    };
  }
}