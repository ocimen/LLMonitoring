import { AlertManagementService } from '../services/AlertManagementService';
import { query } from '../config/database';
import { Alert, AlertThreshold, VisibilityMetrics } from '../types/database';

// Mock database queries
jest.mock('../config/database', () => ({
  query: jest.fn()
}));

// Mock Bull Queue
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({}),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined)
  }));
});

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    disconnect: jest.fn()
  }));
});

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('AlertManagementService', () => {
  let service: AlertManagementService;

  const mockAlertThreshold: AlertThreshold = {
    id: 'threshold-1',
    brand_id: 'brand-1',
    user_id: 'user-1',
    metric_type: 'overall_score',
    threshold_value: 70,
    comparison_operator: '<',
    is_active: true,
    notification_channels: ['email', 'in_app'],
    created_at: new Date('2024-01-15'),
    updated_at: new Date('2024-01-15')
  };

  const mockVisibilityMetrics: VisibilityMetrics = {
    id: 'metric-1',
    brand_id: 'brand-1',
    metric_date: new Date('2024-01-15'),
    metric_hour: 10,
    overall_score: 65,
    ranking_position: 5,
    mention_frequency: 8,
    average_sentiment: 0.6,
    citation_count: 4,
    source_quality_score: 75,
    created_at: new Date('2024-01-15')
  };

  const mockAlert: Alert = {
    id: 'alert-1',
    brand_id: 'brand-1',
    alert_threshold_id: 'threshold-1',
    severity: 'medium',
    title: 'Medium Alert: Overall Visibility Score Threshold Exceeded',
    message: 'Your brand\'s overall visibility score has fallen below the configured threshold.',
    metric_type: 'overall_score',
    current_value: 65,
    threshold_value: 70,
    is_acknowledged: false,
    created_at: new Date('2024-01-15')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AlertManagementService();
  });

  afterEach(async () => {
    await service.close();
  });

  describe('createAlertThreshold', () => {
    it('should create a new alert threshold successfully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlertThreshold],
        rowCount: 1
      });

      const config = {
        brand_id: 'brand-1',
        user_id: 'user-1',
        metric_type: 'overall_score',
        threshold_value: 70,
        comparison_operator: '<' as const,
        notification_channels: ['email', 'in_app']
      };

      const result = await service.createAlertThreshold(config);

      expect(result).toEqual(mockAlertThreshold);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alert_thresholds'),
        [
          config.brand_id,
          config.user_id,
          config.metric_type,
          config.threshold_value,
          config.comparison_operator,
          config.notification_channels
        ]
      );
    });

    it('should handle database errors when creating threshold', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const config = {
        brand_id: 'brand-1',
        user_id: 'user-1',
        metric_type: 'overall_score',
        threshold_value: 70,
        comparison_operator: '<' as const,
        notification_channels: ['email']
      };

      await expect(service.createAlertThreshold(config)).rejects.toThrow('Database error');
    });
  });

  describe('updateAlertThreshold', () => {
    it('should update an existing alert threshold', async () => {
      const updatedThreshold = { ...mockAlertThreshold, threshold_value: 75 };
      mockQuery.mockResolvedValueOnce({
        rows: [updatedThreshold],
        rowCount: 1
      });

      const updates = { threshold_value: 75 };
      const result = await service.updateAlertThreshold('threshold-1', updates);

      expect(result).toEqual(updatedThreshold);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alert_thresholds'),
        expect.arrayContaining([75, 'threshold-1'])
      );
    });

    it('should throw error when threshold not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const updates = { threshold_value: 75 };
      
      await expect(service.updateAlertThreshold('non-existent', updates))
        .rejects.toThrow('Alert threshold with ID non-existent not found or inactive');
    });
  });

  describe('deleteAlertThreshold', () => {
    it('should deactivate an alert threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1
      });

      await service.deleteAlertThreshold('threshold-1');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE alert_thresholds SET is_active = false, updated_at = NOW() WHERE id = $1',
        ['threshold-1']
      );
    });

    it('should throw error when threshold not found for deletion', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await expect(service.deleteAlertThreshold('non-existent'))
        .rejects.toThrow('Alert threshold with ID non-existent not found');
    });
  });

  describe('getAlertThresholds', () => {
    it('should retrieve all active thresholds for a brand', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlertThreshold],
        rowCount: 1
      });

      const result = await service.getAlertThresholds('brand-1');

      expect(result).toEqual([mockAlertThreshold]);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM alert_thresholds WHERE brand_id = $1 AND is_active = true ORDER BY created_at DESC',
        ['brand-1']
      );
    });

    it('should return empty array when no thresholds exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      const result = await service.getAlertThresholds('brand-1');

      expect(result).toEqual([]);
    });
  });

  describe('evaluateThresholds', () => {
    it('should evaluate all thresholds and trigger alerts when conditions are met', async () => {
      // Mock getAlertThresholds
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlertThreshold],
        rowCount: 1
      });

      // Mock shouldSuppressAlert check
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        rowCount: 1
      });

      // Mock createAlert
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlert],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);

      expect(results).toHaveLength(1);
      expect(results[0]!.triggered).toBe(true);
      expect(results[0]!.alert).toBeDefined();
      expect(results[0]!.current_value).toBe(65);
      expect(results[0]!.severity).toBe('medium'); // 65 vs 70 is ~7% difference, which falls in medium range
    });

    it('should not trigger alerts when conditions are not met', async () => {
      const highScoreMetrics = { ...mockVisibilityMetrics, overall_score: 85 };
      
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlertThreshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', highScoreMetrics);

      expect(results).toHaveLength(1);
      expect(results[0]!.triggered).toBe(false);
      expect(results[0]!.alert).toBeUndefined();
    });

    it('should suppress duplicate alerts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlertThreshold],
        rowCount: 1
      });

      // Mock shouldSuppressAlert to return true (recent alert exists)
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);

      expect(results).toHaveLength(1);
      expect(results[0]!.triggered).toBe(true);
      expect(results[0]!.alert).toBeUndefined(); // Alert suppressed
    });
  });

  describe('threshold evaluation logic', () => {
    beforeEach(() => {
      // Mock getAlertThresholds to return empty array to avoid queue operations
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0
      });
    });

    it('should correctly evaluate greater than operator', async () => {
      const threshold = { ...mockAlertThreshold, comparison_operator: '>' as const, threshold_value: 60 };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.triggered).toBe(true); // 65 > 60
    });

    it('should correctly evaluate less than operator', async () => {
      const threshold = { ...mockAlertThreshold, comparison_operator: '<' as const, threshold_value: 70 };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.triggered).toBe(true); // 65 < 70
    });

    it('should correctly evaluate greater than or equal operator', async () => {
      const threshold = { ...mockAlertThreshold, comparison_operator: '>=' as const, threshold_value: 65 };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.triggered).toBe(true); // 65 >= 65
    });

    it('should correctly evaluate less than or equal operator', async () => {
      const threshold = { ...mockAlertThreshold, comparison_operator: '<=' as const, threshold_value: 65 };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.triggered).toBe(true); // 65 <= 65
    });

    it('should correctly evaluate equals operator', async () => {
      const threshold = { ...mockAlertThreshold, comparison_operator: '=' as const, threshold_value: 65 };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.triggered).toBe(true); // 65 = 65 (within tolerance)
    });
  });

  describe('metric value extraction', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0
      });
    });

    it('should extract overall_score correctly', async () => {
      const threshold = { ...mockAlertThreshold, metric_type: 'overall_score' };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.current_value).toBe(65);
    });

    it('should extract ranking_position correctly', async () => {
      const threshold = { ...mockAlertThreshold, metric_type: 'ranking_position' };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.current_value).toBe(5);
    });

    it('should extract mention_frequency correctly', async () => {
      const threshold = { ...mockAlertThreshold, metric_type: 'mention_frequency' };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.current_value).toBe(8);
    });

    it('should extract average_sentiment correctly', async () => {
      const threshold = { ...mockAlertThreshold, metric_type: 'average_sentiment' };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.current_value).toBe(0.6);
    });

    it('should extract citation_count correctly', async () => {
      const threshold = { ...mockAlertThreshold, metric_type: 'citation_count' };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.current_value).toBe(4);
    });

    it('should extract source_quality_score correctly', async () => {
      const threshold = { ...mockAlertThreshold, metric_type: 'source_quality_score' };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.current_value).toBe(75);
    });

    it('should handle unknown metric types', async () => {
      const threshold = { ...mockAlertThreshold, metric_type: 'unknown_metric' };
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      await expect(service.evaluateThresholds('brand-1', mockVisibilityMetrics))
        .rejects.toThrow('Unknown metric type: unknown_metric');
    });
  });

  describe('severity calculation', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0
      });
    });

    it('should calculate low severity for small differences', async () => {
      const threshold = { ...mockAlertThreshold, threshold_value: 68 }; // 65 vs 68 = ~4.4% diff
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.severity).toBe('low');
    });

    it('should calculate medium severity for moderate differences', async () => {
      const threshold = { ...mockAlertThreshold, threshold_value: 75 }; // 65 vs 75 = ~13.3% diff
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.severity).toBe('medium');
    });

    it('should calculate high severity for large differences', async () => {
      const threshold = { ...mockAlertThreshold, threshold_value: 85 }; // 65 vs 85 = ~23.5% diff
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.severity).toBe('high');
    });

    it('should calculate critical severity for very large differences', async () => {
      const threshold = { ...mockAlertThreshold, threshold_value: 100 }; // 65 vs 100 = 35% diff
      mockQuery.mockResolvedValueOnce({
        rows: [threshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      expect(results[0]!.severity).toBe('critical');
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert successfully', async () => {
      const acknowledgedAlert = { 
        ...mockAlert, 
        is_acknowledged: true, 
        acknowledged_by: 'user-1',
        acknowledged_at: new Date('2024-01-15T10:30:00Z')
      };

      mockQuery.mockResolvedValueOnce({
        rows: [acknowledgedAlert],
        rowCount: 1
      });

      const result = await service.acknowledgeAlert('alert-1', 'user-1');

      expect(result).toEqual(acknowledgedAlert);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts'),
        ['user-1', 'alert-1']
      );
    });

    it('should throw error when alert not found for acknowledgment', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await expect(service.acknowledgeAlert('non-existent', 'user-1'))
        .rejects.toThrow('Alert with ID non-existent not found');
    });
  });

  describe('resolveAlert', () => {
    it('should resolve an alert successfully', async () => {
      const resolvedAlert = { 
        ...mockAlert, 
        resolved_at: new Date('2024-01-15T11:00:00Z')
      };

      mockQuery.mockResolvedValueOnce({
        rows: [resolvedAlert],
        rowCount: 1
      });

      const result = await service.resolveAlert('alert-1');

      expect(result).toEqual(resolvedAlert);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts'),
        ['alert-1']
      );
    });

    it('should throw error when alert not found for resolution', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await expect(service.resolveAlert('non-existent'))
        .rejects.toThrow('Alert with ID non-existent not found');
    });
  });

  describe('getAlerts', () => {
    it('should retrieve alerts with default options', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlert],
        rowCount: 1
      });

      const result = await service.getAlerts('brand-1');

      expect(result).toEqual([mockAlert]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM alerts'),
        ['brand-1']
      );
    });

    it('should filter alerts by severity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlert],
        rowCount: 1
      });

      const result = await service.getAlerts('brand-1', { severity: 'high' });

      expect(result).toEqual([mockAlert]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND severity = $2'),
        ['brand-1', 'high']
      );
    });

    it('should filter alerts by acknowledgment status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlert],
        rowCount: 1
      });

      const result = await service.getAlerts('brand-1', { acknowledged: false });

      expect(result).toEqual([mockAlert]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND is_acknowledged = $2'),
        ['brand-1', false]
      );
    });

    it('should filter alerts by resolution status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlert],
        rowCount: 1
      });

      const result = await service.getAlerts('brand-1', { resolved: false });

      expect(result).toEqual([mockAlert]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND resolved_at IS NULL'),
        ['brand-1']
      );
    });

    it('should apply pagination options', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlert],
        rowCount: 1
      });

      const result = await service.getAlerts('brand-1', { limit: 10, offset: 20 });

      expect(result).toEqual([mockAlert]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        ['brand-1', 10, 20]
      );
    });
  });

  describe('getAlertStatistics', () => {
    it('should return comprehensive alert statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total: '25',
          low: '10',
          medium: '8',
          high: '5',
          critical: '2',
          acknowledged: '15',
          resolved: '12',
          active: '13'
        }],
        rowCount: 1
      });

      const result = await service.getAlertStatistics('brand-1');

      expect(result).toEqual({
        total: 25,
        by_severity: {
          low: 10,
          medium: 8,
          high: 5,
          critical: 2
        },
        acknowledged: 15,
        resolved: 12,
        active: 13
      });
    });

    it('should handle zero statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total: '0',
          low: '0',
          medium: '0',
          high: '0',
          critical: '0',
          acknowledged: '0',
          resolved: '0',
          active: '0'
        }],
        rowCount: 1
      });

      const result = await service.getAlertStatistics('brand-1');

      expect(result.total).toBe(0);
      expect(result.by_severity.low).toBe(0);
    });
  });

  describe('cleanupOldAlerts', () => {
    it('should clean up old resolved alerts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 5
      });

      const result = await service.cleanupOldAlerts(30);

      expect(result).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("resolved_at < NOW() - INTERVAL '30 days'")
      );
    });

    it('should use default cleanup period', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 3
      });

      const result = await service.cleanupOldAlerts();

      expect(result).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("resolved_at < NOW() - INTERVAL '30 days'")
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Cleanup failed'));

      await expect(service.cleanupOldAlerts()).rejects.toThrow('Cleanup failed');
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors in evaluateThresholds', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(service.evaluateThresholds('brand-1', mockVisibilityMetrics))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle invalid comparison operators', async () => {
      const invalidThreshold = { ...mockAlertThreshold, comparison_operator: 'invalid' as any };
      mockQuery.mockResolvedValueOnce({
        rows: [invalidThreshold],
        rowCount: 1
      });

      await expect(service.evaluateThresholds('brand-1', mockVisibilityMetrics))
        .rejects.toThrow('Unknown comparison operator: invalid');
    });

    it('should handle missing metric values gracefully', async () => {
      const { overall_score, ...incompleteMetrics } = mockVisibilityMetrics;
      const metricsWithoutScore = incompleteMetrics as VisibilityMetrics;
      
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlertThreshold],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', metricsWithoutScore);
      expect(results[0]!.current_value).toBe(0); // Default value for missing metric
    });
  });

  describe('alert message generation', () => {
    beforeEach(() => {
      // Mock getAlertThresholds
      mockQuery.mockResolvedValueOnce({
        rows: [mockAlertThreshold],
        rowCount: 1
      });

      // Mock shouldSuppressAlert check
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        rowCount: 1
      });
    });

    it('should generate appropriate alert titles', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...mockAlert, title: 'Low Alert: Overall Visibility Score Threshold Exceeded' }],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      
      expect(results[0]!.alert?.title).toContain('Alert: Overall Visibility Score Threshold Exceeded');
    });

    it('should generate detailed alert messages', async () => {
      const detailedAlert = {
        ...mockAlert,
        message: `Your brand's overall visibility score has fallen below the configured threshold.

Current Value: 65.00
Threshold: 70.00
Comparison: <

Additional Context:
- Overall Score: 65.00
- Ranking Position: 5
- Mention Frequency: 8
- Average Sentiment: 0.60
- Citation Count: 4`
      };

      mockQuery.mockResolvedValueOnce({
        rows: [detailedAlert],
        rowCount: 1
      });

      const results = await service.evaluateThresholds('brand-1', mockVisibilityMetrics);
      
      expect(results[0]!.alert?.message).toContain('overall visibility score');
      expect(results[0]!.alert?.message).toContain('Current Value: 65.00');
      expect(results[0]!.alert?.message).toContain('Threshold: 70.00');
    });
  });
});