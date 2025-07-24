import { query } from '../config/database';
import { DatabaseQueryResult, PaginationOptions } from '../types/database';

/**
 * Database utility class with common operations
 */
export class DatabaseUtils {
  /**
   * Check if a table exists
   */
  static async tableExists(tableName: string): Promise<boolean> {
    const result = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    
    return result.rows[0].exists;
  }

  /**
   * Get table row count
   */
  static async getTableCount(tableName: string): Promise<number> {
    const result = await query(`SELECT COUNT(*) FROM ${tableName}`);
    return parseInt(result.rows[0].count);
  }

  /**
   * Build pagination query
   */
  static buildPaginationQuery(baseQuery: string, options: PaginationOptions = {}): string {
    const { limit = 50, offset = 0 } = options;
    return `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
  }

  /**
   * Build date range filter
   */
  static buildDateRangeFilter(
    field: string, 
    startDate?: Date, 
    endDate?: Date
  ): { condition: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (startDate) {
      conditions.push(`${field} >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`${field} <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    return {
      condition: conditions.length > 0 ? conditions.join(' AND ') : '',
      params
    };
  }

  /**
   * Execute a transaction
   */
  static async executeTransaction<T>(
    operations: ((client: any) => Promise<T>)[]
  ): Promise<T[]> {
    const client = await query('BEGIN');
    
    try {
      const results: T[] = [];
      
      for (const operation of operations) {
        const result = await operation(client);
        results.push(result);
      }
      
      await query('COMMIT');
      return results;
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Upsert operation (INSERT ... ON CONFLICT DO UPDATE)
   */
  static async upsert(
    tableName: string,
    data: Record<string, any>,
    conflictColumns: string[],
    updateColumns: string[]
  ): Promise<DatabaseQueryResult> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    
    const updateSet = updateColumns
      .map(col => `${col} = EXCLUDED.${col}`)
      .join(', ');
    
    const conflictTarget = conflictColumns.join(', ');
    
    const queryText = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (${conflictTarget})
      DO UPDATE SET ${updateSet}, updated_at = NOW()
      RETURNING *
    `;
    
    return await query(queryText, values);
  }

  /**
   * Soft delete (set is_active = false instead of DELETE)
   */
  static async softDelete(
    tableName: string,
    whereCondition: string,
    params: any[]
  ): Promise<DatabaseQueryResult> {
    const queryText = `
      UPDATE ${tableName} 
      SET is_active = false, updated_at = NOW()
      WHERE ${whereCondition}
      RETURNING *
    `;
    
    return await query(queryText, params);
  }

  /**
   * Get database health information
   */
  static async getHealthInfo(): Promise<{
    connected: boolean;
    version: string;
    activeConnections: number;
    uptime: string;
  }> {
    try {
      const versionResult = await query('SELECT version()');
      const connectionsResult = await query(`
        SELECT count(*) as active_connections 
        FROM pg_stat_activity 
        WHERE state = 'active'
      `);
      const uptimeResult = await query(`
        SELECT date_trunc('second', current_timestamp - pg_postmaster_start_time()) as uptime
      `);

      return {
        connected: true,
        version: versionResult.rows[0].version,
        activeConnections: parseInt(connectionsResult.rows[0].active_connections),
        uptime: uptimeResult.rows[0].uptime
      };
    } catch (error) {
      return {
        connected: false,
        version: 'unknown',
        activeConnections: 0,
        uptime: 'unknown'
      };
    }
  }
}

/**
 * Common database queries for the application
 */
export class CommonQueries {
  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<DatabaseQueryResult> {
    return await query(`
      SELECT * FROM users 
      WHERE email = $1 AND is_active = true
    `, [email]);
  }

  /**
   * Get brands for a user
   */
  static async getBrandsForUser(userId: string): Promise<DatabaseQueryResult> {
    return await query(`
      SELECT b.*, ub.role as user_role
      FROM brands b
      JOIN user_brands ub ON b.id = ub.brand_id
      WHERE ub.user_id = $1 AND b.is_active = true
      ORDER BY b.name
    `, [userId]);
  }

  /**
   * Get recent visibility metrics for a brand
   */
  static async getRecentVisibilityMetrics(
    brandId: string, 
    days: number = 30
  ): Promise<DatabaseQueryResult> {
    return await query(`
      SELECT * FROM visibility_metrics
      WHERE brand_id = $1 
        AND metric_date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY metric_date DESC, metric_hour DESC
    `, [brandId]);
  }

  /**
   * Get active alerts for a brand
   */
  static async getActiveAlerts(brandId: string): Promise<DatabaseQueryResult> {
    return await query(`
      SELECT * FROM alerts
      WHERE brand_id = $1 
        AND is_acknowledged = false
        AND resolved_at IS NULL
      ORDER BY severity DESC, created_at DESC
    `, [brandId]);
  }

  /**
   * Get AI models that are active
   */
  static async getActiveAIModels(): Promise<DatabaseQueryResult> {
    return await query(`
      SELECT * FROM ai_models
      WHERE is_active = true
      ORDER BY provider, name
    `);
  }
}