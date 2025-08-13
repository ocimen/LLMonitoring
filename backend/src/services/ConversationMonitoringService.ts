import { ConversationModel } from '../models/Conversation';
import { BrandModel } from '../models/Brand';
import { AIResponseModel } from '../models/AIResponse';
import { 
  Conversation, 
  ConversationTurn, 
  ConversationMention,
  CreateConversationInput,
  CreateConversationTurnInput,
  CreateConversationMentionInput,
  ConversationFilter
} from '../types/database';

interface MentionDetectionResult {
  mentions: Array<{
    brandId: string;
    brandName: string;
    mentionText: string;
    context: string;
    position: number;
    mentionType: 'direct' | 'indirect' | 'comparison' | 'recommendation';
    sentiment?: number;
    sentimentLabel?: 'positive' | 'negative' | 'neutral';
    relevance?: number;
    confidence?: number;
  }>;
}

interface TopicAnalysisResult {
  topics: Array<{
    name: string;
    category: string;
    relevance: number;
    firstMention: number;
    lastMention: number;
    count: number;
  }>;
}

interface ConversationAnalysisResult {
  conversationType: 'query_response' | 'follow_up' | 'multi_turn' | 'comparison';
  relatedConversations: Array<{
    conversationId: string;
    relationshipType: 'follow_up' | 'related_topic' | 'comparison' | 'clarification';
    strength: number;
  }>;
}

export class ConversationMonitoringService {
  /**
   * Start tracking a new conversation
   */
  static async startConversation(
    brandId: string,
    aiModelId: string,
    initialQuery: string,
    aiResponse: string,
    conversationThreadId?: string,
    context?: Record<string, any>
  ): Promise<{
    conversation: Conversation;
    turn: ConversationTurn;
    mentions: ConversationMention[];
  }> {
    // Analyze conversation type
    const conversationType = this.analyzeConversationType(initialQuery, context);
    
    // Create conversation
    const conversationData: CreateConversationInput = {
      brand_id: brandId,
      ai_model_id: aiModelId,
      conversation_type: conversationType,
      initial_query: initialQuery,
      ...(conversationThreadId && { conversation_thread_id: conversationThreadId }),
      ...(context && { conversation_context: context })
    };
    
    const conversation = await ConversationModel.create(conversationData);
    
    // Add initial turn
    const turnData: CreateConversationTurnInput = {
      conversation_id: conversation.id,
      turn_number: 1,
      user_input: initialQuery,
      ai_response: aiResponse,
      turn_type: 'initial'
    };
    
    const turn = await ConversationModel.addTurn(turnData);
    
    // Detect and add mentions
    const mentions = await this.detectAndAddMentions(
      conversation.id,
      turn.id,
      brandId,
      aiResponse,
      1
    );
    
    // Analyze and add topics
    await this.analyzeAndAddTopics(conversation.id, initialQuery, aiResponse, 1);
    
    // Find and create relationships with existing conversations
    await this.findAndCreateRelationships(conversation.id, brandId, initialQuery);
    
    return {
      conversation,
      turn,
      mentions
    };
  }

  /**
   * Continue an existing conversation with a new turn
   */
  static async continueConversation(
    conversationId: string,
    userInput: string,
    aiResponse: string,
    turnType: 'follow_up' | 'clarification' | 'comparison' = 'follow_up'
  ): Promise<{
    turn: ConversationTurn;
    mentions: ConversationMention[];
  }> {
    const conversation = await ConversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    const nextTurnNumber = conversation.total_turns + 1;
    
    // Add new turn
    const turnData: CreateConversationTurnInput = {
      conversation_id: conversationId,
      turn_number: nextTurnNumber,
      user_input: userInput,
      ai_response: aiResponse,
      turn_type: turnType
    };
    
    const turn = await ConversationModel.addTurn(turnData);
    
    // Detect and add mentions
    const mentions = await this.detectAndAddMentions(
      conversationId,
      turn.id,
      conversation.brand_id,
      aiResponse,
      nextTurnNumber
    );
    
    // Analyze and add topics
    await this.analyzeAndAddTopics(conversationId, userInput, aiResponse, nextTurnNumber);
    
    return {
      turn,
      mentions
    };
  }

