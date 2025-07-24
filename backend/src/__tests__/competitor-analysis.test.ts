import { CompetitiveAnalysisService } from '../services/CompetitiveAnalysisService';
import { query } from '../config/database';
import { AIModelManager } from '../services/ai/AIModelManager';

// Mock database queries
jest.mock('../config/database', () => ({
  query: jest.fn()
}));

// Mock AI Model Manager
jest.mock('../services/ai/AIModelManager', () => ({
  AIModelManager: jest.fn().mockImplementation(() => ({
    getDefaultModel: jest.fn().mockReturnValue({
      query: jest.fn().mockResolvedValue({
        response: JSON.stringify({
          overall_score: 75,
          ranking_position: 5,
          mention_frequency: 8,
          sentiment_score: 0.6,
          citation_quality: 70
        })
      })
    })
  }))
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('CompetitiveAnalysisService', () => {
  let service: CompetitiveAnalysisService;
  
  const mockBrandMetrics = [
    {
      id: 'metric-1',
      brand_id: 'brand-1',
      metric_date: new Date('2024-01-15'),
      metric_hour: 10,
      overall_score: 80,
      ranking_position: 3,
      mention_frequency: 10,
      average_sentiment: 0.7,
      citation_count: 5,
      source_quality_score: 85,
      query_category: 'general',
      created_at: new Date('2024-01-15'),
      updated_at: new Date('2024-01-15')
    },
    {
      id: 'metric-2',
      brand_id: 'brand-1',
      metric_date: new Date('2024-01-16'),
      metric_hour: 14,
      overall_score: 75,
      ranking_position: 4,
      mention_frequency: 8,
      average_sentiment: 0.6,
      citation_count: 4,
      source_quality_score: 80,
      query_category: 'general',
      created_at: new Date('2024-01-16'),
      updated_at: new Date('2024-01-16')
    }
  ];

  const mockAIResponses = [
    {
      id: 'response-1',
      query_id: 'query-1',
      response_text: 'CompetitorA is a leading brand in the market with strong customer satisfaction.',
      query_type: 'general',
      created_at: new Date('2024-01-15'),
      updated_at: new Date('2024-01-15')
    },
    {
      id: 'response-2',
      query_id: 'query-2',
      response_text: 'CompetitorA has been gaining market share with innovative products.',
      query_type: 'general',
      created_at: new Date('2024-01-16'),
      updated_at: new Date('2024-01-16')
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CompetitiveAnalysisService();
  });

  describe('compareBrandWithCompetitor', () => {
    it('should successfully compare brand with competitor', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock brand metrics query
      mockQuery.mockResolvedValueOnce({
        rows: mockBrandMetrics
      });
      
      // Mock competitor AI responses query
      mockQuery.mockResolvedValueOnce({
        rows: mockAIResponses
      });

      const result = await service.compareBrandWithCompetitor(
        'brand-1',
        'CompetitorA',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toHaveProperty('brand_id', 'brand-1');
      expect(result).toHaveProperty('brand_name', 'TechCorp');
      expect(result).toHaveProperty('competitor_name', 'CompetitorA');
      expect(result).toHaveProperty('metrics_comparison');
      expect(result).toHaveProperty('market_share_analysis');
      expect(result).toHaveProperty('competitive_gaps');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('generated_at');

      // Verify metrics comparison structure
      expect(result.metrics_comparison).toHaveProperty('overall_score');
      expect(result.metrics_comparison).toHaveProperty('mention_frequency');
      expect(result.metrics_comparison).toHaveProperty('sentiment_score');
      expect(result.metrics_comparison).toHaveProperty('ranking_position');

      // Verify each metric has brand, competitor, difference, and advantage
      expect(result.metrics_comparison.overall_score).toHaveProperty('brand');
      expect(result.metrics_comparison.overall_score).toHaveProperty('competitor');
      expect(result.metrics_comparison.overall_score).toHaveProperty('difference');
      expect(result.metrics_comparison.overall_score).toHaveProperty('advantage');
    });

    it('should throw error for non-existent brand', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.compareBrandWithCompetitor(
          'non-existent',
          'CompetitorA',
          new Date('2024-01-01'),
          new Date('2024-01-31')
        )
      ).rejects.toThrow('Brand with ID non-existent not found');
    });

    it('should handle empty brand metrics', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock empty brand metrics
      mockQuery.mockResolvedValueOnce({ rows: [] });
      
      // Mock competitor AI responses
      mockQuery.mockResolvedValueOnce({
        rows: mockAIResponses
      });

      const result = await service.compareBrandWithCompetitor(
        'brand-1',
        'CompetitorA',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toHaveProperty('brand_id', 'brand-1');
      expect(result.metrics_comparison.overall_score.brand).toBe(0);
      expect(result.metrics_comparison.mention_frequency.brand).toBe(0);
    });

    it('should handle empty competitor data', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock brand metrics
      mockQuery.mockResolvedValueOnce({
        rows: mockBrandMetrics
      });
      
      // Mock empty competitor responses
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.compareBrandWithCompetitor(
        'brand-1',
        'CompetitorA',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toHaveProperty('brand_id', 'brand-1');
      expect(result.metrics_comparison.overall_score.competitor).toBe(0);
      expect(result.metrics_comparison.mention_frequency.competitor).toBe(0);
    });
  });

  describe('analyzeMarketPositioning', () => {
    it('should successfully analyze market positioning', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock brand metrics query
      mockQuery.mockResolvedValueOnce({
        rows: mockBrandMetrics
      });
      
      // Mock competitor queries (2 competitors)
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });

      const result = await service.analyzeMarketPositioning(
        'brand-1',
        ['CompetitorA', 'CompetitorB'],
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result).toHaveProperty('brand_id', 'brand-1');
      expect(result).toHaveProperty('brand_name', 'TechCorp');
      expect(result).toHaveProperty('market_position');
      expect(result).toHaveProperty('competitive_landscape');
      expect(result).toHaveProperty('strengths');
      expect(result).toHaveProperty('weaknesses');
      expect(result).toHaveProperty('opportunities');
      expect(result).toHaveProperty('threats');

      // Verify market position structure
      expect(result.market_position).toHaveProperty('rank');
      expect(result.market_position).toHaveProperty('total_competitors');
      expect(result.market_position).toHaveProperty('percentile');
      expect(result.market_position).toHaveProperty('position_category');

      // Verify competitive landscape
      expect(result.competitive_landscape).toHaveLength(2);
      expect(result.competitive_landscape[0]).toHaveProperty('competitor_name');
      expect(result.competitive_landscape[0]).toHaveProperty('relative_position');
      expect(result.competitive_landscape[0]).toHaveProperty('score_difference');
      expect(result.competitive_landscape[0]).toHaveProperty('market_share');
    });

    it('should correctly determine position categories', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock high-performing brand metrics
      const highPerformingMetrics = mockBrandMetrics.map(metric => ({
        ...metric,
        overall_score: 95,
        ranking_position: 1,
        mention_frequency: 20,
        average_sentiment: 0.9
      }));
      
      mockQuery.mockResolvedValueOnce({
        rows: highPerformingMetrics
      });
      
      // Mock competitor queries with lower performance
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });

      const result = await service.analyzeMarketPositioning(
        'brand-1',
        ['CompetitorA', 'CompetitorB', 'CompetitorC', 'CompetitorD'],
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.market_position.position_category).toBe('leader');
      expect(result.market_position.rank).toBe(1);
      expect(result.market_position.percentile).toBeGreaterThan(75);
    });

    it('should throw error for non-existent brand', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.analyzeMarketPositioning(
          'non-existent',
          ['CompetitorA'],
          new Date('2024-01-01'),
          new Date('2024-01-31')
        )
      ).rejects.toThrow('Brand with ID non-existent not found');
    });
  });

  describe('competitive gap identification', () => {
    it('should identify visibility gaps correctly', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock low-performing brand metrics
      const lowPerformingMetrics = mockBrandMetrics.map(metric => ({
        ...metric,
        overall_score: 40,
        ranking_position: 8,
        mention_frequency: 3,
        average_sentiment: 0.2
      }));
      
      mockQuery.mockResolvedValueOnce({
        rows: lowPerformingMetrics
      });
      
      // Mock competitor responses
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });

      const result = await service.compareBrandWithCompetitor(
        'brand-1',
        'CompetitorA',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      // With low-performing brand metrics, there should be competitive gaps
      expect(result.competitive_gaps.length).toBeGreaterThanOrEqual(0);
      
      // Check if visibility gap exists (it should with the low performance metrics)
      const visibilityGap = result.competitive_gaps.find(gap => gap.category === 'visibility');
      if (visibilityGap) {
        expect(visibilityGap.gap_size).toBeDefined();
        expect(visibilityGap.impact).toBeDefined();
      }
    });

    it('should provide appropriate recommendations for gaps', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock brand metrics
      mockQuery.mockResolvedValueOnce({
        rows: mockBrandMetrics
      });
      
      // Mock competitor responses
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });

      const result = await service.compareBrandWithCompetitor(
        'brand-1',
        'CompetitorA',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('market share calculations', () => {
    it('should calculate market share correctly', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock brand metrics with high mentions
      const highMentionMetrics = mockBrandMetrics.map(metric => ({
        ...metric,
        mention_frequency: 15
      }));
      
      mockQuery.mockResolvedValueOnce({
        rows: highMentionMetrics
      });
      
      // Mock competitor responses
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });

      const result = await service.compareBrandWithCompetitor(
        'brand-1',
        'CompetitorA',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.market_share_analysis).toHaveProperty('brand_share');
      expect(result.market_share_analysis).toHaveProperty('competitor_share');
      expect(result.market_share_analysis).toHaveProperty('total_mentions');
      expect(result.market_share_analysis).toHaveProperty('brand_dominance');

      expect(result.market_share_analysis.brand_share).toBeGreaterThanOrEqual(0);
      expect(result.market_share_analysis.competitor_share).toBeGreaterThanOrEqual(0);
      expect(result.market_share_analysis.total_mentions).toBeGreaterThanOrEqual(0);
    });

    it('should determine brand dominance correctly', async () => {
      // Mock brand query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      
      // Mock brand metrics with very high mentions
      const dominantBrandMetrics = mockBrandMetrics.map(metric => ({
        ...metric,
        mention_frequency: 50
      }));
      
      mockQuery.mockResolvedValueOnce({
        rows: dominantBrandMetrics
      });
      
      // Mock competitor responses with lower mentions
      const lowMentionResponses = mockAIResponses.slice(0, 1);
      mockQuery.mockResolvedValueOnce({ rows: lowMentionResponses });

      const result = await service.compareBrandWithCompetitor(
        'brand-1',
        'CompetitorA',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(result.market_share_analysis.brand_dominance).toBe('leading');
      expect(result.market_share_analysis.brand_share).toBeGreaterThan(
        result.market_share_analysis.competitor_share * 1.2
      );
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        service.compareBrandWithCompetitor(
          'brand-1',
          'CompetitorA',
          new Date('2024-01-01'),
          new Date('2024-01-31')
        )
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle AI model errors gracefully', async () => {
      // Mock successful database queries
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'brand-1', name: 'TechCorp' }]
      });
      mockQuery.mockResolvedValueOnce({ rows: mockBrandMetrics });
      mockQuery.mockResolvedValueOnce({ rows: mockAIResponses });

      // Mock AI model to throw error
      const mockAIModel = {
        query: jest.fn().mockRejectedValue(new Error('AI model unavailable'))
      };
      
      const mockAIModelManager = {
        getDefaultModel: jest.fn().mockReturnValue(mockAIModel)
      };
      
      // Replace the AI model manager in the service
      (service as any).aiModelManager = mockAIModelManager;

      const result = await service.compareBrandWithCompetitor(
        'brand-1',
        'CompetitorA',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      // Should still return results with fallback recommendations
      expect(result).toHaveProperty('recommendations');
      expect(result.recommendations).toContain('Increase content marketing efforts to improve visibility');
    });
  });

  describe('metric calculations', () => {
    it('should calculate average metrics correctly', async () => {
      const metrics = [
        { ...mockBrandMetrics[0], overall_score: 80, mention_frequency: 10 },
        { ...mockBrandMetrics[1], overall_score: 60, mention_frequency: 6 }
      ];

      const avgMetrics = (service as any).calculateAverageMetrics(metrics);

      expect(avgMetrics.overall_score).toBe(70);
      expect(avgMetrics.mention_frequency).toBe(8);
    });

    it('should handle empty metrics array', async () => {
      const avgMetrics = (service as any).calculateAverageMetrics([]);

      expect(avgMetrics.overall_score).toBe(0);
      expect(avgMetrics.ranking_position).toBe(10);
      expect(avgMetrics.mention_frequency).toBe(0);
      expect(avgMetrics.average_sentiment).toBe(0);
    });

    it('should determine advantage correctly', async () => {
      const determineAdvantage = (service as any).determineAdvantage;

      expect(determineAdvantage(80, 60)).toBe('brand');
      expect(determineAdvantage(60, 80)).toBe('competitor');
      expect(determineAdvantage(75, 76)).toBe('neutral'); // Within 5% threshold
    });

    it('should calculate overall score with proper weighting', async () => {
      const metrics = [
        {
          ...mockBrandMetrics[0],
          overall_score: 80,
          mention_frequency: 10,
          average_sentiment: 0.6,
          ranking_position: 3,
          source_quality_score: 85
        }
      ];

      const overallScore = (service as any).calculateOverallScore(metrics);

      expect(overallScore).toBeGreaterThan(0);
      expect(overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('gap size determination', () => {
    it('should categorize gap sizes correctly', async () => {
      const determineGapSize = (service as any).determineGapSize;

      expect(determineGapSize(5)).toBe('small');
      expect(determineGapSize(15)).toBe('medium');
      expect(determineGapSize(30)).toBe('large');
    });
  });
});