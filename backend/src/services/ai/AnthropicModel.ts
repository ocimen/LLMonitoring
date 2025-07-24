import axios, { AxiosResponse } from 'axios';
import { BaseAIModel } from './BaseAIModel';
import { AIQuery, AIResponse, AIModelConfig, AIModelError } from '../../types/ai';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string;
}

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicError {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

export class AnthropicModel extends BaseAIModel {
  private readonly axiosInstance;

  constructor(config: AIModelConfig) {
    super(config);
    
    this.axiosInstance = axios.create({
      baseURL: config.api_endpoint,
      headers: {
        'x-api-key': config.api_key,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
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
      
      const anthropicRequest: AnthropicRequest = {
        model: this.config.model_version,
        max_tokens: request.max_tokens || this.config.max_tokens || 1000,
        messages: [
          {
            role: 'user',
            content: request.context ? `${request.context}\n\n${request.query}` : request.query
          }
        ],
        temperature: request.temperature || this.config.temperature || 0.7,
        top_p: 1,
        system: 'You are a helpful assistant that provides accurate information about brands, companies, and products. Please provide detailed, factual responses and cite sources when possible.'
      };

      const response: AxiosResponse<AnthropicResponse> = await this.axiosInstance.post(
        '/messages',
        anthropicRequest
      );

      const processingTime = Date.now() - startTime;
      const anthropicResponse = response.data;

      if (!anthropicResponse.content || anthropicResponse.content.length === 0) {
        throw this.createError('No response generated', 'NO_RESPONSE', 500);
      }

      const textContent = anthropicResponse.content
        .filter(content => content.type === 'text')
        .map(content => content.text)
        .join('\n');

      const cost = this.calculateActualCost(anthropicResponse.usage);

      return {
        id: anthropicResponse.id,
        query_id: request.id,
        model_name: this.config.name,
        provider: this.config.provider,
        response: textContent,
        usage: {
          prompt_tokens: anthropicResponse.usage.input_tokens,
          completion_tokens: anthropicResponse.usage.output_tokens,
          total_tokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
        },
        cost,
        processing_time_ms: processingTime,
        confidence_score: this.calculateConfidenceScore(anthropicResponse),
        metadata: {
          stop_reason: anthropicResponse.stop_reason,
          stop_sequence: anthropicResponse.stop_sequence,
          model_version: anthropicResponse.model,
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
        `Anthropic API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      console.error('Anthropic health check failed:', error);
      return false;
    }
  }

  // Anthropic-specific methods
  async streamQuery(request: AIQuery): Promise<AsyncGenerator<string, void, unknown>> {
    if (!this.validateQuery(request)) {
      throw this.createError('Invalid query parameters', 'INVALID_QUERY', 400);
    }

    const anthropicRequest: AnthropicRequest = {
      model: this.config.model_version,
      max_tokens: request.max_tokens || this.config.max_tokens || 1000,
      messages: [
        {
          role: 'user',
          content: request.context ? `${request.context}\n\n${request.query}` : request.query
        }
      ],
      temperature: request.temperature || this.config.temperature || 0.7,
      stream: true,
      system: 'You are a helpful assistant that provides accurate information about brands, companies, and products.'
    };

    try {
      this.incrementRequestCount();
      
      const response = await this.axiosInstance.post('/messages', anthropicRequest, {
        responseType: 'stream'
      });

      return this.parseStreamResponse(response.data);
    } catch (error) {
      throw this.createError(
        `Anthropic streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'STREAM_ERROR',
        500
      );
    }
  }

  // Private helper methods
  private async* parseStreamResponse(stream: any): AsyncGenerator<string, void, unknown> {
    // This is a simplified stream parser
    // In production, you'd want more robust SSE parsing
    let buffer = '';
    
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch (error) {
            // Skip invalid JSON
            continue;
          }
        }
      }
    }
  }

  private calculateActualCost(usage: AnthropicResponse['usage']): number {
    // Anthropic pricing is typically per 1000 tokens
    // Input and output tokens may have different pricing
    const totalTokens = usage.input_tokens + usage.output_tokens;
    const costPer1000Tokens = this.config.cost_per_request;
    return (totalTokens / 1000) * costPer1000Tokens;
  }

  private calculateConfidenceScore(response: AnthropicResponse): number {
    // Simple confidence calculation based on stop reason
    switch (response.stop_reason) {
      case 'end_turn':
        return 0.9; // Natural completion
      case 'max_tokens':
        return 0.7; // Truncated due to length
      case 'stop_sequence':
        return 0.8; // Stopped at sequence
      default:
        return 0.5; // Unknown reason
    }
  }

  private handleAxiosError(error: any): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as AnthropicError;
      
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
            'Anthropic service unavailable',
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
        'Network error - unable to reach Anthropic API',
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

  // Override base class methods for Anthropic-specific behavior
  override estimateCost(query: AIQuery): number {
    // More accurate estimation for Anthropic
    const promptTokens = Math.ceil(query.query.length / 4); // Rough estimation
    const maxTokens = query.max_tokens || this.config.max_tokens || 1000;
    const totalTokens = promptTokens + maxTokens;
    
    // Anthropic pricing per 1000 tokens
    return (totalTokens / 1000) * this.config.cost_per_request;
  }
}