  /**
   * Detect brand mentions in AI response text
   */
  static async detectMentions(
    brandId: string,
    responseText: string,
    context?: string
  ): Promise<MentionDetectionResult> {
    const brand = await BrandModel.findById(brandId);
    if (!brand) {
      throw new Error('Brand not found');
    }
    
    const mentions: MentionDetectionResult['mentions'] = [];
    const searchTerms = [brand.name, ...brand.monitoring_keywords];
    
    // Simple mention detection - can be enhanced with NLP
    // Safer, linear mention detection (avoids compiling user-derived regex)
    const textLower = responseText.toLowerCase();
    for (const term of searchTerms) {
      if (!term || !term.trim()) continue;
      const termLower = term.toLowerCase();
      let fromIndex = 0;
      let matchCount = 0;
      const MAX_MATCHES_PER_TERM = 100;
      while (true) {
        const idx = textLower.indexOf(termLower, fromIndex);
        if (idx === -1 || ++matchCount > MAX_MATCHES_PER_TERM) break;
        // Verify word boundaries without executing user-supplied regex
        const before = idx === 0 ? ' ' : textLower[idx - 1];
        const after = textLower[idx + termLower.length] || ' ';
        const isWordChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);
        if (isWordChar(before) || isWordChar(after)) {
          fromIndex = idx + 1;
          continue; // not a whole-word match
        }
        const mentionStart = Math.max(0, idx - 50);
        const mentionEnd = Math.min(responseText.length, idx + termLower.length + 50);
        const mentionContext = responseText.substring(mentionStart, mentionEnd);
        const mentionType = this.classifyMentionType(responseText, idx, responseText.substr(idx, term.length));
        const sentiment = this.analyzeSentiment(mentionContext);
        mentions.push({
          brandId: brand.id,
          brandName: brand.name,
          mentionText: responseText.substr(idx, term.length),
          context: mentionContext,
          position: idx,
          mentionType,
          sentiment: sentiment.score,
          sentimentLabel: sentiment.label,
          relevance: this.calculateRelevance(mentionContext, term),
          confidence: 0.8
        });
        fromIndex = idx + termLower.length;
      }
    }
    
