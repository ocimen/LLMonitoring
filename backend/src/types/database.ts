// Database model interfaces based on our schema

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'brand_manager' | 'analyst';
  is_active: boolean;
  email_verified: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Brand {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  description?: string;
  logo_url?: string;
  website_url?: string;
  monitoring_keywords: string[];
  competitor_brands: string[];
  is_active: boolean;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserBrand {
  id: string;
  user_id: string;
  brand_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: Date;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  model_version?: string;
  api_endpoint?: string;
  is_active: boolean;
  rate_limit_per_minute: number;
  cost_per_request?: number;
  created_at: Date;
  updated_at: Date;
}

export interface AIResponse {
  id: string;
  brand_id: string;
  ai_model_id: string;
  query: string;
  response: string;
  response_metadata?: Record<string, any>;
  confidence_score?: number;
  processing_time_ms?: number;
  tokens_used?: number;
  cost?: number;
  created_at: Date;
}

export interface Citation {
  id: string;
  ai_response_id: string;
  url: string;
  domain?: string;
  title?: string;
  content_snippet?: string;
  authority_score?: number;
  relevance_score?: number;
  content_type?: string;
  publish_date?: Date;
  last_crawled?: Date;
  created_at: Date;
}

export interface BrandMention {
  id: string;
  ai_response_id: string;
  brand_id: string;
  mention_text: string;
  context?: string;
  position_in_response?: number;
  sentiment_score?: number;
  sentiment_label?: 'positive' | 'negative' | 'neutral';
  confidence?: number;
  created_at: Date;
}

export interface VisibilityMetrics {
  id: string;
  brand_id: string;
  ai_model_id?: string;
  metric_date: Date;
  metric_hour?: number;
  overall_score?: number;
  ranking_position?: number;
  mention_frequency: number;
  average_sentiment?: number;
  citation_count: number;
  source_quality_score?: number;
  geographic_region?: string;
  query_category?: string;
  created_at: Date;
}

export interface AlertThreshold {
  id: string;
  brand_id: string;
  user_id: string;
  metric_type: string;
  threshold_value: number;
  comparison_operator: '>' | '<' | '>=' | '<=' | '=';
  is_active: boolean;
  notification_channels: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Alert {
  id: string;
  brand_id: string;
  alert_threshold_id?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  metric_type: string;
  current_value?: number;
  threshold_value?: number;
  is_acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: Date;
  resolved_at?: Date;
  created_at: Date;
}

export interface CompetitiveAnalysis {
  id: string;
  brand_id: string;
  competitor_brand_name: string;
  analysis_date: Date;
  brand_visibility_score?: number;
  competitor_visibility_score?: number;
  brand_mention_count: number;
  competitor_mention_count: number;
  brand_sentiment_avg?: number;
  competitor_sentiment_avg?: number;
  market_share_percentage?: number;
  competitive_gap?: number;
  analysis_metadata?: Record<string, any>;
  created_at: Date;
}

export interface UserSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  is_revoked: boolean;
  user_agent?: string;
  ip_address?: string;
  created_at: Date;
}

// Input types for creating new records
export interface CreateUserInput {
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role?: 'admin' | 'brand_manager' | 'analyst';
}

export interface CreateAIResponseInput {
  brand_id: string;
  ai_model_id: string;
  query: string;
  response: string;
  response_metadata?: Record<string, any>;
  confidence_score?: number;
  processing_time_ms?: number;
  tokens_used?: number;
  cost?: number;
}

export interface CreateBrandInput {
  name: string;
  domain?: string;
  industry?: string;
  description?: string;
  logo_url?: string;
  website_url?: string;
  monitoring_keywords?: string[];
  competitor_brands?: string[];
  created_by?: string;
}

export interface CreateVisibilityMetricsInput {
  brand_id: string;
  ai_model_id?: string;
  metric_date: Date;
  metric_hour?: number;
  overall_score?: number;
  ranking_position?: number;
  mention_frequency?: number;
  average_sentiment?: number;
  citation_count?: number;
  source_quality_score?: number;
  geographic_region?: string;
  query_category?: string;
}

// Query result types
export interface DatabaseQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

// Conversation tracking interfaces
export interface Conversation {
  id: string;
  brand_id: string;
  conversation_thread_id?: string;
  ai_model_id: string;
  conversation_type: 'query_response' | 'follow_up' | 'multi_turn' | 'comparison';
  initial_query: string;
  conversation_context?: Record<string, any>;
  total_turns: number;
  is_active: boolean;
  started_at: Date;
  last_activity_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationTurn {
  id: string;
  conversation_id: string;
  turn_number: number;
  user_input: string;
  ai_response: string;
  ai_response_id?: string;
  turn_type: 'initial' | 'follow_up' | 'clarification' | 'comparison';
  processing_time_ms?: number;
  tokens_used?: number;
  cost?: number;
  created_at: Date;
}

export interface ConversationMention {
  id: string;
  conversation_id: string;
  conversation_turn_id?: string;
  brand_id: string;
  mention_text: string;
  mention_context: string;
  position_in_conversation: number;
  mention_type: 'direct' | 'indirect' | 'comparison' | 'recommendation';
  sentiment_score?: number;
  sentiment_label?: 'positive' | 'negative' | 'neutral';
  relevance_score?: number;
  confidence?: number;
  created_at: Date;
}

export interface ConversationTopic {
  id: string;
  conversation_id: string;
  topic_name: string;
  topic_category: string;
  relevance_score: number;
  first_mentioned_turn: number;
  last_mentioned_turn: number;
  mention_count: number;
  created_at: Date;
}

export interface ConversationRelationship {
  id: string;
  parent_conversation_id: string;
  child_conversation_id: string;
  relationship_type: 'follow_up' | 'related_topic' | 'comparison' | 'clarification';
  relationship_strength: number;
  created_at: Date;
}

// Input types for conversation tracking
export interface CreateConversationInput {
  brand_id: string;
  conversation_thread_id?: string;
  ai_model_id: string;
  conversation_type: 'query_response' | 'follow_up' | 'multi_turn' | 'comparison';
  initial_query: string;
  conversation_context?: Record<string, any>;
}

export interface CreateConversationTurnInput {
  conversation_id: string;
  turn_number: number;
  user_input: string;
  ai_response: string;
  ai_response_id?: string;
  turn_type: 'initial' | 'follow_up' | 'clarification' | 'comparison';
  processing_time_ms?: number;
  tokens_used?: number;
  cost?: number;
}

export interface CreateConversationMentionInput {
  conversation_id: string;
  conversation_turn_id?: string;
  brand_id: string;
  mention_text: string;
  mention_context: string;
  position_in_conversation: number;
  mention_type: 'direct' | 'indirect' | 'comparison' | 'recommendation';
  sentiment_score?: number;
  sentiment_label?: 'positive' | 'negative' | 'neutral';
  relevance_score?: number;
  confidence?: number;
}

// Common query filters
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface DateRangeFilter {
  start_date?: Date;
  end_date?: Date;
}

export interface BrandMetricsFilter extends PaginationOptions, DateRangeFilter {
  brand_id: string;
  ai_model_id?: string;
  geographic_region?: string;
  query_category?: string;
}

export interface ConversationFilter extends PaginationOptions, DateRangeFilter {
  brand_id?: string;
  ai_model_id?: string;
  conversation_type?: string;
  is_active?: boolean;
  has_mentions?: boolean;
}