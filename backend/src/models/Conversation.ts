import { query } from '../config/database';
import { 
  Conversation, 
  ConversationTurn, 
  ConversationMention, 
  ConversationTopic,
  ConversationRelationship,
  CreateConversationInput,
  CreateConversationTurnInput,
  CreateConversationMentionInput,
  ConversationFilter,
  PaginationOptions
} from '../types/database';

export class ConversationModel {
  /**
   * Create a new conversation
   */
  static async create(conversationData: CreateConversationInput): Promise<Conversation> {
    const result = await query(`
      INSERT INTO conversations (
        brand_id, conversation_thread_id, ai_model_id, conversation_type,
        initial_query, conversation_context
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      conversationData.brand_id,
      conversationData.conversation_thread_id || null,
      conversationData.ai_model_id,
      conversationData.conversation_type,
      conversationData.initial_query,
      conversationData.conversation_context || null
    ]);
    
    return result.rows[0] as Conversation;
  }

  /**
   * Find conversation by ID
   */
  static async findById(id: string): Promise<Conversation | null> {
    const result = await query(
      'SELECT * FROM conversations WHERE id = $1',
      [id]
    );
    
    return result.rows.length > 0 ? result.rows[0] as Conversation : null;
  }

  /**
   * Update conversation activity and turn count
   */
  static async updateActivity(conversationId: string, totalTurns: number): Promise<Conversation> {
    const result = await query(`
      UPDATE conversations 
      SET total_turns = $2, last_activity_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [conversationId, totalTurns]);
    
    if (result.rows.length === 0) {
      throw new Error('Conversation not found');
    }
    
    return result.rows[0] as Conversation;
  }

  /**
   * Mark conversation as inactive
   */
  static async markInactive(conversationId: string): Promise<Conversation> {
    const result = await query(`
      UPDATE conversations 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [conversationId]);
    
    if (result.rows.length === 0) {
      throw new Error('Conversation not found');
    }
    
    return result.rows[0] as Conversation;
  }

  /**
   * Get conversations with filtering and pagination
   */
  static async getConversations(
    filter: ConversationFilter
  ): Promise<{
    conversations: Conversation[];
    total: number;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.brand_id) {
      conditions.push(`brand_id = $${paramIndex++}`);
      params.push(filter.brand_id);
    }

    if (filter.ai_model_id) {
      conditions.push(`ai_model_id = $${paramIndex++}`);
      params.push(filter.ai_model_id);
    }

    if (filter.conversation_type) {
      conditions.push(`conversation_type = $${paramIndex++}`);
      params.push(filter.conversation_type);
    }

    if (filter.is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(filter.is_active);
    }

    if (filter.start_date) {
      conditions.push(`started_at >= $${paramIndex++}`);
      params.push(filter.start_date);
    }

    if (filter.end_date) {
      conditions.push(`started_at <= $${paramIndex++}`);
      params.push(filter.end_date);
    }

    if (filter.has_mentions) {
      conditions.push(`EXISTS (SELECT 1 FROM conversation_mentions WHERE conversation_id = conversations.id)`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    const [conversationsResult, countResult] = await Promise.all([
      query(`
        SELECT c.*, am.name as ai_model_name, am.provider, b.name as brand_name
        FROM conversations c
        JOIN ai_models am ON c.ai_model_id = am.id
        JOIN brands b ON c.brand_id = b.id
        ${whereClause}
        ORDER BY c.last_activity_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `, [...params, limit, offset]),
      query(`
        SELECT COUNT(*) FROM conversations c ${whereClause}
      `, params)
    ]);

    return {
      conversations: conversationsResult.rows as Conversation[],
      total: parseInt(countResult.rows[0].count)
    };
  }

  /**
   * Add a turn to a conversation
   */
  static async addTurn(turnData: CreateConversationTurnInput): Promise<ConversationTurn> {
    const result = await query(`
      INSERT INTO conversation_turns (
        conversation_id, turn_number, user_input, ai_response,
        ai_response_id, turn_type, processing_time_ms, tokens_used, cost
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      turnData.conversation_id,
      turnData.turn_number,
      turnData.user_input,
      turnData.ai_response,
      turnData.ai_response_id || null,
      turnData.turn_type,
      turnData.processing_time_ms || null,
      turnData.tokens_used || null,
      turnData.cost || null
    ]);

    // Update conversation activity
    await this.updateActivity(turnData.conversation_id, turnData.turn_number);
    
    return result.rows[0] as ConversationTurn;
  }

