import { query } from '../config/database';

export const seedAIModels = async (): Promise<void> => {
  console.log('🌱 Seeding AI models...');
  
  const aiModels = [
    {
      name: 'GPT-4',
      provider: 'openai',
      model_version: 'gpt-4-1106-preview',
      api_endpoint: 'https://api.openai.com/v1/chat/completions',
      rate_limit_per_minute: 500,
      cost_per_request: 0.03
    },
    {
      name: 'GPT-3.5 Turbo',
      provider: 'openai',
      model_version: 'gpt-3.5-turbo-1106',
      api_endpoint: 'https://api.openai.com/v1/chat/completions',
      rate_limit_per_minute: 3500,
      cost_per_request: 0.002
    },
    {
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      model_version: 'claude-3-opus-20240229',
      api_endpoint: 'https://api.anthropic.com/v1/messages',
      rate_limit_per_minute: 1000,
      cost_per_request: 0.015
    },
    {
      name: 'Claude 3 Sonnet',
      provider: 'anthropic',
      model_version: 'claude-3-sonnet-20240229',
      api_endpoint: 'https://api.anthropic.com/v1/messages',
      rate_limit_per_minute: 1000,
      cost_per_request: 0.003
    },
    {
      name: 'Claude 3 Haiku',
      provider: 'anthropic',
      model_version: 'claude-3-haiku-20240307',
      api_endpoint: 'https://api.anthropic.com/v1/messages',
      rate_limit_per_minute: 1000,
      cost_per_request: 0.00025
    },
    {
      name: 'Gemini Pro',
      provider: 'google',
      model_version: 'gemini-1.5-pro-latest',
      api_endpoint: 'https://generativelanguage.googleapis.com',
      rate_limit_per_minute: 300,
      cost_per_request: 0.0035
    },
    {
      name: 'Gemini Pro Vision',
      provider: 'google',
      model_version: 'gemini-1.5-pro-vision-latest',
      api_endpoint: 'https://generativelanguage.googleapis.com',
      rate_limit_per_minute: 300,
      cost_per_request: 0.0035
    },
    {
      name: 'Gemini Flash',
      provider: 'google',
      model_version: 'gemini-1.5-flash-latest',
      api_endpoint: 'https://generativelanguage.googleapis.com',
      rate_limit_per_minute: 1000,
      cost_per_request: 0.00035
    }
  ];

  for (const model of aiModels) {
    try {
      await query(`
        INSERT INTO ai_models (name, provider, model_version, api_endpoint, rate_limit_per_minute, cost_per_request)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (name) DO UPDATE SET
          provider = EXCLUDED.provider,
          model_version = EXCLUDED.model_version,
          api_endpoint = EXCLUDED.api_endpoint,
          rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
          cost_per_request = EXCLUDED.cost_per_request,
          updated_at = NOW()
      `, [model.name, model.provider, model.model_version, model.api_endpoint, model.rate_limit_per_minute, model.cost_per_request]);
      
      console.log(`✅ Seeded AI model: ${model.name}`);
    } catch (error) {
      console.error(`❌ Failed to seed AI model ${model.name}:`, error);
    }
  }
};

export const seedSampleData = async (): Promise<void> => {
  console.log('🌱 Seeding sample data...');
  
  try {
    // Create a sample admin user
    const adminUser = await query(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        role = EXCLUDED.role,
        updated_at = NOW()
      RETURNING id
    `, [
      'admin@example.com',
      '$2a$10$rOzJqQZQQQQQQQQQQQQQQu', // This would be a real bcrypt hash in production
      'Admin',
      'User',
      'admin',
      true
    ]);
    
    console.log('✅ Seeded admin user');

    // Create a sample brand
    const brand = await query(`
      INSERT INTO brands (name, domain, industry, description, monitoring_keywords, competitor_brands, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      'TechCorp',
      'techcorp.com',
      'Technology',
      'A leading technology company specializing in AI solutions',
      ['TechCorp', 'TechCorp AI', 'TechCorp solutions'],
      ['CompetitorA', 'CompetitorB', 'CompetitorC'],
      adminUser.rows[0]?.id
    ]);

    if (brand.rows.length > 0) {
      console.log('✅ Seeded sample brand: TechCorp');
      
      // Associate user with brand
      await query(`
        INSERT INTO user_brands (user_id, brand_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, brand_id) DO NOTHING
      `, [adminUser.rows[0].id, brand.rows[0].id, 'owner']);
      
      console.log('✅ Associated admin user with TechCorp brand');
    }

  } catch (error) {
    console.error('❌ Failed to seed sample data:', error);
  }
};

export const runSeeds = async (): Promise<void> => {
  try {
    await seedAIModels();
    await seedSampleData();
    console.log('🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
};

// Run seeds if this file is executed directly
if (require.main === module) {
  runSeeds()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}