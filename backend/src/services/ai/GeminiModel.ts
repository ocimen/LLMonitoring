import axios, { AxiosResponse } from 'axios';
import { BaseAIModel } from './BaseAIModel';
import { AIQuery, AIResponse, AIModelConfig } from '../../types/ai';

interface GeminiPart {
  text: string;
}

interface GeminiInlineData {
  mime_type: string;
  data: string;
}

interface GeminiImagePart {
  inline_data: GeminiInlineData;
}

interface GeminiRequest {
  contents: Array<{
    parts: (GeminiPart | GeminiImagePart)[];
    role?: 'user' | 'model';
  }>;
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: GeminiPart[];
      role: 'model';
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    index: number;
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  promptFeedback?: {
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  };
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface GeminiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

interface VisionQuery extends AIQuery {
  imageData?: string;
  mimeType?: string;
}

export class GeminiModel extends BaseAIModel {
  private readonly axiosInstance;

  constructor(config: AIModelConfig) {
    super(config);
    
    this.axiosInstance = axios.create({
      baseURL: config.api_endpoint,
      headers: {
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

      const geminiRequest: GeminiRequest = {
        contents: [
          {
            parts: [
              {
                text: request.context 
                  ? `${request.context}\n\n${request.query}` 
                  : request.query
              }
            ],
            role: 'user'
          }
        ],
        generationConfig: {
          maxOutputTokens: request.max_tokens || this.config.max_tokens || 1000,
          temperature: request.temperature || this.config.temperature || 0.7,
          topP: 1,
          topK: 40
        }
      };

      // For Gemini, we need to append the API key as a query parameter
      const endpoint = `/v1beta/models/${this.config.model_version}:generateContent?key=${this.config.api_key}`;

      const response: AxiosResponse<GeminiResponse> = await this.axiosInstance.post(
        endpoint,
        geminiRequest
      );

      const processingTime = Date.now() - startTime;
      const geminiResponse = response.data;

      if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
        throw this.createError('No response generated', 'NO_RESPONSE', 500);
      }

      const candidate = geminiResponse.candidates[0];
      if (!candidate) {
        throw this.createError('No candidate response found', 'NO_CANDIDATE', 500);
      }

      const textContent = candidate.content.parts
        .filter(part => 'text' in part)
        .map(part => part.text)
        .join('\n');

      const cost = this.calculateActualCost(geminiResponse.usageMetadata);

      return {
        id: `gemini-${Date.now()}`,
        query_id: request.id,
        model_name: this.config.name,
        provider: this.config.provider,
        response: textContent,
        usage: {
          prompt_tokens: geminiResponse.usageMetadata.promptTokenCount,
          completion_tokens: geminiResponse.usageMetadata.candidatesTokenCount,
          total_tokens: geminiResponse.usageMetadata.totalTokenCount
        },
        cost,
        processing_time_ms: processingTime,
        confidence_score: this.calculateConfidenceScore(candidate),
        metadata: {
          finish_reason: candidate.finishReason,
          safety_ratings: candidate.safetyRatings,
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
        `Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'API_ERROR',
        500
      );
    }
  }

  async queryWithVision(request: VisionQuery): Promise<AIResponse> {
    if (!this.validateQuery(request)) {
      throw this.createError('Invalid query parameters', 'INVALID_QUERY', 400);
    }

    const startTime = Date.now();
    try {
      this.incrementRequestCount();

      const parts: (GeminiPart | GeminiImagePart)[] = [
        {
          text: request.context 
            ? `${request.context}\n\n${request.query}` 
            : request.query
        }
      ];

      // Add image data if provided
      if (request.imageData && request.mimeType) {
        parts.push({
          inline_data: {
            mime_type: request.mimeType,
            data: request.imageData
          }
        });
      }

      const geminiRequest: GeminiRequest = {
        contents: [
          {
            parts,
            role: 'user'
          }
        ],
        generationConfig: {
          maxOutputTokens: request.max_tokens || this.config.max_tokens || 1000,
          temperature: request.temperature || this.config.temperature || 0.7,
          topP: 1,
          topK: 40
        }
      };

      const endpoint = `/v1beta/models/${this.config.model_version}:generateContent?key=${this.config.api_key}`;

      const response: AxiosResponse<GeminiResponse> = await this.axiosInstance.post(
        endpoint,
        geminiRequest
      );

      const processingTime = Date.now() - startTime;
      const geminiResponse = response.data;

      if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
        throw this.createError('No response generated', 'NO_RESPONSE', 500);
      }

      const candidate = geminiResponse.candidates[0];
      if (!candidate) {
        throw this.createError('No candidate response found', 'NO_CANDIDATE', 500);
      }

      const textContent = candidate.content.parts
        .filter(part => 'text' in part)
        .map(part => part.text)
        .join('\n');

      const cost = this.calculateActualCost(geminiResponse.usageMetadata);

      return {
        id: `gemini-vision-${Date.now()}`,
        query_id: request.id,
        model_name: this.config.name,
        provider: this.config.provider,
        response: textContent,
        usage: {
          prompt_tokens: geminiResponse.usageMetadata.promptTokenCount,
          completion_tokens: geminiResponse.usageMetadata.candidatesTokenCount,
          total_tokens: geminiResponse.usageMetadata.totalTokenCount
        },
        cost,
        processing_time_ms: processingTime,
        confidence_score: this.calculateConfidenceScore(candidate),
        metadata: {
          finish_reason: candidate.finishReason,
          safety_ratings: candidate.safetyRatings,
          has_vision: true,
          ...request.metadata
        },
        created_at: new Date()
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw this.createError(
        `Gemini Vision API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      console.error('Gemini health check failed:', error);
      return false;
    }
  }

  // Private helper methods
  private calculateActualCost(usage: GeminiResponse['usageMetadata']): number {
    // Gemini pricing is typically per 1000 tokens
    const costPer1000Tokens = this.config.cost_per_request;
    return (usage.totalTokenCount / 1000) * costPer1000Tokens;
  }

  private calculateConfidenceScore(candidate: GeminiResponse['candidates'][0]): number {
    // Simple confidence calculation based on finish reason
    switch (candidate.finishReason) {
      case 'STOP':
        return 0.9; // Natural completion
      case 'MAX_TOKENS':
        return 0.7; // Truncated due to length
      case 'SAFETY':
        return 0.3; // Content filtered for safety
      case 'RECITATION':
        return 0.5; // Model detected recitation
      default:
        return 0.5; // Unknown reason
    }
  }

  private handleAxiosError(error: any): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as GeminiError;

      switch (status) {
        case 400:
          throw this.createError(
            data.error?.message || 'Bad request',
            'BAD_REQUEST',
            400
          );
        case 401:
          throw this.createError(
            'Invalid API key',
            'INVALID_API_KEY',
            401
          );
        case 403:
          throw this.createError(
            'Access forbidden',
            'ACCESS_FORBIDDEN',
            403
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
        case 500:
        case 502:
        case 503:
          throw this.createError(
            'Gemini service unavailable',
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
        'Network error - unable to reach Gemini API',
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

  // Override base class methods for Gemini-specific behavior
  override estimateCost(query: AIQuery): number {
    // More accurate estimation for Gemini
    const promptTokens = Math.ceil(query.query.length / 4); // Rough estimation
    const maxTokens = query.max_tokens || this.config.max_tokens || 1000;
    const totalTokens = promptTokens + maxTokens;
    
    // Gemini pricing per 1000 tokens
    return (totalTokens / 1000) * this.config.cost_per_request;
  }
}