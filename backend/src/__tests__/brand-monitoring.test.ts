import { BrandMonitoringService } from '../services/BrandMonitoringService';
import { BrandModel } from '../models/Brand';
import { AIResponseModel } from '../models/AIResponse';
import { AIModelManager } from '../services/ai/AIModelManager';

// Mock dependencies
jest.mock('../models/Brand');
jest.mock('../models/AIResponse');
jest.mock('../services/ai/AIModelManager');
jest.mock('../config/database', () => ({
  query: jest.fn()
}));

const mockQuery = require('../config/database').query;
const mockBrandModel = BrandModel as jest.Mocked<typeof BrandModel>;
const mockAIResponseModel = AIResponseModel as jest.Mocked<typeof AIResponseModel>;
const mockAIModelManager = AIModelManager as jest.MockedClass<typeof AIModelManager>;

describe('BrandMonitoringService', () => {
  let brandMonitoringService: BrandMonitoringService;
  let mockAIModelManagerInstance: jest.Mocked<AIModelManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instance
    mockAIModelManagerInstance = {
      executeBrandMonitoring: jest.fn(),
      generateBrandQuery: jest.fn(),
      getAvailableModels: jest.fn(),
      initializeModels: jest.fn()
    } as any;

    // Mock the constructor
    mockAIModelManager.mockImplementation(() => mockAIModelManagerInstance);
    
    brandMonitoringService = new BrandMonitoringService();
  });

  describe('monitorBrand', () => {
    const mockBrand = {
      id: 'brand-1',
      name: 'TechCorp',
      industry: 'Technology',
      competitor_brands: ['CompetitorA', 'CompetitorB'],
      monitoring_keywords: ['innovation', 'software'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    const mockAIResponse = {
      id: 'response-1',
      query_id: 'query-1',
      model_name: 'GPT-4',
      provider: 'openai',
      response: 'TechCorp is a leading technology company...',
      usage: { prompt_tokens: 20, completion_tokens: 50, total_tokens: 70 },
      cost: 0.001,
      processing_time_ms: 1500,
      confidence_score: 0.85,
      created_at: new Date()
    };

    const mockParsedResponse = {
      ...mockAIResponse,
      citations: [
        {
          url: 'https://example.com/techcorp',
          domain: 'example.com',
          authority_score: 0.8,
          relevance_score: 0.9,
          content_type: 'article'
        }
      ],
      brand_mentions: [
        {
          brand_name: 'TechCorp',
          mention_text: 'TechCorp',
          context: 'TechCorp is a leading company',
          position_in_response: 0,
          sentiment_score: 0.7,
          sentiment_label: 'positive' as const,
          confidence: 0.8
        }
      ],
      sentiment_analysis: {
        overall_sentiment: 0.7,
        sentiment_label: 'positive' as const,
        confidence: 0.8
      },
      topics: ['technology', 'innovation'],
      entities: []
    };

    beforeEach(() => {
      mockBrandModel.findById.mockResolvedValue(mockBrand as any);
      mockAIResponseModel.create.mockResolvedValue({ id: 'stored-response-1' } as any);
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      
      mockAIModelManagerInstance.executeBrandMonitoring.mockResolvedValue({
        query: { id: 'query-1', brand_id: 'brand-1', query: 'test query' },
        responses: [mockAIResponse],
        parsed_responses: [mockParsedResponse]
      });
    });

    it('should successfully monitor a brand', async () => {
      const result = await brandMonitoringService.monitorBrand('brand-1');

      expect(result).toHaveProperty('brand_id', 'brand-1');
      expect(result).toHaveProperty('visibility_score');
      expect(result).toHaveProperty('ai_responses');
      expect(result).toHaveProperty('citations');
      expect(result).toHaveProperty('mentions');
      expect(result).toHaveProperty('timestamp');

      expect(mockBrandModel.findById).toHaveBeenCalledWith('brand-1');
      expect(mockAIModelManagerInstance.executeBrandMonitoring).toHaveBeenCalled();
      expect(mockAIResponseModel.create).toHaveBeenCalled();
    });

    it('should throw error for non-existent brand', async () => {
      mockBrandModel.findById.mockResolvedValue(null);

      await expect(brandMonitoringService.monitorBrand('non-existent'))
        .rejects.toThrow('Brand with ID non-existent not found');
    });

    it('should calculate visibility score correctly', async () => {
      const result = await brandMonitoringService.monitorBrand('brand-1');

      expect(result.visibility_score).toHaveProperty('overall_score');
      expect(result.visibility_score).toHaveProperty('mention_frequency');
      expect(result.visibility_score).toHaveProperty('sentiment_score');
      expect(result.visibility_score).toHaveProperty('citation_quality');
      expect(result.visibility_score).toHaveProperty('ranking_position');
      expect(result.visibility_score).toHaveProperty('confidence');

      // Verify scores are within expected ranges
      expect(result.visibility_score.overall_score).toBeGreaterThanOrEqual(0);
      expect(result.visibility_score.overall_score).toBeLessThanOrEqual(100);
      expect(result.visibility_score.sentiment_score).toBeGreaterThanOrEqual(0);
      expect(result.visibility_score.sentiment_score).toBeLessThanOrEqual(100);
    });

    it('should handle custom query types', async () => {
      const customQueryTypes = ['visibility', 'sentiment'];
      
      await brandMonitoringService.monitorBrand('brand-1', customQueryTypes);

      // Should be called for each query type
      expect(mockAIModelManagerInstance.executeBrandMonitoring).toHaveBeenCalledTimes(2);
    });

    it('should handle AI model errors gracefully', async () => {
      mockAIModelManagerInstance.executeBrandMonitoring.mockRejectedValue(
        new Error('AI model error')
      );

      const result = await brandMonitoringService.monitorBrand('brand-1');

      // Should still return a result with empty data
      expect(result.brand_id).toBe('brand-1');
      expect(result.ai_responses).toHaveLength(0);
      expect(result.visibility_score.overall_score).toBe(0);
    });
  });

  describe('getVisibilityTrends', () => {
    const mockTrends = [
      {
        id: 'metric-1',
        brand_id: 'brand-1',
        metric_date: new Date('2024-01-15'),
        overall_score: 75,
        ranking_position: 5,
        mention_frequency: 8,
        average_sentiment: 0.6,
        created_at: new Date()
      },
      {
        id: 'metric-2',
        brand_id: 'brand-1',
        metric_date: new Date('2024-01-14'),
        overall_score: 72,
        ranking_position: 6,
        mention_frequency: 7,
        average_sentiment: 0.5,
        created_at: new Date()
      }
    ];

    beforeEach(() => {
      mockQuery.mockResolvedValue({ rows: mockTrends });
    });

    it('should return visibility trends for a brand', async () => {
      const trends = await brandMonitoringService.getVisibilityTrends('brand-1', 30);

      expect(trends).toHaveLength(2);
      expect(trends[0]).toHaveProperty('overall_score', 75);
      expect(trends[1]).toHaveProperty('overall_score', 72);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM visibility_metrics'),
        ['brand-1']
      );
    });

    it('should use default days parameter', async () => {
      await brandMonitoringService.getVisibilityTrends('brand-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('30 days'),
        ['brand-1']
      );
    });
  });

  describe('compareWithCompetitors', () => {
    const mockBrandMetrics = [
      {
        id: 'metric-1',
        brand_id: 'brand-1',
        overall_score: 75,
        created_at: new Date()
      }
    ];

    beforeEach(() => {
      mockQuery.mockResolvedValue({ rows: mockBrandMetrics });
      
      mockAIModelManagerInstance.executeBrandMonitoring.mockResolvedValue({
        query: { id: 'comp-query', brand_id: 'competitor', query: 'competitor query' },
        responses: [],
        parsed_responses: [{
          brand_mentions: [
            { brand_name: 'Competitor', sentiment_score: 0.5 },
            { brand_name: 'Competitor', sentiment_score: 0.6 }
          ]
        }] as any
      });
    });

    it('should compare brand with competitors', async () => {
      const competitors = ['CompetitorA', 'CompetitorB'];
      
      const result = await brandMonitoringService.compareWithCompetitors(
        'brand-1',
        competitors,
        7
      );

      expect(result).toHaveProperty('brand_metrics');
      expect(result).toHaveProperty('competitor_data');
      expect(result.competitor_data).toHaveLength(2);
      
      expect(result.competitor_data[0]).toHaveProperty('name', 'CompetitorA');
      expect(result.competitor_data[0]).toHaveProperty('estimated_score');
      expect(result.competitor_data[0]).toHaveProperty('comparison');
    });

    it('should handle competitor analysis errors', async () => {
      mockAIModelManagerInstance.executeBrandMonitoring.mockRejectedValue(
        new Error('Competitor analysis failed')
      );

      const result = await brandMonitoringService.compareWithCompetitors(
        'brand-1',
        ['CompetitorA'],
        7
      );

      expect(result.competitor_data[0]).toEqual({
        name: 'CompetitorA',
        estimated_score: 0,
        comparison: 'unknown'
      });
    });
  });

  describe('batchMonitorBrands', () => {
    beforeEach(() => {
      mockBrandModel.findById.mockResolvedValue({
        id: 'brand-1',
        name: 'TechCorp',
        industry: 'Technology',
        competitor_brands: [],
        monitoring_keywords: []
      } as any);

      mockAIModelManagerInstance.executeBrandMonitoring.mockResolvedValue({
        query: { id: 'query-1', brand_id: 'brand-1', query: 'test' },
        responses: [],
        parsed_responses: []
      });

      mockAIResponseModel.create.mockResolvedValue({ id: 'response-1' } as any);
      mockQuery.mockResolvedValue({ rows: [] });
    });

    it('should monitor multiple brands in batch', async () => {
      const brandIds = ['brand-1', 'brand-2'];
      
      const results = await brandMonitoringService.batchMonitorBrands(brandIds);

      expect(results).toHaveLength(2);
      expect(mockBrandModel.findById).toHaveBeenCalledTimes(2);
    });

    it('should handle individual brand failures in batch', async () => {
      mockBrandModel.findById
        .mockResolvedValueOnce({
          id: 'brand-1',
          name: 'TechCorp',
          industry: 'Technology',
          competitor_brands: [],
          monitoring_keywords: []
        } as any)
        .mockRejectedValueOnce(new Error('Brand not found'));

      const results = await brandMonitoringService.batchMonitorBrands(['brand-1', 'brand-2']);

      // Should return results for successful brands only
      expect(results).toHaveLength(1);
      expect(results[0]?.brand_id).toBe('brand-1');
    });
  });

  describe('visibility score calculation', () => {
    it('should return zero scores for empty data', async () => {
      mockBrandModel.findById.mockResolvedValue({
        id: 'brand-1',
        name: 'TechCorp',
        competitor_brands: [],
        monitoring_keywords: []
      } as any);

      mockAIModelManagerInstance.executeBrandMonitoring.mockResolvedValue({
        query: { id: 'query-1', brand_id: 'brand-1', query: 'test' },
        responses: [],
        parsed_responses: []
      });

      const result = await brandMonitoringService.monitorBrand('brand-1');

      expect(result.visibility_score.overall_score).toBe(0);
      expect(result.visibility_score.mention_frequency).toBe(0);
      expect(result.visibility_score.sentiment_score).toBe(0);
      expect(result.visibility_score.citation_quality).toBe(0);
      expect(result.visibility_score.confidence).toBe(0);
    });

    it('should calculate scores proportionally to data quality', async () => {
      const highQualityData = {
        query: { id: 'query-1', brand_id: 'brand-1', query: 'test' },
        responses: [{
          id: 'resp-1',
          query_id: 'query-1',
          model_name: 'GPT-4',
          provider: 'openai',
          response: 'High quality response about TechCorp',
          usage: { prompt_tokens: 20, completion_tokens: 50, total_tokens: 70 },
          cost: 0.001,
          processing_time_ms: 1500,
          confidence_score: 0.85,
          created_at: new Date()
        }],
        parsed_responses: [{
          citations: [
            { authority_score: 0.9, relevance_score: 0.8 },
            { authority_score: 0.8, relevance_score: 0.9 }
          ],
          brand_mentions: [
            { sentiment_score: 0.8 },
            { sentiment_score: 0.7 },
            { sentiment_score: 0.9 }
          ]
        }]
      };

      mockBrandModel.findById.mockResolvedValue({
        id: 'brand-1',
        name: 'TechCorp',
        competitor_brands: [],
        monitoring_keywords: []
      } as any);

      mockAIModelManagerInstance.executeBrandMonitoring.mockResolvedValue(highQualityData as any);
      mockAIResponseModel.create.mockResolvedValue({ id: 'response-1' } as any);

      const result = await brandMonitoringService.monitorBrand('brand-1');

      expect(result.visibility_score.overall_score).toBeGreaterThan(50);
      expect(result.visibility_score.mention_frequency).toBeGreaterThan(0);
      expect(result.visibility_score.sentiment_score).toBeGreaterThan(50);
      expect(result.visibility_score.citation_quality).toBeGreaterThan(50);
      expect(result.visibility_score.confidence).toBeGreaterThan(50);
    });
  });
});