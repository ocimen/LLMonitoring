import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { User, CreateUserInput, DatabaseQueryResult } from '../types/database';
import { createUserSchema, updateUserSchema, validateSchema } from './validation';

interface CreateUserData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role?: 'admin' | 'brand_manager' | 'analyst';
}

interface UpdateUserData {
  first_name?: string;
  last_name?: string;
  role?: 'admin' | 'brand_manager' | 'analyst';
  is_active?: boolean;
  email_verified?: boolean;
}

export class UserModel {
  /**
   * Create a new user with hashed password
   */
  static async create(userData: CreateUserData): Promise<User> {
    // Validate input data
    const validatedData = validateSchema<CreateUserData>(createUserSchema, userData);
    
    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(validatedData.password, saltRounds);
    
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [validatedData.email]
    );
    
    if (existingUser.rows.length > 0) {
      throw new Error('User with this email already exists');
    }
    
    // Create user
    const result = await query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      validatedData.email,
      password_hash,
      validatedData.first_name,
      validatedData.last_name,
      validatedData.role || 'analyst'
    ]);
    
    return result.rows[0] as User;
  }
  
  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<User | null> {
    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [email]
    );
    
    return result.rows.length > 0 ? result.rows[0] as User : null;
  }
  
  /**
   * Find user by ID
   */
  static async findById(id: string): Promise<User | null> {
    const result = await query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] as User : null;
  }
  
  /**
   * Update user
   */
  static async update(id: string, updateData: UpdateUserData): Promise<User> {
    const validatedData = validateSchema<UpdateUserData>(updateUserSchema, updateData);
    
    const fields = Object.keys(validatedData);
    const values = Object.values(validatedData);
    
    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const result = await query(`
      UPDATE users 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING *
    `, [id, ...values]);
    
    if (result.rows.length === 0) {
      throw new Error('User not found or inactive');
    }
    
    return result.rows[0] as User;
  }
  
  /**
   * Verify password
   */
  static async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.password_hash);
  }
  
  /**
   * Update last login timestamp
   */
  static async updateLastLogin(id: string): Promise<void> {
    await query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [id]
    );
  }
  
  /**
   * Soft delete user (set is_active = false)
   */
  static async softDelete(id: string): Promise<User> {
    const result = await query(`
      UPDATE users 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    return result.rows[0] as User;
  }
  
  /**
   * Get users with pagination
   */
  static async getAll(limit = 50, offset = 0): Promise<{
    users: User[];
    total: number;
  }> {
    const [usersResult, countResult] = await Promise.all([
      query(`
        SELECT * FROM users 
        WHERE is_active = true
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]),
      query('SELECT COUNT(*) FROM users WHERE is_active = true')
    ]);
    
    return {
      users: usersResult.rows as User[],
      total: parseInt(countResult.rows[0].count)
    };
  }
  
  /**
   * Get user's brands
   */
  static async getBrands(userId: string): Promise<DatabaseQueryResult> {
    return await query(`
      SELECT b.*, ub.role as user_role
      FROM brands b
      JOIN user_brands ub ON b.id = ub.brand_id
      WHERE ub.user_id = $1 AND b.is_active = true
      ORDER BY b.name
    `, [userId]);
  }
  
  /**
   * Check if user has access to brand
   */
  static async hasAccessToBrand(
    userId: string, 
    brandId: string, 
    requiredRole?: 'owner' | 'editor' | 'viewer'
  ): Promise<boolean> {
    let roleCondition = '';
    const params = [userId, brandId];
    
    if (requiredRole) {
      if (requiredRole === 'owner') {
        roleCondition = "AND ub.role = 'owner'";
      } else if (requiredRole === 'editor') {
        roleCondition = "AND ub.role IN ('owner', 'editor')";
      }
      // viewer role allows all roles
    }
    
    const result = await query(`
      SELECT 1 FROM user_brands ub
      JOIN brands b ON ub.brand_id = b.id
      WHERE ub.user_id = $1 AND ub.brand_id = $2 AND b.is_active = true
      ${roleCondition}
    `, params);
    
    return result.rows.length > 0;
  }
  
  /**
   * Sanitize user data (remove sensitive fields)
   */
  static sanitize(user: User): Omit<User, 'password_hash'> {
    const { password_hash, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}