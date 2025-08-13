import Joi from 'joi';

// Common validation patterns
const uuidSchema = Joi.string().uuid();
const emailSchema = Joi.string().email().max(255);
const urlSchema = Joi.string().uri().max(500);
const timestampSchema = Joi.date();

// User validation schemas
export const createUserSchema = Joi.object({
  email: emailSchema.required(),
  password: Joi.string().min(8).max(128).required(),
  first_name: Joi.string().min(1).max(100).required(),
  last_name: Joi.string().min(1).max(100).required(),
  role: Joi.string().valid('admin', 'brand_manager', 'analyst').default('analyst')
});

export const updateUserSchema = Joi.object({
  first_name: Joi.string().min(1).max(100),
  last_name: Joi.string().min(1).max(100),
  role: Joi.string().valid('admin', 'brand_manager', 'analyst'),
  is_active: Joi.boolean()
});

export const loginSchema = Joi.object({
  email: emailSchema.required(),
  password: Joi.string().required()
});

// Brand validation schemas
export const createBrandSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  domain: Joi.string().domain().max(255),
  industry: Joi.string().max(100),
  description: Joi.string().max(1000),
  logo_url: urlSchema,
  website_url: urlSchema,
  monitoring_keywords: Joi.array().items(Joi.string().max(100)).max(50).default([]),
  competitor_brands: Joi.array().items(Joi.string().max(255)).max(20).default([])
});

export const updateBrandSchema = Joi.object({
  name: Joi.string().min(1).max(255),
  domain: Joi.string().domain().max(255),
  industry: Joi.string().max(100),
  description: Joi.string().max(1000),
  logo_url: urlSchema,
  website_url: urlSchema,
  monitoring_keywords: Joi.array().items(Joi.string().max(100)).max(50),
  competitor_brands: Joi.array().items(Joi.string().max(255)).max(20),
  is_active: Joi.boolean()
});

// AI Model validation schemas
export const createAIModelSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  provider: Joi.string().min(1).max(100).required(),
  model_version: Joi.string().max(50),
  api_endpoint: urlSchema,
  rate_limit_per_minute: Joi.number().integer().min(1).max(10000).default(60),
  cost_per_request: Joi.number().precision(6).min(0).max(1)
});

export const updateAIModelSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  provider: Joi.string().min(1).max(100),
  model_version: Joi.string().max(50),
  api_endpoint: urlSchema,
  is_active: Joi.boolean(),
  rate_limit_per_minute: Joi.number().integer().min(1).max(10000),
  cost_per_request: Joi.number().precision(6).min(0).max(1)
});

// AI Response validation schemas
export const createAIResponseSchema = Joi.object({
  brand_id: uuidSchema.required(),
  ai_model_id: uuidSchema.required(),
  query: Joi.string().min(1).max(2000).required(),
  response: Joi.string().min(1).max(50000).required(),
  response_metadata: Joi.object(),
  confidence_score: Joi.number().min(0).max(1),
  processing_time_ms: Joi.number().integer().min(0),
  tokens_used: Joi.number().integer().min(0),
  cost: Joi.number().precision(6).min(0)
});

// Citation validation schemas
export const createCitationSchema = Joi.object({
  ai_response_id: uuidSchema.required(),
  url: Joi.string().uri().max(1000).required(),
  domain: Joi.string().max(255),
  title: Joi.string().max(500),
  content_snippet: Joi.string().max(2000),
  authority_score: Joi.number().min(0).max(1),
  relevance_score: Joi.number().min(0).max(1),
  content_type: Joi.string().max(100),
  publish_date: timestampSchema,
  last_crawled: timestampSchema
});

// Brand Mention validation schemas
export const createBrandMentionSchema = Joi.object({
  ai_response_id: uuidSchema.required(),
  brand_id: uuidSchema.required(),
  mention_text: Joi.string().min(1).max(1000).required(),
  context: Joi.string().max(2000),
  position_in_response: Joi.number().integer().min(0),
  sentiment_score: Joi.number().min(-1).max(1),
  sentiment_label: Joi.string().valid('positive', 'negative', 'neutral'),
  confidence: Joi.number().min(0).max(1)
});

// Visibility Metrics validation schemas
export const createVisibilityMetricsSchema = Joi.object({
  brand_id: uuidSchema.required(),
  ai_model_id: uuidSchema,
  metric_date: Joi.date().required(),
  metric_hour: Joi.number().integer().min(0).max(23),
  overall_score: Joi.number().min(0).max(100),
  ranking_position: Joi.number().integer().min(1),
  mention_frequency: Joi.number().integer().min(0).default(0),
  average_sentiment: Joi.number().min(-1).max(1),
  citation_count: Joi.number().integer().min(0).default(0),
  source_quality_score: Joi.number().min(0).max(1),
  geographic_region: Joi.string().max(10),
  query_category: Joi.string().max(100)
});

// Alert Threshold validation schemas
export const createAlertThresholdSchema = Joi.object({
  brand_id: uuidSchema.required(),
  user_id: uuidSchema.required(),
  metric_type: Joi.string().min(1).max(50).required(),
  threshold_value: Joi.number().required(),
  comparison_operator: Joi.string().valid('>', '<', '>=', '<=', '=').required(),
  notification_channels: Joi.array().items(
    Joi.string().valid('email', 'sms', 'webhook', 'in_app')
  ).min(1).required()
});

