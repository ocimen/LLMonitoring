import { OpenAIModel } from '../services/ai/OpenAIModel';
import { AnthropicModel } from '../services/ai/AnthropicModel';
import { GeminiModel } from '../services/ai/GeminiModel';
import { AIModelManager } from '../services/ai/AIModelManager';
import { AIModelConfig, AIQuery } from '../types/ai';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    }
  }))
}));

// Mock database
jest.mock('../config/database', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  closePool: jest.fn().mockResolvedValue(true)
}));

const mockQuery = require('../config/database').query;

describe('AI Model Integration Tests', () => {
  let openAIConfig: AIModelConfig;
  let anthropicConfig: AIModelConfig;
  let geminiConfig: AIModelConfig;
  let testQuery: AIQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    
    openAIConfig = {
      id: 'openai-gpt4',
      name: 'GPT-4',
      provider: 'openai',
      model_version: 'gpt-4-1106-preview',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: 'test-openai-key',
      rate_limit_per_minute: 500,
      cost_per_request: 0.03,
      max_tokens: 4000,
      temperature: 0.7
    };

    anthropicConfig = {
      id: 'anthropic-claude',
      name: 'Claude 3 Opus',
      provider: 'anthropic',
      model_version: 'claude-3-opus-20240229',
      api_endpoint: 'https://api.anthropic.com/v1',
      api_key: 'test-anthropic-key',
      rate_limit_per_minute: 1000,
      cost_per_request: 0.015,
      max_tokens: 4000,
      temperature: 0.7
    };

    geminiConfig = {
      id: 'google-gemini',
      name: 'Gemini Pro',
      provider: 'gemini',
      model_version: 'gemini-1.5-pro-latest',
      api_endpoint: 'https://generativelanguage.googleapis.com',
      api_key: 'test-google-key',
      rate_limit_per_minute: 300,
      cost_per_request: 0.0035,
      max_tokens: 4000,
      temperature: 0.7
    };

    testQuery = {
      id: 'test-query-1',
      brand_id: 'test-brand',
      query: 'What do you know about TechCorp?',
      max_tokens: 1000,
      temperature: 0.7
    };
  });

  describe('OpenAIModel', () => {
    let openAIModel: OpenAIModel;

    beforeEach(() => {
      openAIModel = new OpenAIModel(openAIConfig);
    });

    describe('constructor', () => {
      it('should create OpenAI model with valid config', () => {
        expect(openAIModel).toBeInstanceOf(OpenAIModel);
        expect(openAIModel.config.provider).toBe('openai');
        expect(openAIModel.config.name).toBe('GPT-4');
      });

      it('should throw error with invalid config', () => {
        const invalidConfig = { ...openAIConfig, api_key: '' };
        expect(() => new OpenAIModel(invalidConfig)).toThrow('API key is required');
      });
    });

    describe('validateQuery', () => {
      it('should validate correct query', () => {
        const isValid = openAIModel.validateQuery(testQuery);
        expect(isValid).toBe(true);
      });

      it('should reject empty query', () => {
        const invalidQuery = { ...testQuery, query: '' };
        const isValid = openAIModel.validateQuery(invalidQuery);
        expect(isValid).toBe(false);
      });

      it('should reject query without brand_id', () => {
        const invalidQuery = { ...testQuery, brand_id: '' };
        const isValid = openAIModel.validateQuery(invalidQuery);
        expect(isValid).toBe(false);
      });

      it('should reject overly long query', () => {
        const invalidQuery = { ...testQuery, query: 'a'.repeat(10001) };
        const isValid = openAIModel.validateQuery(invalidQuery);
        expect(isValid).toBe(false);
      });
    });

    describe('estimateCost', () => {
      it('should estimate cost based on query length', () => {
        const cost = openAIModel.estimateCost(testQuery);
        expect(cost).toBeGreaterThan(0);
        expect(typeof cost).toBe('number');
      });

      it('should estimate higher cost for longer queries', () => {
        const shortQuery = { ...testQuery, query: 'Short query' };
        const longQuery = { ...testQuery, query: 'This is a much longer query that should cost more to process because it has many more tokens' };
        
        const shortCost = openAIModel.estimateCost(shortQuery);
        const longCost = openAIModel.estimateCost(longQuery);
        
        expect(longCost).toBeGreaterThan(shortCost);
      });
    });

    describe('checkRateLimit', () => {
      it('should return rate limit info', async () => {
        const rateLimitInfo = await openAIModel.checkRateLimit();
        
        expect(rateLimitInfo).toHaveProperty('requests_remaining');
        expect(rateLimitInfo).toHaveProperty('reset_time');
        expect(rateLimitInfo.requests_remaining).toBeLessThanOrEqual(openAIConfig.rate_limit_per_minute);
      });
    });

    describe('query', () => {
      it('should make API call and return response', async () => {
        const mockAxiosInstance = {
          post: jest.fn().mockResolvedValue({
            data: {
              id: 'chatcmpl-test',
              object: 'chat.completion',
              created: 1234567890,
              model: 'gpt-4-1106-preview',
              choices: [{
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'TechCorp is a technology company...'
                },
                finish_reason: 'stop'
              }],
              usage: {
                prompt_tokens: 20,
                completion_tokens: 50,
                total_tokens: 70
              }
            }
          })
        };

        // Mock the axios instance
        (openAIModel as any).axiosInstance = mockAxiosInstance;

        const response = await openAIModel.query(testQuery);

        expect(response).toHaveProperty('id');
        expect(response).toHaveProperty('response');
        expect(response).toHaveProperty('usage');
        expect(response).toHaveProperty('cost');
        expect(response.model_name).toBe('GPT-4');
        expect(response.provider).toBe('openai');
        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          '/chat/completions',
          expect.objectContaining({
            model: 'gpt-4-1106-preview',
            messages: expect.arrayContaining([
              expect.objectContaining({ role: 'user' })
            ])
          })
        );
      });

      it('should handle API errors gracefully', async () => {
        const mockAxiosInstance = {
          post: jest.fn().mockRejectedValue({
            response: {
              status: 401,
              data: {
                error: {
                  message: 'Invalid API key',
                  type: 'invalid_request_error'
                }
              }
            }
          })
        };

        (openAIModel as any).axiosInstance = mockAxiosInstance;

        await expect(openAIModel.query(testQuery)).rejects.toThrow();
      });
    });
  });

  describe('AnthropicModel', () => {
    let anthropicModel: AnthropicModel;

    beforeEach(() => {
      anthropicModel = new AnthropicModel(anthropicConfig);
    });

    describe('constructor', () => {
      it('should create Anthropic model with valid config', () => {
        expect(anthropicModel).toBeInstanceOf(AnthropicModel);
        expect(anthropicModel.config.provider).toBe('anthropic');
        expect(anthropicModel.config.name).toBe('Claude 3 Opus');
      });
    });

    describe('query', () => {
      it('should make API call and return response', async () => {
        const mockAxiosInstance = {
          post: jest.fn().mockResolvedValue({
            data: {
              id: 'msg_test',
              type: 'message',
              role: 'assistant',
              content: [{
                type: 'text',
                text: 'TechCorp is a technology company...'
              }],
              model: 'claude-3-opus-20240229',
              stop_reason: 'end_turn',
              usage: {
                input_tokens: 20,
                output_tokens: 50
              }
            }
          })
        };

        (anthropicModel as any).axiosInstance = mockAxiosInstance;

        const response = await anthropicModel.query(testQuery);

        expect(response).toHaveProperty('id');
        expect(response).toHaveProperty('response');
        expect(response).toHaveProperty('usage');
        expect(response.model_name).toBe('Claude 3 Opus');
        expect(response.provider).toBe('anthropic');
        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          '/messages',
          expect.objectContaining({
            model: 'claude-3-opus-20240229',
            messages: expect.arrayContaining([
              expect.objectContaining({ role: 'user' })
            ])
          })
        );
      });
    });
  });

  describe('GeminiModel', () => {
    let geminiModel: GeminiModel;

    beforeEach(() => {
      geminiModel = new GeminiModel(geminiConfig);
    });

    describe('constructor', () => {
      it('should create Gemini model with valid config', () => {
        expect(geminiModel).toBeInstanceOf(GeminiModel);
        expect(geminiModel.config.provider).toBe('gemini');
        expect(geminiModel.config.name).toBe('Gemini Pro');
      });

      it('should throw error with invalid config', () => {
        const invalidConfig = { ...geminiConfig, api_key: '' };
        expect(() => new GeminiModel(invalidConfig)).toThrow('API key is required');
      });
    });

    describe('validateQuery', () => {
      it('should validate correct query', () => {
        const isValid = geminiModel.validateQuery(testQuery);
        expect(isValid).toBe(true);
      });

      it('should reject empty query', () => {
        const invalidQuery = { ...testQuery, query: '' };
        const isValid = geminiModel.validateQuery(invalidQuery);
        expect(isValid).toBe(false);
      });
    });

    describe('query', () => {
      it('should make API call and return response', async () => {
        const mockAxiosInstance = {
          post: jest.fn().mockResolvedValue({
            data: {
              candidates: [{
                content: {
                  parts: [{
                    text: 'TechCorp is a technology company...'
                  }],
                  role: 'model'
                },
                finishReason: 'STOP',
                index: 0,
                safetyRatings: []
              }],
              usageMetadata: {
                promptTokenCount: 20,
                candidatesTokenCount: 50,
                totalTokenCount: 70
              }
            }
          })
        };

        (geminiModel as any).axiosInstance = mockAxiosInstance;

        const response = await geminiModel.query(testQuery);

        expect(response).toHaveProperty('id');
        expect(response).toHaveProperty('response');
        expect(response).toHaveProperty('usage');
        expect(response).toHaveProperty('cost');
        expect(response.model_name).toBe('Gemini Pro');
        expect(response.provider).toBe('gemini');
        expect(response.response).toBe('TechCorp is a technology company...');
        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          expect.stringContaining('/v1beta/models/gemini-1.5-pro-latest:generateContent'),
          expect.objectContaining({
            contents: expect.arrayContaining([
              expect.objectContaining({
                parts: expect.arrayContaining([
                  expect.objectContaining({ text: expect.stringContaining('TechCorp') })
                ])
              })
            ])
          })
        );
      });

      it('should handle API errors gracefully', async () => {
        const mockAxiosInstance = {
          post: jest.fn().mockRejectedValue({
            response: {
              status: 400,
              data: {
                error: {
                  code: 400,
                  message: 'Invalid request',
                  status: 'INVALID_ARGUMENT'
                }
              }
            }
          })
        };

        (geminiModel as any).axiosInstance = mockAxiosInstance;

        await expect(geminiModel.query(testQuery)).rejects.toThrow();
      });
    });

    describe('queryWithVision', () => {
      it('should make API call with image data', async () => {
        const visionQuery = {
          ...testQuery,
          imageData: 'base64-encoded-image-data',
          mimeType: 'image/jpeg'
        };

        const mockAxiosInstance = {
          post: jest.fn().mockResolvedValue({
            data: {
              candidates: [{
                content: {
                  parts: [{
                    text: 'This image shows TechCorp\'s logo...'
                  }],
                  role: 'model'
                },
                finishReason: 'STOP',
                index: 0
              }],
              usageMetadata: {
                promptTokenCount: 25,
                candidatesTokenCount: 60,
                totalTokenCount: 85
              }
            }
          })
        };

        (geminiModel as any).axiosInstance = mockAxiosInstance;

        const response = await geminiModel.queryWithVision(visionQuery);

        expect(response).toHaveProperty('id');
        expect(response).toHaveProperty('response');
        expect(response.response).toContain('logo');
        expect(response.metadata?.has_vision).toBe(true);
        expect(mockAxiosInstance.post).toHaveBeenCalledWith(
          expect.stringContaining('/v1beta/models/gemini-1.5-pro-latest:generateContent'),
          expect.objectContaining({
            contents: expect.arrayContaining([
              expect.objectContaining({
                parts: expect.arrayContaining([
                  expect.objectContaining({
                    inline_data: expect.objectContaining({
                      mime_type: 'image/jpeg',
                      data: 'base64-encoded-image-data'
                    })
                  })
                ])
              })
            ])
          })
        );
      });
    });

    describe('estimateCost', () => {
      it('should estimate cost based on query length', () => {
        const cost = geminiModel.estimateCost(testQuery);
        expect(cost).toBeGreaterThan(0);
        expect(typeof cost).toBe('number');
      });
    });
  });

  describe('AIModelManager', () => {
    let aiModelManager: AIModelManager;

    beforeEach(() => {
      // Mock database response for AI models
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'openai-gpt4',
            name: 'GPT-4',
            provider: 'openai',
            model_version: 'gpt-4-1106-preview',
            api_endpoint: 'https://api.openai.com/v1',
            rate_limit_per_minute: 500,
            cost_per_request: 0.03
          },
          {
            id: 'anthropic-claude',
            name: 'Claude 3 Opus',
            provider: 'anthropic',
            model_version: 'claude-3-opus-20240229',
            api_endpoint: 'https://api.anthropic.com/v1',
            rate_limit_per_minute: 1000,
            cost_per_request: 0.015
          }
        ]
      });

      // Mock environment variables
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

      aiModelManager = new AIModelManager();
    });

    describe('initializeModels', () => {
      it('should initialize models from database', async () => {
        await aiModelManager.initializeModels();
        
        const availableModels = aiModelManager.getAvailableModels();
        expect(availableModels).toContain('GPT-4');
        expect(availableModels).toContain('Claude 3 Opus');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT * FROM ai_models')
        );
      });
    });

    describe('generateBrandQuery', () => {
      it('should generate query from template', () => {
        const brandMonitoringQuery = {
          brand_name: 'TechCorp',
          query_type: 'visibility' as const,
          query_template: 'What do you know about {brand_name}?'
        };

        const aiQuery = aiModelManager.generateBrandQuery(brandMonitoringQuery);

        expect(aiQuery.query).toContain('TechCorp');
        expect(aiQuery.brand_id).toBe('TechCorp');
        expect(aiQuery.metadata?.query_type).toBe('visibility');
      });

      it('should replace multiple placeholders', () => {
        const brandMonitoringQuery = {
          brand_name: 'TechCorp',
          query_type: 'comparison' as const,
          query_template: 'How does {brand_name} compare to {competitors}?',
          competitors: ['CompetitorA', 'CompetitorB']
        };

        const aiQuery = aiModelManager.generateBrandQuery(brandMonitoringQuery);

        expect(aiQuery.query).toContain('TechCorp');
        expect(aiQuery.query).toContain('CompetitorA, CompetitorB');
      });
    });

    describe('getModel', () => {
      it('should return model by name', async () => {
        await aiModelManager.initializeModels();
        
        const model = aiModelManager.getModel('GPT-4');
        expect(model).toBeTruthy();
        expect(model?.config.name).toBe('GPT-4');
      });

      it('should return default model when no name provided', async () => {
        await aiModelManager.initializeModels();
        
        const model = aiModelManager.getModel();
        expect(model).toBeTruthy();
      });

      it('should return null for non-existent model', async () => {
        await aiModelManager.initializeModels();
        
        const model = aiModelManager.getModel('NonExistentModel');
        expect(model).toBeNull();
      });
    });

    describe('batchProcessBrandQueries', () => {
      it('should process multiple queries in batches', async () => {
        await aiModelManager.initializeModels();
        
        const queries = [
          {
            brand_name: 'TechCorp',
            query_type: 'visibility' as const,
            query_template: 'What do you know about {brand_name}?'
          },
          {
            brand_name: 'InnovaCorp',
            query_type: 'sentiment' as const,
            query_template: 'What is the sentiment about {brand_name}?'
          }
        ];

        // Mock successful responses
        const mockModel = {
          query: jest.fn().mockResolvedValue({
            id: 'test-response',
            response: 'Test response',
            model_name: 'GPT-4',
            provider: 'openai'
          })
        };

        (aiModelManager as any).models.set('GPT-4', mockModel);

        const results = await aiModelManager.batchProcessBrandQueries(queries, {
          modelName: 'GPT-4',
          maxConcurrent: 2,
          delayBetweenRequests: 0
        });

        expect(results).toHaveLength(2);
        expect(results[0]?.result).toBeTruthy();
        expect(results[1]?.result).toBeTruthy();
        expect(mockModel.query).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Response Parsing', () => {
    let openAIModel: OpenAIModel;

    beforeEach(() => {
      openAIModel = new OpenAIModel(openAIConfig);
    });

    describe('extractCitations', () => {
      it('should extract URLs from response text', async () => {
        const text = 'According to https://example.com/article, TechCorp is a leading company. More info at https://techcorp.com/about.';
        
        const citations = await (openAIModel as any).extractCitations(text);
        
        expect(citations).toHaveLength(2);
        expect(citations[0].url).toBe('https://example.com/article');
        expect(citations[1].url).toBe('https://techcorp.com/about');
        expect(citations[0].domain).toBe('example.com');
      });

      it('should handle text without URLs', async () => {
        const text = 'This is a response without any URLs.';
        
        const citations = await (openAIModel as any).extractCitations(text);
        
        expect(citations).toHaveLength(0);
      });
    });

    describe('analyzeSentiment', () => {
      it('should analyze positive sentiment', async () => {
        const text = 'TechCorp is an excellent company with great products and amazing innovation.';
        
        const sentiment = await (openAIModel as any).analyzeSentiment(text);
        
        expect(sentiment.sentiment_label).toBe('positive');
        expect(sentiment.overall_sentiment).toBeGreaterThan(0);
        expect(sentiment.confidence).toBeGreaterThan(0);
      });

      it('should analyze negative sentiment', async () => {
        const text = 'TechCorp is a terrible company with awful products and disappointing service.';
        
        const sentiment = await (openAIModel as any).analyzeSentiment(text);
        
        expect(sentiment.sentiment_label).toBe('negative');
        expect(sentiment.overall_sentiment).toBeLessThan(0);
      });

      it('should analyze neutral sentiment', async () => {
        const text = 'TechCorp is a company that makes products.';
        
        const sentiment = await (openAIModel as any).analyzeSentiment(text);
        
        expect(sentiment.sentiment_label).toBe('neutral');
        expect(Math.abs(sentiment.overall_sentiment)).toBeLessThanOrEqual(0.1);
      });
    });
  });
});

