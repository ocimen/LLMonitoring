import { IAIModel, AIModelConfig, AIQuery, AIResponse, ParsedAIResponse, BrandMonitoringQuery, BRAND_QUERY_TEMPLATES, QueryTemplateType } from '../../types/ai';
import { OpenAIModel } from './OpenAIModel';
import { AnthropicModel } from './AnthropicModel';
import { GeminiModel } from './GeminiModel';
import { query } from '../../config/database';

export class AIModelManager {
  private models: Map<string, IAIModel> = new Map();
  private defaultModel: string | undefined;

  constructor() {
    this.initializeModels();
  }

  /**
   * Initialize AI models from database configuration
   */
  async initializeModels(): Promise<void> {
    try {
      const result = await query(`
        SELECT * FROM ai_models 
        WHERE is_active = true 
        ORDER BY provider, name
      `);

      for (const modelConfig of result.rows) {
        await this.addModel({
          id: modelConfig.id,
          name: modelConfig.name,
          provider: modelConfig.provider,
          model_version: modelConfig.model_version,
          api_endpoint: modelConfig.api_endpoint,
          api_key: this.getApiKey(modelConfig.provider),
          rate_limit_per_minute: modelConfig.rate_limit_per_minute,
          cost_per_request: modelConfig.cost_per_request,
          max_tokens: 4000,
          temperature: 0.7
        });
      }

      // Set default model (prefer GPT-4 if available, otherwise first available)
      const gpt4Model = Array.from(this.models.keys()).find(key => key.includes('gpt-4'));
      this.defaultModel = gpt4Model || Array.from(this.models.keys())[0] || undefined;

      console.log(`✅ Initialized ${this.models.size} AI models`);
      if (this.defaultModel) {
        console.log(`🎯 Default model: ${this.defaultModel}`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize AI models:', error);
    }
  }

  /**
   * Add a new AI model
   */
  async addModel(config: AIModelConfig): Promise<void> {
    try {
      let model: IAIModel;

      switch (config.provider) {
        case 'openai':
          model = new OpenAIModel(config);
          break;
        case 'anthropic':
          model = new AnthropicModel(config);
          break;
        case 'gemini':
          model = new GeminiModel(config);
          break;
        default:
          throw new Error(`Unsupported AI provider: ${config.provider}`);
      }

      // Test the model
      const isHealthy = await model.healthCheck();
      if (!isHealthy) {
        console.warn(`⚠️  Model ${config.name} failed health check but will be added anyway`);
      }

      this.models.set(config.name, model);
      console.log(`✅ Added AI model: ${config.name} (${config.provider})`);
    } catch (error) {
      console.error(`❌ Failed to add model ${config.name}:`, error);
      throw error;
    }
  }

  /**
   * Remove an AI model
   */
  removeModel(modelName: string): boolean {
    const removed = this.models.delete(modelName);
    if (removed && this.defaultModel === modelName) {
      this.defaultModel = Array.from(this.models.keys())[0] || undefined;
    }
    return removed;
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Get model by name
   */
  getModel(modelName?: string): IAIModel | null {
    const targetModel = modelName || this.defaultModel;
    if (!targetModel) return null;
    return this.models.get(targetModel) || null;
  }

  /**
   * Execute a query on a specific model
   */
  async queryModel(modelName: string, request: AIQuery): Promise<AIResponse> {
    const model = this.getModel(modelName);
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }

    return await model.query(request);
  }

  /**
   * Execute a query on the default model
   */
  async query(request: AIQuery): Promise<AIResponse> {
    if (!this.defaultModel) {
      throw new Error('No AI models available');
    }

    return await this.queryModel(this.defaultModel, request);
  }

  /**
   * Execute a query on multiple models for comparison
   */
  async queryMultipleModels(modelNames: string[], request: AIQuery): Promise<AIResponse[]> {
    const promises = modelNames.map(async (modelName) => {
      try {
        return await this.queryModel(modelName, {
          ...request,
          id: `${request.id}-${modelName}`
        });
      } catch (error) {
        console.error(`Failed to query model ${modelName}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((result): result is AIResponse => result !== null);
  }

  /**
   * Parse AI response with citations and analysis
   */
  async parseResponse(response: AIResponse): Promise<ParsedAIResponse> {
    const model = this.getModel(response.model_name);
    if (!model) {
      throw new Error(`Model ${response.model_name} not found for parsing`);
    }

    return await model.parseResponse(response);
  }

  /**
   * Generate brand monitoring query from template
   */
  generateBrandQuery(brandMonitoringQuery: BrandMonitoringQuery): AIQuery {
    const template = BRAND_QUERY_TEMPLATES[brandMonitoringQuery.query_type];
    let processedQuery: string = template;

    // Replace placeholders
    processedQuery = processedQuery.replace(/{brand_name}/g, brandMonitoringQuery.brand_name);
    
    if (brandMonitoringQuery.competitors) {
      processedQuery = processedQuery.replace(/{competitors}/g, brandMonitoringQuery.competitors.join(', '));
    }
    
    if (brandMonitoringQuery.products) {
      processedQuery = processedQuery.replace(/{product}/g, brandMonitoringQuery.products[0] || 'main product');
    }

    // Add industry context if available
    if (brandMonitoringQuery.context) {
      processedQuery = processedQuery.replace(/{industry}/g, brandMonitoringQuery.context);
    }

    const result: AIQuery = {
      id: `brand-query-${Date.now()}`,
      brand_id: brandMonitoringQuery.brand_name,
      query: processedQuery,
      metadata: {
        query_type: brandMonitoringQuery.query_type,
        brand_name: brandMonitoringQuery.brand_name,
        competitors: brandMonitoringQuery.competitors,
        products: brandMonitoringQuery.products
      }
    };

    if (brandMonitoringQuery.context) {
      result.context = brandMonitoringQuery.context;
    }

    return result;
  }

  /**
   * Execute brand monitoring across multiple models
   */
  async executeBrandMonitoring(
    brandMonitoringQuery: BrandMonitoringQuery,
    modelNames?: string[]
  ): Promise<{
    query: AIQuery;
    responses: AIResponse[];
    parsed_responses: ParsedAIResponse[];
  }> {
    const aiQuery = this.generateBrandQuery(brandMonitoringQuery);
    const targetModels = modelNames || this.getAvailableModels();

    // Execute queries
    const responses = await this.queryMultipleModels(targetModels, aiQuery);

    // Parse responses
    const parsedResponses = await Promise.all(
      responses.map(response => this.parseResponse(response))
    );

    return {
      query: aiQuery,
      responses,
      parsed_responses: parsedResponses
    };
  }

  /**
   * Get model statistics
   */
  async getModelStatistics(): Promise<Array<{
    model_name: string;
    provider: string;
    is_healthy: boolean;
    rate_limit_info: any;
    estimated_cost_per_query: number;
  }>> {
    const stats = [];

    for (const [modelName, model] of this.models) {
      try {
        const isHealthy = await model.healthCheck();
        const rateLimitInfo = await model.checkRateLimit();
        const estimatedCost = model.estimateCost({
          id: 'test',
          brand_id: 'test',
          query: 'Test query for cost estimation'
        });

        stats.push({
          model_name: modelName,
          provider: model.config.provider,
          is_healthy: isHealthy,
          rate_limit_info: rateLimitInfo,
          estimated_cost_per_query: estimatedCost
        });
      } catch (error) {
        stats.push({
          model_name: modelName,
          provider: model.config.provider,
          is_healthy: false,
          rate_limit_info: null,
          estimated_cost_per_query: 0
        });
      }
    }

    return stats;
  }

  /**
   * Batch process multiple brand queries
   */
  async batchProcessBrandQueries(
    queries: BrandMonitoringQuery[],
    options: {
      modelName?: string;
      maxConcurrent?: number;
      delayBetweenRequests?: number;
    } = {}
  ): Promise<Array<{
    query: BrandMonitoringQuery;
    result: AIResponse | null;
    error?: string;
  }>> {
    const { modelName, maxConcurrent = 3, delayBetweenRequests = 1000 } = options;
    const results = [];

    // Process queries in batches to respect rate limits
    for (let i = 0; i < queries.length; i += maxConcurrent) {
      const batch = queries.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (brandQuery) => {
        try {
          const aiQuery = this.generateBrandQuery(brandQuery);
          const response = modelName 
            ? await this.queryModel(modelName, aiQuery)
            : await this.query(aiQuery);
          
          return {
            query: brandQuery,
            result: response,
          };
        } catch (error) {
          return {
            query: brandQuery,
            result: null,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches
      if (i + maxConcurrent < queries.length && delayBetweenRequests > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      }
    }

    return results;
  }

  /**
   * Get API key for provider from environment
   */
  private getApiKey(provider: string): string {
    switch (provider) {
      case 'openai':
        return process.env.OPENAI_API_KEY || '';
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY || '';
      case 'gemini':
        return process.env.GEMINI_API_KEY || '';
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}