export const updateAlertThresholdSchema = Joi.object({
  metric_type: Joi.string().min(1).max(50),
  threshold_value: Joi.number(),
  comparison_operator: Joi.string().valid('>', '<', '>=', '<=', '='),
  is_active: Joi.boolean(),
  notification_channels: Joi.array().items(
    Joi.string().valid('email', 'sms', 'webhook', 'in_app')
  ).min(1)
});

// Alert validation schemas
export const createAlertSchema = Joi.object({
  brand_id: uuidSchema.required(),
  alert_threshold_id: uuidSchema,
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  title: Joi.string().min(1).max(255).required(),
  message: Joi.string().min(1).max(2000).required(),
  metric_type: Joi.string().min(1).max(50).required(),
  current_value: Joi.number(),
  threshold_value: Joi.number()
});

// Competitive Analysis validation schemas
export const createCompetitiveAnalysisSchema = Joi.object({
  brand_id: uuidSchema.required(),
  competitor_brand_name: Joi.string().min(1).max(255).required(),
  analysis_date: Joi.date().required(),
  brand_visibility_score: Joi.number().min(0).max(100),
  competitor_visibility_score: Joi.number().min(0).max(100),
  brand_mention_count: Joi.number().integer().min(0).default(0),
  competitor_mention_count: Joi.number().integer().min(0).default(0),
  brand_sentiment_avg: Joi.number().min(-1).max(1),
  competitor_sentiment_avg: Joi.number().min(-1).max(1),
  market_share_percentage: Joi.number().min(0).max(100),
  competitive_gap: Joi.number().min(-100).max(100),
  analysis_metadata: Joi.object()
});

// Query parameter validation schemas
export const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

export const dateRangeSchema = Joi.object({
  start_date: Joi.date(),
  end_date: Joi.date().min(Joi.ref('start_date'))
});

export const brandMetricsFilterSchema = paginationSchema.keys({
  brand_id: uuidSchema.required(),
  ai_model_id: uuidSchema,
  geographic_region: Joi.string().max(10),
  query_category: Joi.string().max(100),
  start_date: Joi.date(),
  end_date: Joi.date().min(Joi.ref('start_date'))
});

// Conversation validation schemas
export const createConversationSchema = Joi.object({
  brand_id: uuidSchema.required(),
  conversation_thread_id: Joi.string().max(255),
  ai_model_id: uuidSchema.required(),
  conversation_type: Joi.string().valid('query_response', 'follow_up', 'multi_turn', 'comparison').required(),
  initial_query: Joi.string().min(1).max(2000).required(),
  conversation_context: Joi.object()
});

export const createConversationTurnSchema = Joi.object({
  conversation_id: uuidSchema.required(),
  turn_number: Joi.number().integer().min(1).required(),
  user_input: Joi.string().min(1).max(2000).required(),
  ai_response: Joi.string().min(1).max(50000).required(),
  ai_response_id: uuidSchema,
  turn_type: Joi.string().valid('initial', 'follow_up', 'clarification', 'comparison').required(),
  processing_time_ms: Joi.number().integer().min(0),
  tokens_used: Joi.number().integer().min(0),
  cost: Joi.number().precision(6).min(0)
});

export const createConversationMentionSchema = Joi.object({
  conversation_id: uuidSchema.required(),
  conversation_turn_id: uuidSchema,
  brand_id: uuidSchema.required(),
  mention_text: Joi.string().min(1).max(1000).required(),
  mention_context: Joi.string().min(1).max(2000).required(),
  position_in_conversation: Joi.number().integer().min(0).required(),
  mention_type: Joi.string().valid('direct', 'indirect', 'comparison', 'recommendation').required(),
  sentiment_score: Joi.number().min(-1).max(1),
  sentiment_label: Joi.string().valid('positive', 'negative', 'neutral'),
  relevance_score: Joi.number().min(0).max(1),
  confidence: Joi.number().min(0).max(1)
});

export const conversationFilterSchema = paginationSchema.keys({
  brand_id: uuidSchema,
  ai_model_id: uuidSchema,
  conversation_type: Joi.string().valid('query_response', 'follow_up', 'multi_turn', 'comparison'),
  is_active: Joi.boolean(),
  has_mentions: Joi.boolean(),
  start_date: Joi.date(),
  end_date: Joi.date().min(Joi.ref('start_date'))
});

export const detectMentionsSchema = Joi.object({
  brand_id: uuidSchema.required(),
  response_text: Joi.string().min(1).max(50000).required(),
  context: Joi.string().max(2000)
});

export const startConversationSchema = Joi.object({
  brandId: uuidSchema.required(),
  aiModelId: uuidSchema.required(),
  initialQuery: Joi.string().min(1).max(2000).required(),
  aiResponse: Joi.string().min(1).max(50000).required(),
  conversationThreadId: Joi.string().max(255),
  context: Joi.object()
});

export const continueConversationSchema = Joi.object({
  userInput: Joi.string().min(1).max(2000).required(),
  aiResponse: Joi.string().min(1).max(50000).required(),
  turnType: Joi.string().valid('follow_up', 'clarification', 'comparison').default('follow_up')
});

// Validation helper function
export const validateSchema = <T>(schema: Joi.ObjectSchema, data: any): T => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join(', ');
    throw new Error(`Validation error: ${errorMessage}`);
  }

  return value as T;
};