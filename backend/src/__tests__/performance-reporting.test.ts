import { PerformanceReportingService, ReportTimeRange } from '../services/PerformanceReportingService';
import { BrandMonitoringService } from '../services/BrandMonitoringService';

// Mock dependencies
jest.mock('../services/BrandMonitoringService');
jest.mock('../config/database', () => ({
  query: jest.fn()
}));

const mockQuery = require('../config/database').query;
const mockBrandMonitoringService = BrandMonitoringService as jest.MockedClass<typeof BrandMonitoringService>;

describe('PerformanceReportingService', () => {
  let performanceReportingService: PerformanceReportingService;

  beforeEach(() => {
    jest.clearAllMocks();
    performanceReportingService = new PerformanceReportingService();
  });

  describe('generatePerformanceReport', () => {
    const mockTimeRange: ReportTimeRange = {
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-01-31'),
      period: 'daily'
    };

    const mockMetrics = [
      {
        metric_date: new Date('2024-01-15'),
        overall_score: 75,
        mention_frequency: 8,
        average_sentiment: 0.6,
        ranking_position: 5,
        citation_count: 3,
        source_quality_score: 0.8
      },
      {
        metric_date: new Date('2024-01-16'),
        overall_score: 78,
        mention_frequency: 9,
        average_sentiment: 0.7,
        ranking_position: 4,
        citation_count: 4,
        source_quality_score: 0.85
      }
    ];

    it('should generate comprehensive performance report', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: 'TechCorp' }] }) // Brand name query
        .mockResolvedValue({ rows: mockMetrics }); // Metrics queries

      const report = await performanceReportingService.generatePerformanceReport(
        'brand-1',
        mockTimeRange
      );

      expect(report).toHaveProperty('brand_id', 'brand-1');
      expect(report).toHaveProperty('brand_name', 'TechCorp');
      expect(report).toHaveProperty('report_period', mockTimeRange);
      expect(report).toHaveProperty('summary_metrics');
      expect(report).toHaveProperty('chart_data');
      expect(report).toHaveProperty('insights');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('generated_at');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT name FROM brands WHERE id = $1',
        ['brand-1']
      );
    });

    it('should throw error for non-existent brand', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Empty brand result

      await expect(
        performanceReportingService.generatePerformanceReport('non-existent', mockTimeRange)
      ).rejects.toThrow('Brand with ID non-existent not found');
    });

    it('should include summary metrics with trends', async () => {
      const report = await performanceReportingService.generatePerformanceReport(
        'brand-1',
        mockTimeRange
      );

      expect(report.summary_metrics).toHaveProperty('overall_score');
      expect(report.summary_metrics).toHaveProperty('mention_frequency');
      expect(report.summary_metrics).toHaveProperty('sentiment_score');
      expect(report.summary_metrics).toHaveProperty('ranking_position');

      // Check structure of each metric
      expect(report.summary_metrics.overall_score).toHaveProperty('current');
      expect(report.summary_metrics.overall_score).toHaveProperty('previous');
      expect(report.summary_metrics.overall_score).toHaveProperty('change');
      expect(report.summary_metrics.overall_score).toHaveProperty('trend');
    });

    it('should generate chart data in correct format', async () => {
      const report = await performanceReportingService.generatePerformanceReport(
        'brand-1',
        mockTimeRange
      );

      expect(report.chart_data).toHaveLength(2);
      expect(report.chart_data[0]).toHaveProperty('date');
      expect(report.chart_data[0]).toHaveProperty('overall_score');
      expect(report.chart_data[0]).toHaveProperty('mention_frequency');
      expect(report.chart_data[0]).toHaveProperty('sentiment_score');
      expect(report.chart_data[0]).toHaveProperty('ranking_position');

      // Check date format
      expect(report.chart_data[0]?.date).toBe('2024-01-15');
      expect(report.chart_data[1]?.date).toBe('2024-01-16');
    });

    it('should generate insights and recommendations', async () => {
      const report = await performanceReportingService.generatePerformanceReport(
        'brand-1',
        mockTimeRange
      );

      expect(Array.isArray(report.insights)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);
      expect(report.insights.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('getAggregatedMetrics', () => {
    const mockTimeRange: ReportTimeRange = {
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-01-31'),
      period: 'daily'
    };

    it('should aggregate metrics by daily period', async () => {
      const mockMetrics = [
        { metric_date: new Date('2024-01-15'), overall_score: 75 },
        { metric_date: new Date('2024-01-16'), overall_score: 78 }
      ];

      mockQuery.mockResolvedValue({ rows: mockMetrics });

      const result = await performanceReportingService.getAggregatedMetrics(
        'brand-1',
        mockTimeRange
      );

      expect(result).toEqual(mockMetrics);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('GROUP BY metric_date'),
        ['brand-1', mockTimeRange.start_date, mockTimeRange.end_date]
      );
    });

    it('should aggregate metrics by weekly period', async () => {
      const weeklyTimeRange: ReportTimeRange = {
        ...mockTimeRange,
        period: 'weekly'
      };

      mockQuery.mockResolvedValue({ rows: [] });

      await performanceReportingService.getAggregatedMetrics('brand-1', weeklyTimeRange);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("DATE_TRUNC('week', metric_date)"),
        ['brand-1', weeklyTimeRange.start_date, weeklyTimeRange.end_date]
      );
    });

    it('should aggregate metrics by monthly period', async () => {
      const monthlyTimeRange: ReportTimeRange = {
        ...mockTimeRange,
        period: 'monthly'
      };

      mockQuery.mockResolvedValue({ rows: [] });

      await performanceReportingService.getAggregatedMetrics('brand-1', monthlyTimeRange);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("DATE_TRUNC('month', metric_date)"),
        ['brand-1', monthlyTimeRange.start_date, monthlyTimeRange.end_date]
      );
    });
  });

  describe('exportReport', () => {
    const mockReport = {
      brand_id: 'brand-1',
      brand_name: 'TechCorp',
      report_period: {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-01-31'),
        period: 'daily' as const
      },
      summary_metrics: {
        overall_score: { current: 75, previous: 70, change: 5, trend: 'up' as const },
        mention_frequency: { current: 8, previous: 6, change: 2, trend: 'up' as const },
        sentiment_score: { current: 0.6, previous: 0.5, change: 0.1, trend: 'up' as const },
        ranking_position: { current: 5, previous: 7, change: -2, trend: 'up' as const }
      },
      chart_data: [
        { date: '2024-01-15', overall_score: 75, mention_frequency: 8, sentiment_score: 80, ranking_position: 5 }
      ],
      insights: ['Test insight'],
      recommendations: ['Test recommendation'],
      generated_at: new Date()
    };

    it('should export report as JSON', async () => {
      const result = await performanceReportingService.exportReport(mockReport, {
        format: 'json',
        include_charts: true,
        include_insights: true,
        date_range: mockReport.report_period
      });

      expect(result.contentType).toBe('application/json');
      expect(result.filename).toMatch(/brand-report-brand-1-\d+\.json/);
      expect(typeof result.data).toBe('string');
      
      const parsedData = JSON.parse(result.data as string);
      expect(parsedData.brand_id).toBe('brand-1');
    });

    it('should export report as CSV', async () => {
      const result = await performanceReportingService.exportReport(mockReport, {
        format: 'csv',
        include_charts: true,
        include_insights: true,
        date_range: mockReport.report_period
      });

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toMatch(/brand-report-brand-1-\d+\.csv/);
      expect(typeof result.data).toBe('string');
      expect(result.data).toContain('Date,Overall Score,Mention Frequency');
      expect(result.data).toContain('2024-01-15,75,8,80,5');
    });

    it('should export report as PDF (text format)', async () => {
      const result = await performanceReportingService.exportReport(mockReport, {
        format: 'pdf',
        include_charts: true,
        include_insights: true,
        date_range: mockReport.report_period
      });

      expect(result.contentType).toBe('text/plain');
      expect(result.filename).toMatch(/brand-report-brand-1-\d+\.txt/);
      expect(typeof result.data).toBe('string');
      expect(result.data).toContain('BRAND PERFORMANCE REPORT');
      expect(result.data).toContain('Brand: TechCorp');
    });

    it('should throw error for unsupported format', async () => {
      await expect(
        performanceReportingService.exportReport(mockReport, {
          format: 'xml' as any,
          include_charts: true,
          include_insights: true,
          date_range: mockReport.report_period
        })
      ).rejects.toThrow('Unsupported export format: xml');
    });
  });

  describe('trend calculation', () => {
    it('should calculate correct trends for improving metrics', async () => {
      const mockCurrentMetrics = [
        {
          metric_date: new Date('2024-01-15'),
          overall_score: 80,
          mention_frequency: 10,
          average_sentiment: 0.8,
          ranking_position: 3
        }
      ];

      const mockPreviousMetrics = [
        {
          metric_date: new Date('2023-12-15'),
          overall_score: 70,
          mention_frequency: 8,
          average_sentiment: 0.6,
          ranking_position: 5
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: 'TechCorp' }] }) // Brand name query
        .mockResolvedValueOnce({ rows: mockCurrentMetrics }) // Current period metrics
        .mockResolvedValueOnce({ rows: mockCurrentMetrics }) // Summary metrics - current
        .mockResolvedValueOnce({ rows: mockPreviousMetrics }) // Summary metrics - previous
        .mockResolvedValueOnce({ rows: mockCurrentMetrics }) // Chart data
        .mockResolvedValue({ rows: [] }); // Any other calls

      const report = await performanceReportingService.generatePerformanceReport(
        'brand-1',
        {
          start_date: new Date('2024-01-01'),
          end_date: new Date('2024-01-31'),
          period: 'daily'
        }
      );

      expect(report.summary_metrics.overall_score.trend).toBe('up');
      expect(report.summary_metrics.mention_frequency.trend).toBe('up');
      expect(report.summary_metrics.sentiment_score.trend).toBe('up');
      expect(report.summary_metrics.ranking_position.trend).toBe('up'); // Better ranking (lower number)
    });

    it('should handle empty metrics gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: 'TechCorp' }] })
        .mockResolvedValue({ rows: [] }); // Empty metrics

      const report = await performanceReportingService.generatePerformanceReport(
        'brand-1',
        {
          start_date: new Date('2024-01-01'),
          end_date: new Date('2024-01-31'),
          period: 'daily'
        }
      );

      expect(report.summary_metrics.overall_score.current).toBe(0);
      expect(report.summary_metrics.overall_score.trend).toBe('stable');
      expect(report.chart_data).toHaveLength(0);
    });
  });

  describe('insights generation', () => {
    it('should generate positive insights for improving metrics', async () => {
      const mockMetrics = [
        {
          metric_date: new Date('2024-01-15'),
          overall_score: 80,
          mention_frequency: 10,
          average_sentiment: 0.8,
          ranking_position: 3
        }
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: 'TechCorp' }] })
        .mockResolvedValue({ rows: mockMetrics });

      const report = await performanceReportingService.generatePerformanceReport(
        'brand-1',
        {
          start_date: new Date('2024-01-01'),
          end_date: new Date('2024-01-31'),
          period: 'daily'
        }
      );

      expect(report.insights.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });
});