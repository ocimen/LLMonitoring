// AI Model Integration Types

export interface AIModelConfig {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  model_version: string;
  api_endpoint: string;
  api_key: string;
  rate_limit_per_minute: number;
  cost_per_request: number;
  max_tokens?: number;
  temperature?: number;
}

export interface AIQuery {
  id: string;
  brand_id: string;
  query: string;
  context?: string;
  max_tokens?: number;
  temperature?: number;
  metadata?: Record<string, any>;
}

export interface AIResponse {
  id: string;
  query_id: string;
  model_name: string;
  provider: string;
  response: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost: number;
  processing_time_ms: number;
  confidence_score?: number;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface Citation {
  url: string;
  title?: string;
  domain?: string;
  content_snippet?: string;
  authority_score?: number;
  relevance_score?: number;
  content_type?: string;
  publish_date?: Date;
}

export interface BrandMention {
  brand_name: string;
  mention_text: string;
  context: string;
  position_in_response: number;
  sentiment_score: number;
  sentiment_label: 'positive' | 'negative' | 'neutral';
  confidence: number;
}

export interface ParsedAIResponse extends AIResponse {
  citations: Citation[];
  brand_mentions: BrandMention[];
  sentiment_analysis: {
    overall_sentiment: number;
    sentiment_label: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
  topics: string[];
  entities: Array<{
    name: string;
    type: string;
    confidence: number;
  }>;
}

export interface RateLimitInfo {
  requests_remaining: number;
  reset_time: Date;
  retry_after?: number;
}

export interface AIModelError extends Error {
  code: string;
  status?: number;
  rate_limit_info?: RateLimitInfo;
  retry_after?: number;
}

// Abstract AI Model Interface
export interface IAIModel {
  config: AIModelConfig;
  
  // Core methods
  query(request: AIQuery): Promise<AIResponse>;
  parseResponse(response: AIResponse): Promise<ParsedAIResponse>;
  
  // Utility methods
  validateQuery(query: AIQuery): boolean;
  estimateCost(query: AIQuery): number;
  checkRateLimit(): Promise<RateLimitInfo>;
  
  // Health check
  healthCheck(): Promise<boolean>;
}

// Query templates for brand monitoring
export interface BrandMonitoringQuery {
  brand_name: string;
  query_type: 'visibility' | 'sentiment' | 'comparison' | 'reputation' | 'product';
  query_template: string;
  context?: string;
  competitors?: string[];
  products?: string[];
}

export const BRAND_QUERY_TEMPLATES = {
  visibility: "What do you know about {brand_name}? Please provide information about their products, services, and reputation.",
  sentiment: "What is the general sentiment and public opinion about {brand_name}? Include both positive and negative aspects.",
  comparison: "How does {brand_name} compare to {competitors} in terms of products, services, and market position?",
  reputation: "What is {brand_name}'s reputation in the {industry} industry? What are they known for?",
  product: "Tell me about {brand_name}'s {product} product. How does it compare to alternatives?",
  news: "What recent news or developments are there about {brand_name}?",
  leadership: "Who are the key leaders and executives at {brand_name}?",
  financial: "What is the financial performance and business model of {brand_name}?",
  innovation: "What innovations and new technologies is {brand_name} working on?",
  partnerships: "What partnerships and collaborations does {brand_name} have?"
} as const;

export type QueryTemplateType = keyof typeof BRAND_QUERY_TEMPLATES;