-- Initial database schema for LLM Brand Monitoring Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table for authentication and user management
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'brand_manager', 'analyst')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Brands table for brand information and configuration
CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    industry VARCHAR(100),
    description TEXT,
    logo_url VARCHAR(500),
    website_url VARCHAR(500),
    monitoring_keywords TEXT[], -- Array of keywords to monitor
    competitor_brands TEXT[], -- Array of competitor brand names
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User-Brand associations (many-to-many relationship)
CREATE TABLE user_brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, brand_id)
);

-- AI Models table to track different AI platforms
CREATE TABLE ai_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    provider VARCHAR(100) NOT NULL, -- 'openai', 'anthropic', etc.
    model_version VARCHAR(50),
    api_endpoint VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    rate_limit_per_minute INTEGER DEFAULT 60,
    cost_per_request DECIMAL(10, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Responses table to store all AI model responses
CREATE TABLE ai_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    ai_model_id UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    response_metadata JSONB, -- Store additional response data
    confidence_score DECIMAL(3, 2), -- 0.00 to 1.00
    processing_time_ms INTEGER,
    tokens_used INTEGER,
    cost DECIMAL(10, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Citations table to track sources referenced in AI responses
CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ai_response_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    url VARCHAR(1000) NOT NULL,
    domain VARCHAR(255),
    title VARCHAR(500),
    content_snippet TEXT,
    authority_score DECIMAL(3, 2), -- 0.00 to 1.00
    relevance_score DECIMAL(3, 2), -- 0.00 to 1.00
    content_type VARCHAR(100), -- 'article', 'blog', 'news', 'social', etc.
    publish_date TIMESTAMP WITH TIME ZONE,
    last_crawled TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Brand Mentions table to track specific brand mentions in responses
CREATE TABLE brand_mentions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ai_response_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    mention_text TEXT NOT NULL,
    context TEXT, -- Surrounding context of the mention
    position_in_response INTEGER, -- Position where brand was mentioned
    sentiment_score DECIMAL(3, 2), -- -1.00 to 1.00 (negative to positive)
    sentiment_label VARCHAR(20) CHECK (sentiment_label IN ('positive', 'negative', 'neutral')),
    confidence DECIMAL(3, 2), -- 0.00 to 1.00
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Visibility Metrics table for time-series brand performance data
CREATE TABLE visibility_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    ai_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL,
    metric_date DATE NOT NULL,
    metric_hour INTEGER CHECK (metric_hour >= 0 AND metric_hour <= 23),
    overall_score DECIMAL(5, 2), -- 0.00 to 100.00
    ranking_position INTEGER,
    mention_frequency INTEGER DEFAULT 0,
    average_sentiment DECIMAL(3, 2), -- -1.00 to 1.00
    citation_count INTEGER DEFAULT 0,
    source_quality_score DECIMAL(3, 2), -- 0.00 to 1.00
    geographic_region VARCHAR(10), -- ISO country codes or regions
    query_category VARCHAR(100), -- Category of queries that generated this metric
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(brand_id, ai_model_id, metric_date, metric_hour, geographic_region, query_category)
);

-- Alert Thresholds table for configuring monitoring alerts
CREATE TABLE alert_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- 'visibility_score', 'sentiment', 'mention_frequency', etc.
    threshold_value DECIMAL(10, 2) NOT NULL,
    comparison_operator VARCHAR(10) NOT NULL CHECK (comparison_operator IN ('>', '<', '>=', '<=', '=')),
    is_active BOOLEAN DEFAULT true,
    notification_channels TEXT[], -- ['email', 'sms', 'webhook', 'in_app']
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alerts table to store generated alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    alert_threshold_id UUID REFERENCES alert_thresholds(id) ON DELETE SET NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    current_value DECIMAL(10, 2),
    threshold_value DECIMAL(10, 2),
    is_acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitive Analysis table for storing competitor comparison data
CREATE TABLE competitive_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    competitor_brand_name VARCHAR(255) NOT NULL,
    analysis_date DATE NOT NULL,
    brand_visibility_score DECIMAL(5, 2),
    competitor_visibility_score DECIMAL(5, 2),
    brand_mention_count INTEGER DEFAULT 0,
    competitor_mention_count INTEGER DEFAULT 0,
    brand_sentiment_avg DECIMAL(3, 2),
    competitor_sentiment_avg DECIMAL(3, 2),
    market_share_percentage DECIMAL(5, 2),
    competitive_gap DECIMAL(5, 2), -- Positive means brand is ahead
    analysis_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(brand_id, competitor_brand_name, analysis_date)
);

-- User Sessions table for JWT token management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance optimization
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_brands_name ON brands(name);
CREATE INDEX idx_brands_domain ON brands(domain);
CREATE INDEX idx_user_brands_user_id ON user_brands(user_id);
CREATE INDEX idx_user_brands_brand_id ON user_brands(brand_id);
CREATE INDEX idx_ai_responses_brand_id ON ai_responses(brand_id);
CREATE INDEX idx_ai_responses_created_at ON ai_responses(created_at);
CREATE INDEX idx_citations_ai_response_id ON citations(ai_response_id);
CREATE INDEX idx_citations_domain ON citations(domain);
CREATE INDEX idx_brand_mentions_brand_id ON brand_mentions(brand_id);
CREATE INDEX idx_brand_mentions_sentiment ON brand_mentions(sentiment_label);
CREATE INDEX idx_visibility_metrics_brand_id ON visibility_metrics(brand_id);
CREATE INDEX idx_visibility_metrics_date ON visibility_metrics(metric_date);
CREATE INDEX idx_visibility_metrics_composite ON visibility_metrics(brand_id, metric_date, ai_model_id);
CREATE INDEX idx_alerts_brand_id ON alerts(brand_id);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_competitive_analysis_brand_id ON competitive_analysis(brand_id);
CREATE INDEX idx_competitive_analysis_date ON competitive_analysis(analysis_date);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_models_updated_at BEFORE UPDATE ON ai_models FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_alert_thresholds_updated_at BEFORE UPDATE ON alert_thresholds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();