    return { mentions };
  }

  /**
   * Detect and add mentions to conversation
   */
  private static async detectAndAddMentions(
    conversationId: string,
    turnId: string,
    brandId: string,
    responseText: string,
    turnNumber: number
  ): Promise<ConversationMention[]> {
    const detectionResult = await this.detectMentions(brandId, responseText);
    const mentions: ConversationMention[] = [];
    
    for (const mention of detectionResult.mentions) {
      const mentionData: CreateConversationMentionInput = {
        conversation_id: conversationId,
        brand_id: mention.brandId,
        mention_text: mention.mentionText,
        mention_context: mention.context,
        position_in_conversation: mention.position,
        mention_type: mention.mentionType,
        ...(turnId && { conversation_turn_id: turnId }),
        ...(mention.sentiment !== undefined && { sentiment_score: mention.sentiment }),
        ...(mention.sentimentLabel && { sentiment_label: mention.sentimentLabel }),
        ...(mention.relevance !== undefined && { relevance_score: mention.relevance }),
        ...(mention.confidence !== undefined && { confidence: mention.confidence })
      };
      
      const conversationMention = await ConversationModel.addMention(mentionData);
      mentions.push(conversationMention);
    }
    
    return mentions;
  }

  /**
   * Analyze and add topics to conversation
   */
  private static async analyzeAndAddTopics(
    conversationId: string,
    userInput: string,
    aiResponse: string,
    turnNumber: number
  ): Promise<void> {
    const topics = this.extractTopics(userInput + ' ' + aiResponse);
    
    for (const topic of topics) {
      await ConversationModel.addTopic(
        conversationId,
        topic.name,
        topic.category,
        topic.relevance,
        turnNumber,
        turnNumber,
        1
      );
    }
  }

  /**
   * Find and create relationships with existing conversations
   */
  private static async findAndCreateRelationships(
    conversationId: string,
    brandId: string,
    query: string
  ): Promise<void> {
    // Find similar conversations
    const similarConversations = await ConversationModel.searchConversations(
      brandId,
      query,
      5
    );
    
    for (const similar of similarConversations) {
      if (similar.id === conversationId) continue;
      
      const similarity = this.calculateSimilarity(query, similar.initial_query);
      if (similarity > 0.7) {
        await ConversationModel.createRelationship(
          similar.id,
          conversationId,
          'related_topic',
          similarity
        );
      }
    }
  }

  /**
   * Get conversation monitoring dashboard data
   */
  static async getDashboardData(
    brandId: string,
    days: number = 30
  ): Promise<{
    statistics: any;
    recentConversations: Conversation[];
    topMentions: ConversationMention[];
    trendingTopics: Array<{ topic: string; category: string; count: number }>;
  }> {
    const [statistics, conversations, mentions, topics] = await Promise.all([
      ConversationModel.getStatistics(brandId, days),
      ConversationModel.getConversations({
        brand_id: brandId,
        limit: 10,
        offset: 0
      }),
      this.getTopMentions(brandId, days),
      this.getTrendingTopics(brandId, days)
    ]);
    
    return {
      statistics,
      recentConversations: conversations.conversations,
      topMentions: mentions,
      trendingTopics: topics
    };
  }

  /**
   * Get conversations with filtering
   */
  static async getConversations(filter: ConversationFilter): Promise<{
    conversations: Conversation[];
    total: number;
  }> {
    return await ConversationModel.getConversations(filter);
  }

  /**
   * Get conversation details with all related data
   */
  static async getConversationDetails(conversationId: string): Promise<any> {
    return await ConversationModel.getWithDetails(conversationId);
  }

  // Helper methods for analysis

  private static analyzeConversationType(
    query: string,
    context?: Record<string, any>
  ): 'query_response' | 'follow_up' | 'multi_turn' | 'comparison' {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('compare') || lowerQuery.includes('vs') || lowerQuery.includes('versus')) {
      return 'comparison';
    }
    
    if (context?.previousConversationId) {
      return 'follow_up';
    }
    
    if (context?.isMultiTurn) {
      return 'multi_turn';
    }
    
    return 'query_response';
  }

  private static classifyMentionType(
    text: string,
    position: number,
    mention: string
  ): 'direct' | 'indirect' | 'comparison' | 'recommendation' {
    const contextBefore = text.substring(Math.max(0, position - 100), position).toLowerCase();
    const contextAfter = text.substring(position + mention.length, Math.min(text.length, position + mention.length + 100)).toLowerCase();
    const context = contextBefore + ' ' + contextAfter;
    
    if (context.includes('recommend') || context.includes('suggest') || context.includes('should consider')) {
      return 'recommendation';
    }
    
    if (context.includes('compare') || context.includes('versus') || context.includes('vs') || context.includes('better than')) {
      return 'comparison';
    }
    
    if (context.includes('similar to') || context.includes('like') || context.includes('such as')) {
      return 'indirect';
    }
    
    return 'direct';
  }

  private static analyzeSentiment(text: string): { score: number; label: 'positive' | 'negative' | 'neutral' } {
    // Simple sentiment analysis - would use ML model in production
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'best', 'love', 'perfect'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'worst', 'hate', 'disappointing', 'poor'];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    for (const word of positiveWords) {
      if (lowerText.includes(word)) score += 0.1;
    }
    
    for (const word of negativeWords) {
      if (lowerText.includes(word)) score -= 0.1;
    }
    
    score = Math.max(-1, Math.min(1, score));
    
    let label: 'positive' | 'negative' | 'neutral';
    if (score > 0.1) label = 'positive';
    else if (score < -0.1) label = 'negative';
    else label = 'neutral';
    
    return { score, label };
  }

  private static calculateRelevance(context: string, term: string): number {
    // Simple relevance calculation - would use ML model in production
    const contextWords = context.toLowerCase().split(/\s+/);
    const termWords = term.toLowerCase().split(/\s+/);
    
    let relevance = 0.5; // Base relevance
    
    // Increase relevance if term appears multiple times
    for (const termWord of termWords) {
      const occurrences = contextWords.filter(word => word.includes(termWord)).length;
      relevance += occurrences * 0.1;
    }
    
    return Math.min(1, relevance);
  }

  private static extractTopics(text: string): Array<{ name: string; category: string; relevance: number }> {
    // Simple topic extraction - would use NLP in production
    const topics: Array<{ name: string; category: string; relevance: number }> = [];
    const lowerText = text.toLowerCase();
    
    // Technology topics
    if (lowerText.includes('ai') || lowerText.includes('artificial intelligence')) {
      topics.push({ name: 'Artificial Intelligence', category: 'Technology', relevance: 0.9 });
    }
    
    if (lowerText.includes('software') || lowerText.includes('app')) {
      topics.push({ name: 'Software', category: 'Technology', relevance: 0.8 });
    }
    
    // Business topics
    if (lowerText.includes('marketing') || lowerText.includes('advertising')) {
      topics.push({ name: 'Marketing', category: 'Business', relevance: 0.8 });
    }
    
    if (lowerText.includes('sales') || lowerText.includes('revenue')) {
      topics.push({ name: 'Sales', category: 'Business', relevance: 0.8 });
    }
    
    return topics;
  }

  private static calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation - would use embeddings in production
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private static escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static async getTopMentions(brandId: string, days: number): Promise<ConversationMention[]> {
    // Implementation would query top mentions by relevance/sentiment
    return [];
  }

  private static async getTrendingTopics(brandId: string, days: number): Promise<Array<{ topic: string; category: string; count: number }>> {
    // Implementation would query trending topics
    return [];
  }
}