  /**
   * Get turns for a conversation
   */
  static async getTurns(conversationId: string): Promise<ConversationTurn[]> {
    const result = await query(`
      SELECT * FROM conversation_turns 
      WHERE conversation_id = $1
      ORDER BY turn_number ASC
    `, [conversationId]);
    
    return result.rows as ConversationTurn[];
  }

  /**
   * Add a mention to a conversation
   */
  static async addMention(mentionData: CreateConversationMentionInput): Promise<ConversationMention> {
    const result = await query(`
      INSERT INTO conversation_mentions (
        conversation_id, conversation_turn_id, brand_id, mention_text,
        mention_context, position_in_conversation, mention_type,
        sentiment_score, sentiment_label, relevance_score, confidence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      mentionData.conversation_id,
      mentionData.conversation_turn_id || null,
      mentionData.brand_id,
      mentionData.mention_text,
      mentionData.mention_context,
      mentionData.position_in_conversation,
      mentionData.mention_type,
      mentionData.sentiment_score || null,
      mentionData.sentiment_label || null,
      mentionData.relevance_score || null,
      mentionData.confidence || null
    ]);
    
    return result.rows[0] as ConversationMention;
  }

  /**
   * Get mentions for a conversation
   */
  static async getMentions(conversationId: string): Promise<ConversationMention[]> {
    const result = await query(`
      SELECT cm.*, b.name as brand_name
      FROM conversation_mentions cm
      JOIN brands b ON cm.brand_id = b.id
      WHERE cm.conversation_id = $1
      ORDER BY cm.position_in_conversation ASC
    `, [conversationId]);
    
    return result.rows as ConversationMention[];
  }

  /**
   * Add a topic to a conversation
   */
  static async addTopic(
    conversationId: string,
    topicName: string,
    topicCategory: string,
    relevanceScore: number,
    firstMentionedTurn: number,
    lastMentionedTurn: number,
    mentionCount: number = 1
  ): Promise<ConversationTopic> {
    const result = await query(`
      INSERT INTO conversation_topics (
        conversation_id, topic_name, topic_category, relevance_score,
        first_mentioned_turn, last_mentioned_turn, mention_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (conversation_id, topic_name)
      DO UPDATE SET
        last_mentioned_turn = EXCLUDED.last_mentioned_turn,
        mention_count = conversation_topics.mention_count + 1,
        relevance_score = GREATEST(conversation_topics.relevance_score, EXCLUDED.relevance_score)
      RETURNING *
    `, [conversationId, topicName, topicCategory, relevanceScore, firstMentionedTurn, lastMentionedTurn, mentionCount]);
    
    return result.rows[0] as ConversationTopic;
  }

  /**
   * Get topics for a conversation
   */
  static async getTopics(conversationId: string): Promise<ConversationTopic[]> {
    const result = await query(`
      SELECT * FROM conversation_topics 
      WHERE conversation_id = $1
      ORDER BY relevance_score DESC, mention_count DESC
    `, [conversationId]);
    
    return result.rows as ConversationTopic[];
  }

  /**
   * Create a relationship between conversations
   */
  static async createRelationship(
    parentConversationId: string,
    childConversationId: string,
    relationshipType: string,
    relationshipStrength: number
  ): Promise<ConversationRelationship> {
    const result = await query(`
      INSERT INTO conversation_relationships (
        parent_conversation_id, child_conversation_id, relationship_type, relationship_strength
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [parentConversationId, childConversationId, relationshipType, relationshipStrength]);
    
    return result.rows[0] as ConversationRelationship;
  }

  /**
   * Get related conversations
   */
  static async getRelatedConversations(conversationId: string): Promise<{
    parents: ConversationRelationship[];
    children: ConversationRelationship[];
  }> {
    const [parentsResult, childrenResult] = await Promise.all([
      query(`
        SELECT cr.*, c.initial_query as parent_query, c.conversation_type as parent_type
        FROM conversation_relationships cr
        JOIN conversations c ON cr.parent_conversation_id = c.id
        WHERE cr.child_conversation_id = $1
        ORDER BY cr.relationship_strength DESC
      `, [conversationId]),
      query(`
        SELECT cr.*, c.initial_query as child_query, c.conversation_type as child_type
        FROM conversation_relationships cr
        JOIN conversations c ON cr.child_conversation_id = c.id
        WHERE cr.parent_conversation_id = $1
        ORDER BY cr.relationship_strength DESC
      `, [conversationId])
    ]);

    return {
      parents: parentsResult.rows as ConversationRelationship[],
      children: childrenResult.rows as ConversationRelationship[]
    };
  }

  /**
   * Get conversation with all related data
   */
  static async getWithDetails(conversationId: string): Promise<{
    conversation: Conversation;
    turns: ConversationTurn[];
    mentions: ConversationMention[];
    topics: ConversationTopic[];
    relationships: {
      parents: ConversationRelationship[];
      children: ConversationRelationship[];
    };
  } | null> {
    const conversation = await this.findById(conversationId);
    
    if (!conversation) {
      return null;
    }

    const [turns, mentions, topics, relationships] = await Promise.all([
      this.getTurns(conversationId),
      this.getMentions(conversationId),
      this.getTopics(conversationId),
      this.getRelatedConversations(conversationId)
    ]);

    return {
      conversation,
      turns,
      mentions,
      topics,
      relationships
    };
  }

  /**
   * Get conversation statistics for a brand
   */
  static async getStatistics(brandId: string, days: number = 30): Promise<{
    total_conversations: number;
    active_conversations: number;
    avg_turns_per_conversation: number;
    total_mentions: number;
    avg_sentiment: number;
    conversations_by_type: Array<{ type: string; count: number }>;
    top_topics: Array<{ topic: string; category: string; count: number }>;
  }> {
    const result = await query(`
      SELECT 
        COUNT(*) as total_conversations,
        COUNT(*) FILTER (WHERE is_active = true) as active_conversations,
        AVG(total_turns) as avg_turns_per_conversation
      FROM conversations 
      WHERE brand_id = $1 
        AND started_at >= CURRENT_DATE - INTERVAL '${days} days'
    `, [brandId]);

    const mentionsResult = await query(`
      SELECT 
        COUNT(*) as total_mentions,
        AVG(sentiment_score) as avg_sentiment
      FROM conversation_mentions cm
      JOIN conversations c ON cm.conversation_id = c.id
      WHERE c.brand_id = $1 
        AND c.started_at >= CURRENT_DATE - INTERVAL '${days} days'
    `, [brandId]);

    const typeStats = await query(`
      SELECT 
        conversation_type as type,
        COUNT(*) as count
      FROM conversations
      WHERE brand_id = $1 
        AND started_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY conversation_type
      ORDER BY count DESC
    `, [brandId]);

    const topicStats = await query(`
      SELECT 
        ct.topic_name as topic,
        ct.topic_category as category,
        SUM(ct.mention_count) as count
      FROM conversation_topics ct
      JOIN conversations c ON ct.conversation_id = c.id
      WHERE c.brand_id = $1 
        AND c.started_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY ct.topic_name, ct.topic_category
      ORDER BY count DESC
      LIMIT 10
    `, [brandId]);

    return {
      total_conversations: parseInt(result.rows[0].total_conversations) || 0,
      active_conversations: parseInt(result.rows[0].active_conversations) || 0,
      avg_turns_per_conversation: parseFloat(result.rows[0].avg_turns_per_conversation) || 0,
      total_mentions: parseInt(mentionsResult.rows[0]?.total_mentions) || 0,
      avg_sentiment: parseFloat(mentionsResult.rows[0]?.avg_sentiment) || 0,
      conversations_by_type: typeStats.rows.map((row: any) => ({
        type: row.type,
        count: parseInt(row.count)
      })),
      top_topics: topicStats.rows.map((row: any) => ({
        topic: row.topic,
        category: row.category,
        count: parseInt(row.count)
      }))
    };
  }

  /**
   * Search conversations by content
   */
  static async searchConversations(
    brandId: string,
    searchTerm: string,
    limit: number = 20
  ): Promise<Conversation[]> {
    const result = await query(`
      SELECT DISTINCT c.*, am.name as ai_model_name, b.name as brand_name
      FROM conversations c
      JOIN ai_models am ON c.ai_model_id = am.id
      JOIN brands b ON c.brand_id = b.id
      LEFT JOIN conversation_turns ct ON c.id = ct.conversation_id
      WHERE c.brand_id = $1 
        AND (
          c.initial_query ILIKE $2 OR 
          ct.user_input ILIKE $2 OR 
          ct.ai_response ILIKE $2
        )
      ORDER BY c.last_activity_at DESC
      LIMIT $3
    `, [brandId, `%${searchTerm}%`, limit]);
    
    return result.rows as Conversation[];
  }
}