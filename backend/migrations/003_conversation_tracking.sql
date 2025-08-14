-- Migration: Add conversation tracking tables
-- Description: Creates tables for tracking AI conversations, turns, mentions, topics, and relationships

-- Conversations table - tracks individual conversation sessions
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    conversation_thread_id VARCHAR(255), -- External thread ID if applicable
    ai_model_id UUID NOT NULL REFERENCES ai_models(id),
    conversation_type VARCHAR(50) NOT NULL CHECK (conversation_type IN ('query_response', 'follow_up', 'multi_turn', 'comparison')),
    initial_query TEXT NOT NULL,
    conversation_context JSONB,
    total_turns INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation turns table - tracks individual turns within a conversation
CREATE TABLE conversation_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    user_input TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    ai_response_id UUID REFERENCES ai_responses(id),
    turn_type VARCHAR(50) NOT NULL CHECK (turn_type IN ('initial', 'follow_up', 'clarification', 'comparison')),
    processing_time_ms INTEGER,
    tokens_used INTEGER,
    cost DECIMAL(10, 6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(conversation_id, turn_number)
);

-- Conversation mentions table - tracks brand mentions within conversations
CREATE TABLE conversation_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    conversation_turn_id UUID REFERENCES conversation_turns(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    mention_text TEXT NOT NULL,
    mention_context TEXT NOT NULL,
    position_in_conversation INTEGER NOT NULL,
    mention_type VARCHAR(50) NOT NULL CHECK (mention_type IN ('direct', 'indirect', 'comparison', 'recommendation')),
    sentiment_score DECIMAL(3, 2) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
    sentiment_label VARCHAR(20) CHECK (sentiment_label IN ('positive', 'negative', 'neutral')),
    relevance_score DECIMAL(3, 2) CHECK (relevance_score >= 0 AND relevance_score <= 1),
    confidence DECIMAL(3, 2) CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation topics table - tracks topics discussed in conversations
CREATE TABLE conversation_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    topic_name VARCHAR(255) NOT NULL,
    topic_category VARCHAR(100) NOT NULL,
    relevance_score DECIMAL(3, 2) NOT NULL CHECK (relevance_score >= 0 AND relevance_score <= 1),
    first_mentioned_turn INTEGER NOT NULL,
    last_mentioned_turn INTEGER NOT NULL,
    mention_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(conversation_id, topic_name)
);

-- Conversation relationships table - tracks relationships between conversations
CREATE TABLE conversation_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    child_conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('follow_up', 'related_topic', 'comparison', 'clarification')),
    relationship_strength DECIMAL(3, 2) NOT NULL CHECK (relationship_strength >= 0 AND relationship_strength <= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(parent_conversation_id, child_conversation_id),
    CHECK (parent_conversation_id != child_conversation_id)
);

-- Indexes for performance
CREATE INDEX idx_conversations_brand_id ON conversations(brand_id);
CREATE INDEX idx_conversations_ai_model_id ON conversations(ai_model_id);
CREATE INDEX idx_conversations_type ON conversations(conversation_type);
CREATE INDEX idx_conversations_active ON conversations(is_active);
CREATE INDEX idx_conversations_started_at ON conversations(started_at);
CREATE INDEX idx_conversations_last_activity ON conversations(last_activity_at);

CREATE INDEX idx_conversation_turns_conversation_id ON conversation_turns(conversation_id);
CREATE INDEX idx_conversation_turns_turn_number ON conversation_turns(conversation_id, turn_number);
CREATE INDEX idx_conversation_turns_type ON conversation_turns(turn_type);

CREATE INDEX idx_conversation_mentions_conversation_id ON conversation_mentions(conversation_id);
CREATE INDEX idx_conversation_mentions_brand_id ON conversation_mentions(brand_id);
CREATE INDEX idx_conversation_mentions_turn_id ON conversation_mentions(conversation_turn_id);
CREATE INDEX idx_conversation_mentions_type ON conversation_mentions(mention_type);
CREATE INDEX idx_conversation_mentions_sentiment ON conversation_mentions(sentiment_label);
CREATE INDEX idx_conversation_mentions_position ON conversation_mentions(position_in_conversation);

CREATE INDEX idx_conversation_topics_conversation_id ON conversation_topics(conversation_id);
CREATE INDEX idx_conversation_topics_category ON conversation_topics(topic_category);
CREATE INDEX idx_conversation_topics_relevance ON conversation_topics(relevance_score);

CREATE INDEX idx_conversation_relationships_parent ON conversation_relationships(parent_conversation_id);
CREATE INDEX idx_conversation_relationships_child ON conversation_relationships(child_conversation_id);
CREATE INDEX idx_conversation_relationships_type ON conversation_relationships(relationship_type);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();