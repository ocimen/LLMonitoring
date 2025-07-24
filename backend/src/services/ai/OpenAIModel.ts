import axios, { AxiosResponse } from 'axios';
import { BaseAIModel } from './BaseAIModel';
import { AIQuery, AIResponse, AIModelConfig, AIModelError } from '../../types/ai';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIError {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

export class OpenAIModel extends BaseAIModel {
  private readonly axiosInstance;

  constructor(config: AIModelConfig) {
    super(config);
    
    this.axiosInstance = axios.create({
      baseURL: config.api_endpoint,
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Brand-Monitoring/1.0'
      },
      timeout: 60000 // 60 second timeout
    });

    // Add request interceptor for rate limiting
    this.axiosInstance.interceptors.request.use(async (config) => {
      const rateLimitInfo = await this.checkRateLimit();
      if (rateLimitInfo.requests_remaining === 0) {
        throw this.createError(
          'Rate limit exceeded',
          'RATE_LIMIT_EXCEEDED',
          429,
          rateLimitInfo
        );
      }
      return config;
    });

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => this.handleAxiosError(error)
    );
  }

  async query(request: AIQuery): Promise<AIResponse> {
    if (!this.validateQuery(request)) {
      throw this.createError('Invalid query parameters', 'INVALID_QUERY', 400);
    }

    const startTime = Date.now();
    
    try {
      this.incrementRequestCount();
      
      const openAIRequest: OpenAIRequest = {
        model: this.config.model_version,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides accurate information about brands, companies, and products. Please provide detailed, factual responses and cite sources when possible.'
          },
          {
            role: 'user',
            content: request.context ? `${request.context}\n\n${request.query}` : request.query
          }
        ],
        max_tokens: request.max_tokens || this.config.max_tokens || 1000,
        temperature: request.temperature || this.config.temperature || 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      };

      const response: AxiosResponse<OpenAIResponse> = await this.axiosInstance.post(
        '/chat/completions',
        openAIRequest
      );

      const processingTime = Date.now() - startTime;
      const openAIResponse = response.data;

      if (!openAIResponse.choices || openAIResponse.choices.length === 0) {
        throw this.createError('No response generated', 'NO_RESPONSE', 500);
      }

      const choice = openAIResponse.choices[0];
      if (!choice) {
        throw this.createError('No choice response found', 'NO_CHOICE', 500);
      }

      const cost = this.calculateActualCost(openAIResponse.usage);

      return {
        id: openAIResponse.id,
        query_id: request.id,
        model_name: this.config.name,
        provider: this.config.provider,
        response: choice.message.content,
        usage: openAIResponse.usage,
        cost,
        processing_time_ms: processingTime,
        confidence_score: this.calculateConfidenceScore(choice),
        metadata: {
          finish_reason: choice.finish_reason,
          model_version: openAIResponse.model,
          created: openAIResponse.created,
          ...request.metadata
        },
        created_at: new Date()
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      if (error instanceof Error && 'code' in error) {
        // Re-throw our custom errors
        throw error;
      }
      
      throw this.createError(
        `OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'API_ERROR',
        500
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testQuery: AIQuery = {
        id: 'health-check',
        brand_id: 'test',
        query: 'Hello, this is a health check.',
        max_tokens: 10
      };

      await this.query(testQuery);
      return true;
    } catch (error) {
      console.error('OpenAI health check failed:', error);
      return false;
    }
  }

  // OpenAI-specific methods
  async listModels(): Promise<string[]> {
    try {
      const response = await this.axiosInstance.get('/models');
      return response.data.data.map((model: any) => model.id);
    } catch (error) {
      throw this.createError(
        'Failed to list models',
        'LIST_MODELS_ERROR',
        500
      );
    }
  }

  async getModelInfo(modelId: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/models/${modelId}`);
      return response.data;
    } catch (error) {
      throw this.createError(
        `Failed to get model info for ${modelId}`,
        'MODEL_INFO_ERROR',
        500
      );
    }
  }

  // Private helper methods
  private calculateActualCost(usage: OpenAIResponse['usage']): number {
    // OpenAI pricing is typically per 1000 tokens
    // This is a simplified calculation - actual pricing may vary by model
    const costPer1000Tokens = this.config.cost_per_request;
    return (usage.total_tokens / 1000) * costPer1000Tokens;
  }

  private calculateConfidenceScore(choice: OpenAIResponse['choices'][0]): number {
    // Simple confidence calculation based on finish reason
    switch (choice.finish_reason) {
      case 'stop':
        return 0.9; // Natural completion
      case 'length':
        return 0.7; // Truncated due to length
      case 'content_filter':
        return 0.3; // Content filtered
      default:
        return 0.5; // Unknown reason
    }
  }

  private handleAxiosError(error: any): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as OpenAIError;
      
      switch (status) {
        case 401:
          throw this.createError(
            'Invalid API key',
            'INVALID_API_KEY',
            401
          );
        case 429:
          const retryAfter = error.response.headers['retry-after'];
          throw this.createError(
            'Rate limit exceeded',
            'RATE_LIMIT_EXCEEDED',
            429,
            {
              requests_remaining: 0,
              reset_time: new Date(Date.now() + (retryAfter ? parseInt(retryAfter) * 1000 : 60000)),
              retry_after: retryAfter ? parseInt(retryAfter) : 60
            }
          );
        case 400:
          throw this.createError(
            data.error?.message || 'Bad request',
            'BAD_REQUEST',
            400
          );
        case 500:
        case 502:
        case 503:
          throw this.createError(
            'OpenAI service unavailable',
            'SERVICE_UNAVAILABLE',
            status
          );
        default:
          throw this.createError(
            data.error?.message || 'Unknown API error',
            'API_ERROR',
            status
          );
      }
    } else if (error.request) {
      throw this.createError(
        'Network error - unable to reach OpenAI API',
        'NETWORK_ERROR',
        0
      );
    } else {
      throw this.createError(
        error.message || 'Unknown error',
        'UNKNOWN_ERROR',
        500
      );
    }
  }

  // Override base class methods for OpenAI-specific behavior
  override estimateCost(query: AIQuery): number {
    // More accurate estimation for OpenAI
    const promptTokens = Math.ceil(query.query.length / 4); // Rough estimation
    const maxTokens = query.max_tokens || this.config.max_tokens || 1000;
    const totalTokens = promptTokens + maxTokens;
    
    // OpenAI pricing per 1000 tokens
    return (totalTokens / 1000) * this.config.cost_per_request;
  }
}