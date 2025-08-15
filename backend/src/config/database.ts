import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const databaseConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
};

// Create the connection pool
export const pool = new Pool(databaseConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection
export const testConnection = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connected successfully at:', result.rows[0].now);
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Graceful shutdown
export const closePool = async (): Promise<void> => {
  try {
    await pool.end();
    console.log('📦 Database pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error);
  }
};

// Query helper function with error handling
export const query = async (text: string, params?: any[]): Promise<any> => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Executed query', { text, duration, rows: result.rowCount });
    }

    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.error('❌ Query error', { text, duration, error });
    throw error;
  }
};

export default pool;