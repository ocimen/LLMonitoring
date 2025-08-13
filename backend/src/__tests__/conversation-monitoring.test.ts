import { ConversationMonitoringService } from '../services/ConversationMonitoringService';
import { ConversationModel } from '../models/Conversation';
import { BrandModel } from '../models/Brand';
import { 
  Conversation, 
  ConversationTurn, 
  ConversationMention,
  CreateConversationInput,
  Brand
} from '../types/database';

// Mock the database models
jest.mock('../models/Conversation');
jest.mock('../models/Brand');
jest.mock('../config/database');

const mockConversationModel = ConversationModel as jest.Mocked<typeof ConversationModel>;
const mockBrandModel = BrandModel as jest.Mocked<typeof BrandModel>;

// Mock the static methods
beforeAll(() => {
  // Mock brand data for detectMentions
  mockBrandModel.findById.mockImplementation(async (id: string) => {
    if (id === 'brand-123') {
      return {
        id: 'brand-123',
        name: 'Test Brand',
        monitoring_keywords: ['test', 'brand', 'product'],
        domain: 'testbrand.com'
      } as Brand;
    }
    return null;
  });
});

describe('ConversationMonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('startConversation', () => {
    const mockBrand: Partial<Brand> = {
      id: 'brand-123',
      name: 'Test Brand',
      monitoring_keywords: ['test', 'brand', 'product'],
      domain: 'testbrand.com'
    };

    const mockConversation: Conversation = {
      id: 'conv-123',
      brand_id: 'brand-123',
      ai_model_id: 'model-123',
      conversation_type: 'query_response',
      initial_query: 'Tell me about Test Brand',
      total_turns: 1,
      is_active: true,
      started_at: new Date(),
      last_activity_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    };

    const mockTurn: ConversationTurn = {
      id: 'turn-123',
      conversation_id: 'conv-123',
      turn_number: 1,
      user_input: 'Tell me about Test Brand',
      ai_response: 'Test Brand is a leading company in the technology sector.',
      turn_type: 'initial',
      created_at: new Date()
    };

    const mockMention: ConversationMention = {
      id: 'mention-123',
      conversation_id: 'conv-123',
      brand_id: 'brand-123',
      mention_text: 'Test Brand',
      mention_context: 'Test Brand is a leading company',
      position_in_conversation: 0,
      mention_type: 'direct',
      sentiment_score: 0.5,
      sentiment_label: 'neutral',
      relevance_score: 0.9,
      confidence: 0.8,
      created_at: new Date()
    };

    beforeEach(() => {
      mockBrandModel.findById.mockResolvedValue(mockBrand as Brand);
      mockConversationModel.create.mockResolvedValue(mockConversation);
      mockConversationModel.addTurn.mockResolvedValue(mockTurn);
      mockConversationModel.addMention.mockResolvedValue(mockMention);
      mockConversationModel.addTopic.mockResolvedValue({} as any);
      mockConversationModel.searchConversations.mockResolvedValue([]);
    });

    it('should create a new conversation successfully', async () => {
      const result = await ConversationMonitoringService.startConversation(
        'brand-123',
        'model-123',
        'Tell me about Test Brand',
        'Test Brand is a leading company in the technology sector.'
      );

      expect(mockConversationModel.create).toHaveBeenCalledWith({
        brand_id: 'brand-123',
        ai_model_id: 'model-123',
        conversation_type: 'query_response',
        initial_query: 'Tell me about Test Brand',
        conversation_context: undefined
      });

      expect(mockConversationModel.addTurn).toHaveBeenCalledWith({
        conversation_id: 'conv-123',
        turn_number: 1,
        user_input: 'Tell me about Test Brand',
        ai_response: 'Test Brand is a leading company in the technology sector.',
        turn_type: 'initial'
      });

      expect(result.conversation).toEqual(mockConversation);
      expect(result.turn).toEqual(mockTurn);
    });

    it('should detect mentions in AI response', async () => {
      const aiResponse = 'Test Brand is excellent and their product is amazing.';
      
      const result = await ConversationMonitoringService.startConversation(
        'brand-123',
        'model-123',
        'Tell me about Test Brand',
        aiResponse
      );

      // Should detect mentions of "Test Brand" and "product"
      expect(mockConversationModel.addMention).toHaveBeenCalled();
      expect(result.mentions).toBeDefined();
    });

    it('should analyze conversation type correctly', async () => {
      // Test comparison type
      await ConversationMonitoringService.startConversation(
        'brand-123',
        'model-123',
        'Compare Test Brand vs Competitor',
        'Here is a comparison...'
      );

      expect(mockConversationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_type: 'comparison'
        })
      );
    });
  });

  describe('continueConversation', () => {
    const mockConversation: Conversation = {
      id: 'conv-123',
      brand_id: 'brand-123',
      ai_model_id: 'model-123',
      conversation_type: 'query_response',
      initial_query: 'Tell me about Test Brand',
      total_turns: 1,
      is_active: true,
      started_at: new Date(),
      last_activity_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    };

    const mockTurn: ConversationTurn = {
      id: 'turn-456',
      conversation_id: 'conv-123',
      turn_number: 2,
      user_input: 'What about their pricing?',
      ai_response: 'Their pricing is competitive in the market.',
      turn_type: 'follow_up',
      created_at: new Date()
    };

    beforeEach(() => {
      mockConversationModel.findById.mockResolvedValue(mockConversation);
      mockConversationModel.addTurn.mockResolvedValue(mockTurn);
      mockConversationModel.addMention.mockResolvedValue({} as ConversationMention);
      mockConversationModel.addTopic.mockResolvedValue({} as any);
    });

    it('should continue conversation with new turn', async () => {
      const result = await ConversationMonitoringService.continueConversation(
        'conv-123',
        'What about their pricing?',
        'Their pricing is competitive in the market.'
      );

      expect(mockConversationModel.addTurn).toHaveBeenCalledWith({
        conversation_id: 'conv-123',
        turn_number: 2,
        user_input: 'What about their pricing?',
        ai_response: 'Their pricing is competitive in the market.',
        turn_type: 'follow_up'
      });

      expect(result.turn).toEqual(mockTurn);
    });

    it('should throw error for non-existent conversation', async () => {
      mockConversationModel.findById.mockResolvedValue(null);

      await expect(
        ConversationMonitoringService.continueConversation(
          'non-existent',
          'What about pricing?',
          'Response...'
        )
      ).rejects.toThrow('Conversation not found');
    });
  });

  describe('detectMentions', () => {
    it('should detect direct brand mentions', async () => {
      const responseText = 'Test Brand is a great company with excellent products.';
      
      const result = await ConversationMonitoringService.detectMentions(
        'brand-123',
        responseText
      );

      expect(result.mentions).toHaveLength(2); // "Test Brand" and "product"
      expect(result.mentions[0]?.mentionText).toBe('Test Brand');
      expect(result.mentions[0]?.mentionType).toBe('direct');
    });

    it('should detect recommendation mentions', async () => {
      const responseText = 'I recommend Test Brand for your needs.';
      
      const result = await ConversationMonitoringService.detectMentions(
        'brand-123',
        responseText
      );

      expect(result.mentions).toHaveLength(1);
      expect(result.mentions[0]?.mentionType).toBe('recommendation');
    });

    it('should detect comparison mentions', async () => {
      const responseText = 'Test Brand is better than its competitors.';
      
      const result = await ConversationMonitoringService.detectMentions(
        'brand-123',
        responseText
      );

      expect(result.mentions).toHaveLength(1);
      expect(result.mentions[0]?.mentionType).toBe('comparison');
    });

    it('should analyze sentiment correctly', async () => {
      const positiveText = 'Test Brand is excellent and amazing.';
      const negativeText = 'Test Brand is terrible and disappointing.';
      
      const positiveResult = await ConversationMonitoringService.detectMentions(
        'brand-123',
        positiveText
      );
      
      const negativeResult = await ConversationMonitoringService.detectMentions(
        'brand-123',
        negativeText
      );

      expect(positiveResult.mentions[0]?.sentimentLabel).toBe('positive');
      expect(negativeResult.mentions[0]?.sentimentLabel).toBe('negative');
    });
  });

  describe('getConversations', () => {
    const mockConversations = [
      {
        id: 'conv-1',
        brand_id: 'brand-123',
        conversation_type: 'query_response',
        initial_query: 'Query 1'
      },
      {
        id: 'conv-2',
        brand_id: 'brand-123',
        conversation_type: 'follow_up',
        initial_query: 'Query 2'
      }
    ];

    beforeEach(() => {
      mockConversationModel.getConversations.mockResolvedValue({
        conversations: mockConversations as Conversation[],
        total: 2
      });
    });

    it('should get conversations with filtering', async () => {
      const filter = {
        brand_id: 'brand-123',
        conversation_type: 'query_response',
        limit: 10,
        offset: 0
      };

      const result = await ConversationMonitoringService.getConversations(filter);

      expect(mockConversationModel.getConversations).toHaveBeenCalledWith(filter);
      expect(result.conversations).toEqual(mockConversations);
      expect(result.total).toBe(2);
    });
  });

  describe('getDashboardData', () => {
    const mockStatistics = {
      total_conversations: 10,
      active_conversations: 8,
      avg_turns_per_conversation: 2.5,
      total_mentions: 25,
      avg_sentiment: 0.3,
      conversations_by_type: [
        { type: 'query_response', count: 6 },
        { type: 'follow_up', count: 4 }
      ],
      top_topics: [
        { topic: 'pricing', category: 'business', count: 5 },
        { topic: 'features', category: 'product', count: 3 }
      ]
    };

    beforeEach(() => {
      mockConversationModel.getStatistics.mockResolvedValue(mockStatistics);
      mockConversationModel.getConversations.mockResolvedValue({
        conversations: [],
        total: 0
      });
    });

    it('should get dashboard data for brand', async () => {
      const result = await ConversationMonitoringService.getDashboardData('brand-123', 30);

      expect(mockConversationModel.getStatistics).toHaveBeenCalledWith('brand-123', 30);
      expect(result.statistics).toEqual(mockStatistics);
    });
  });
});

describe('ConversationModel', () => {
  // These would be integration tests that test the actual database operations
  // For now, we'll focus on the service layer tests above
  
  describe('Database Operations', () => {
    it('should be tested with integration tests', () => {
      // Integration tests would go here
      expect(true).toBe(true);
    });
  });
});