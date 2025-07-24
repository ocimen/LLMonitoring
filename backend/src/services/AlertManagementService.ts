import { query } from '../config/database';
import { Alert, AlertThreshold, VisibilityMetrics } from '../types/database';
import Queue from 'bull';
import Redis from 'ioredis';

export interface AlertConfig {
  brand_id: string;
  user_id: string;
  metric_type: string;
  threshold_value: number;
  comparison_operator: '>' | '<' | '>=' | '<=' | '=';
  notification_channels: string[];
}

export interface AlertEvaluationResult {
  triggered: boolean;
  alert?: Alert | undefined;
  threshold: AlertThreshold;
  current_value: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface NotificationChannel {
  type: 'email' | 'sms' | 'webhook' | 'in_app';
  config: Record<string, any>;
}

export interface AlertPreferences {
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  webhook_enabled: boolean;
  in_app_enabled: boolean;
  quiet_hours_start?: string; // HH:MM format
  quiet_hours_end?: string; // HH:MM format
  frequency_limit?: number; // Max alerts per hour
}

export class AlertManagementService {
  private alertQueue: Queue.Queue;
  private redis: Redis;

  constructor() {
    // Initialize Redis connection for Bull Queue
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });

    // Initialize Bull Queue for alert processing
    this.alertQueue = new Queue('alert processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.setupQueueProcessors();
  }

  /**
   * Create a new alert threshold configuration
   */
  async createAlertThreshold(config: AlertConfig): Promise<AlertThreshold> {
    try {
      const result = await query(
        `INSERT INTO alert_thresholds 
         (brand_id, user_id, metric_type, threshold_value, comparison_operator, notification_channels)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          config.brand_id,
          config.user_id,
          config.metric_type,
          config.threshold_value,
          config.comparison_operator,
          config.notification_channels,
        ]
      );

      return result.rows[0] as AlertThreshold;
    } catch (error) {
      console.error('Failed to create alert threshold:', error);
      throw error;
    }
  }

  /**
   * Update an existing alert threshold
   */
  async updateAlertThreshold(
    thresholdId: string,
    updates: Partial<AlertConfig>
  ): Promise<AlertThreshold> {
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.metric_type !== undefined) {
        setParts.push(`metric_type = $${paramIndex++}`);
        values.push(updates.metric_type);
      }
      if (updates.threshold_value !== undefined) {
        setParts.push(`threshold_value = $${paramIndex++}`);
        values.push(updates.threshold_value);
      }
      if (updates.comparison_operator !== undefined) {
        setParts.push(`comparison_operator = $${paramIndex++}`);
        values.push(updates.comparison_operator);
      }
      if (updates.notification_channels !== undefined) {
        setParts.push(`notification_channels = $${paramIndex++}`);
        values.push(updates.notification_channels);
      }

      setParts.push(`updated_at = NOW()`);
      values.push(thresholdId);

      const result = await query(
        `UPDATE alert_thresholds 
         SET ${setParts.join(', ')}
         WHERE id = $${paramIndex} AND is_active = true
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error(`Alert threshold with ID ${thresholdId} not found or inactive`);
      }

      return result.rows[0] as AlertThreshold;
    } catch (error) {
      console.error(`Failed to update alert threshold ${thresholdId}:`, error);
      throw error;
    }
  }

  /**
   * Delete (deactivate) an alert threshold
   */
  async deleteAlertThreshold(thresholdId: string): Promise<void> {
    try {
      const result = await query(
        'UPDATE alert_thresholds SET is_active = false, updated_at = NOW() WHERE id = $1',
        [thresholdId]
      );

      if (result.rowCount === 0) {
        throw new Error(`Alert threshold with ID ${thresholdId} not found`);
      }
    } catch (error) {
      console.error(`Failed to delete alert threshold ${thresholdId}:`, error);
      throw error;
    }
  }

  /**
   * Get all alert thresholds for a brand
   */
  async getAlertThresholds(brandId: string): Promise<AlertThreshold[]> {
    try {
      const result = await query(
        'SELECT * FROM alert_thresholds WHERE brand_id = $1 AND is_active = true ORDER BY created_at DESC',
        [brandId]
      );

      return result.rows as AlertThreshold[];
    } catch (error) {
      console.error(`Failed to get alert thresholds for brand ${brandId}:`, error);
      throw error;
    }
  }

  /**
   * Evaluate all thresholds for a brand against current metrics
   */
  async evaluateThresholds(
    brandId: string,
    metrics: VisibilityMetrics
  ): Promise<AlertEvaluationResult[]> {
    try {
      const thresholds = await this.getAlertThresholds(brandId);
      const results: AlertEvaluationResult[] = [];

      for (const threshold of thresholds) {
        const result = await this.evaluateThreshold(threshold, metrics);
        results.push(result);

        // If alert is triggered, queue it for processing
        if (result.triggered && result.alert) {
          await this.queueAlert(result.alert);
        }
      }

      return results;
    } catch (error) {
      console.error(`Failed to evaluate thresholds for brand ${brandId}:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a single threshold against metrics
   */
  private async evaluateThreshold(
    threshold: AlertThreshold,
    metrics: VisibilityMetrics
  ): Promise<AlertEvaluationResult> {
    try {
      const currentValue = this.extractMetricValue(threshold.metric_type, metrics);
      const triggered = this.compareValues(
        currentValue,
        threshold.threshold_value,
        threshold.comparison_operator
      );

      let alert: Alert | undefined;
      if (triggered) {
        // Check if we should suppress duplicate alerts
        const shouldSuppress = await this.shouldSuppressAlert(threshold, currentValue);
        
        if (!shouldSuppress) {
          alert = await this.createAlert(threshold, currentValue, metrics);
        }
      }

      const severity = this.calculateSeverity(
        threshold.metric_type,
        currentValue,
        threshold.threshold_value,
        threshold.comparison_operator
      );

      return {
        triggered,
        alert,
        threshold,
        current_value: currentValue,
        severity,
      };
    } catch (error) {
      console.error('Failed to evaluate threshold:', error);
      throw error;
    }
  }

  /**
   * Extract metric value based on metric type
   */
  private extractMetricValue(metricType: string, metrics: VisibilityMetrics): number {
    switch (metricType) {
      case 'overall_score':
        return metrics.overall_score || 0;
      case 'ranking_position':
        return metrics.ranking_position || 0;
      case 'mention_frequency':
        return metrics.mention_frequency || 0;
      case 'average_sentiment':
        return metrics.average_sentiment || 0;
      case 'citation_count':
        return metrics.citation_count || 0;
      case 'source_quality_score':
        return metrics.source_quality_score || 0;
      default:
        throw new Error(`Unknown metric type: ${metricType}`);
    }
  }

  /**
   * Compare values based on operator
   */
  private compareValues(
    currentValue: number,
    thresholdValue: number,
    operator: string
  ): boolean {
    switch (operator) {
      case '>':
        return currentValue > thresholdValue;
      case '<':
        return currentValue < thresholdValue;
      case '>=':
        return currentValue >= thresholdValue;
      case '<=':
        return currentValue <= thresholdValue;
      case '=':
        return Math.abs(currentValue - thresholdValue) < 0.01; // Handle floating point comparison
      default:
        throw new Error(`Unknown comparison operator: ${operator}`);
    }
  }

  /**
   * Calculate alert severity based on how far the value is from threshold
   */
  private calculateSeverity(
    metricType: string,
    currentValue: number,
    thresholdValue: number,
    operator: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    const difference = Math.abs(currentValue - thresholdValue);
    const percentageDiff = thresholdValue !== 0 ? (difference / Math.abs(thresholdValue)) * 100 : 100;

    // Define severity thresholds based on metric type
    const severityThresholds = this.getSeverityThresholds(metricType);

    if (percentageDiff >= severityThresholds.critical) {
      return 'critical';
    } else if (percentageDiff >= severityThresholds.high) {
      return 'high';
    } else if (percentageDiff >= severityThresholds.medium) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get severity thresholds for different metric types
   */
  private getSeverityThresholds(metricType: string): {
    medium: number;
    high: number;
    critical: number;
  } {
    const defaultThresholds = { medium: 10, high: 25, critical: 50 };

    const metricThresholds: Record<string, typeof defaultThresholds> = {
      overall_score: { medium: 5, high: 15, critical: 30 },
      ranking_position: { medium: 20, high: 50, critical: 100 },
      mention_frequency: { medium: 15, high: 35, critical: 60 },
      average_sentiment: { medium: 10, high: 25, critical: 50 },
      citation_count: { medium: 20, high: 40, critical: 70 },
      source_quality_score: { medium: 10, high: 20, critical: 40 },
    };

    return metricThresholds[metricType] || defaultThresholds;
  }

  /**
   * Check if alert should be suppressed to avoid spam
   */
  private async shouldSuppressAlert(
    threshold: AlertThreshold,
    currentValue: number
  ): Promise<boolean> {
    try {
      // Check for recent similar alerts (within last hour)
      const result = await query(
        `SELECT COUNT(*) as count FROM alerts 
         WHERE brand_id = $1 
           AND metric_type = $2 
           AND ABS(current_value - $3) < $4
           AND created_at > NOW() - INTERVAL '1 hour'
           AND resolved_at IS NULL`,
        [
          threshold.brand_id,
          threshold.metric_type,
          currentValue,
          Math.abs(threshold.threshold_value * 0.05), // 5% tolerance
        ]
      );

      const recentAlertCount = parseInt(result.rows[0].count);
      return recentAlertCount > 0;
    } catch (error) {
      console.error('Failed to check alert suppression:', error);
      return false; // Don't suppress on error
    }
  }

  /**
   * Create a new alert record
   */
  private async createAlert(
    threshold: AlertThreshold,
    currentValue: number,
    metrics: VisibilityMetrics
  ): Promise<Alert> {
    try {
      const severity = this.calculateSeverity(
        threshold.metric_type,
        currentValue,
        threshold.threshold_value,
        threshold.comparison_operator
      );

      const title = this.generateAlertTitle(threshold.metric_type, severity, currentValue, threshold.threshold_value);
      const message = this.generateAlertMessage(threshold, currentValue, metrics);

      const result = await query(
        `INSERT INTO alerts 
         (brand_id, alert_threshold_id, severity, title, message, metric_type, current_value, threshold_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          threshold.brand_id,
          threshold.id,
          severity,
          title,
          message,
          threshold.metric_type,
          currentValue,
          threshold.threshold_value,
        ]
      );

      return result.rows[0] as Alert;
    } catch (error) {
      console.error('Failed to create alert:', error);
      throw error;
    }
  }

  /**
   * Generate alert title based on metric and severity
   */
  private generateAlertTitle(
    metricType: string,
    severity: string,
    currentValue: number,
    thresholdValue: number
  ): string {
    const metricNames: Record<string, string> = {
      overall_score: 'Overall Visibility Score',
      ranking_position: 'Ranking Position',
      mention_frequency: 'Mention Frequency',
      average_sentiment: 'Average Sentiment',
      citation_count: 'Citation Count',
      source_quality_score: 'Source Quality Score',
    };

    const metricName = metricNames[metricType] || metricType;
    const severityLabel = severity.charAt(0).toUpperCase() + severity.slice(1);

    return `${severityLabel} Alert: ${metricName} Threshold Exceeded`;
  }

  /**
   * Generate detailed alert message
   */
  private generateAlertMessage(
    threshold: AlertThreshold,
    currentValue: number,
    metrics: VisibilityMetrics
  ): string {
    const metricNames: Record<string, string> = {
      overall_score: 'overall visibility score',
      ranking_position: 'ranking position',
      mention_frequency: 'mention frequency',
      average_sentiment: 'average sentiment',
      citation_count: 'citation count',
      source_quality_score: 'source quality score',
    };

    const metricName = metricNames[threshold.metric_type] || threshold.metric_type;
    const operatorText = this.getOperatorText(threshold.comparison_operator);

    let message = `Your brand's ${metricName} has ${operatorText} the configured threshold.\n\n`;
    message += `Current Value: ${currentValue.toFixed(2)}\n`;
    message += `Threshold: ${threshold.threshold_value.toFixed(2)}\n`;
    message += `Comparison: ${threshold.comparison_operator}\n\n`;

    // Add context from metrics
    message += `Additional Context:\n`;
    message += `- Overall Score: ${metrics.overall_score?.toFixed(2) || 'N/A'}\n`;
    message += `- Ranking Position: ${metrics.ranking_position || 'N/A'}\n`;
    message += `- Mention Frequency: ${metrics.mention_frequency || 0}\n`;
    message += `- Average Sentiment: ${metrics.average_sentiment?.toFixed(2) || 'N/A'}\n`;
    message += `- Citation Count: ${metrics.citation_count || 0}\n`;

    return message;
  }

  /**
   * Get human-readable operator text
   */
  private getOperatorText(operator: string): string {
    const operatorTexts: Record<string, string> = {
      '>': 'exceeded',
      '<': 'fallen below',
      '>=': 'reached or exceeded',
      '<=': 'reached or fallen below',
      '=': 'matched',
    };

    return operatorTexts[operator] || 'changed relative to';
  }

  /**
   * Queue alert for processing
   */
  private async queueAlert(alert: Alert): Promise<void> {
    try {
      await this.alertQueue.add('process-alert', {
        alertId: alert.id,
        brandId: alert.brand_id,
        severity: alert.severity,
      }, {
        priority: this.getJobPriority(alert.severity),
        delay: 0,
      });
    } catch (error) {
      console.error('Failed to queue alert:', error);
      throw error;
    }
  }

  /**
   * Get job priority based on alert severity
   */
  private getJobPriority(severity: string): number {
    const priorities: Record<string, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };

    return priorities[severity] || 5;
  }

  /**
   * Setup queue processors
   */
  private setupQueueProcessors(): void {
    this.alertQueue.process('process-alert', async (job) => {
      const { alertId, brandId, severity } = job.data;
      
      try {
        await this.processAlert(alertId, brandId, severity);
        console.log(`Successfully processed alert ${alertId}`);
      } catch (error) {
        console.error(`Failed to process alert ${alertId}:`, error);
        throw error;
      }
    });

    // Handle job completion
    this.alertQueue.on('completed', (job) => {
      console.log(`Alert processing job ${job.id} completed`);
    });

    // Handle job failures
    this.alertQueue.on('failed', (job, error) => {
      console.error(`Alert processing job ${job.id} failed:`, error);
    });
  }

  /**
   * Process an alert (placeholder for notification sending)
   */
  private async processAlert(alertId: string, brandId: string, severity: string): Promise<void> {
    try {
      // Get alert details
      const alertResult = await query('SELECT * FROM alerts WHERE id = $1', [alertId]);
      if (alertResult.rows.length === 0) {
        throw new Error(`Alert ${alertId} not found`);
      }

      const alert = alertResult.rows[0] as Alert;

      // Get threshold details for notification channels
      if (alert.alert_threshold_id) {
        const thresholdResult = await query(
          'SELECT * FROM alert_thresholds WHERE id = $1',
          [alert.alert_threshold_id]
        );

        if (thresholdResult.rows.length > 0) {
          const threshold = thresholdResult.rows[0] as AlertThreshold;
          
          // Process each notification channel
          for (const channel of threshold.notification_channels) {
            await this.sendNotification(alert, channel);
          }
        }
      }

      console.log(`Alert ${alertId} processed successfully`);
    } catch (error) {
      console.error(`Failed to process alert ${alertId}:`, error);
      throw error;
    }
  }

  /**
   * Send notification through specified channel (placeholder implementation)
   */
  private async sendNotification(alert: Alert, channel: string): Promise<void> {
    try {
      console.log(`Sending ${channel} notification for alert ${alert.id}`);
      
      // TODO: Implement actual notification sending
      // This would integrate with email services, SMS providers, webhooks, etc.
      
      switch (channel) {
        case 'email':
          // await this.sendEmailNotification(alert);
          break;
        case 'sms':
          // await this.sendSMSNotification(alert);
          break;
        case 'webhook':
          // await this.sendWebhookNotification(alert);
          break;
        case 'in_app':
          // await this.sendInAppNotification(alert);
          break;
        default:
          console.warn(`Unknown notification channel: ${channel}`);
      }
    } catch (error) {
      console.error(`Failed to send ${channel} notification for alert ${alert.id}:`, error);
      throw error;
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<Alert> {
    try {
      const result = await query(
        `UPDATE alerts 
         SET is_acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [userId, alertId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Alert with ID ${alertId} not found`);
      }

      return result.rows[0] as Alert;
    } catch (error) {
      console.error(`Failed to acknowledge alert ${alertId}:`, error);
      throw error;
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<Alert> {
    try {
      const result = await query(
        `UPDATE alerts 
         SET resolved_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [alertId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Alert with ID ${alertId} not found`);
      }

      return result.rows[0] as Alert;
    } catch (error) {
      console.error(`Failed to resolve alert ${alertId}:`, error);
      throw error;
    }
  }

  /**
   * Get alerts for a brand with optional filters
   */
  async getAlerts(
    brandId: string,
    options: {
      severity?: string;
      acknowledged?: boolean;
      resolved?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Alert[]> {
    try {
      let whereClause = 'WHERE brand_id = $1';
      const values: any[] = [brandId];
      let paramIndex = 2;

      if (options.severity) {
        whereClause += ` AND severity = $${paramIndex++}`;
        values.push(options.severity);
      }

      if (options.acknowledged !== undefined) {
        whereClause += ` AND is_acknowledged = $${paramIndex++}`;
        values.push(options.acknowledged);
      }

      if (options.resolved !== undefined) {
        if (options.resolved) {
          whereClause += ` AND resolved_at IS NOT NULL`;
        } else {
          whereClause += ` AND resolved_at IS NULL`;
        }
      }

      let limitClause = '';
      if (options.limit) {
        limitClause += ` LIMIT $${paramIndex++}`;
        values.push(options.limit);
      }

      if (options.offset) {
        limitClause += ` OFFSET $${paramIndex++}`;
        values.push(options.offset);
      }

      const result = await query(
        `SELECT * FROM alerts 
         ${whereClause}
         ORDER BY created_at DESC
         ${limitClause}`,
        values
      );

      return result.rows as Alert[];
    } catch (error) {
      console.error(`Failed to get alerts for brand ${brandId}:`, error);
      throw error;
    }
  }

  /**
   * Get alert statistics for a brand
   */
  async getAlertStatistics(brandId: string): Promise<{
    total: number;
    by_severity: Record<string, number>;
    acknowledged: number;
    resolved: number;
    active: number;
  }> {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total,
           COUNT(CASE WHEN severity = 'low' THEN 1 END) as low,
           COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium,
           COUNT(CASE WHEN severity = 'high' THEN 1 END) as high,
           COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical,
           COUNT(CASE WHEN is_acknowledged = true THEN 1 END) as acknowledged,
           COUNT(CASE WHEN resolved_at IS NOT NULL THEN 1 END) as resolved,
           COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) as active
         FROM alerts 
         WHERE brand_id = $1`,
        [brandId]
      );

      const stats = result.rows[0];
      return {
        total: parseInt(stats.total),
        by_severity: {
          low: parseInt(stats.low),
          medium: parseInt(stats.medium),
          high: parseInt(stats.high),
          critical: parseInt(stats.critical),
        },
        acknowledged: parseInt(stats.acknowledged),
        resolved: parseInt(stats.resolved),
        active: parseInt(stats.active),
      };
    } catch (error) {
      console.error(`Failed to get alert statistics for brand ${brandId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old resolved alerts
   */
  async cleanupOldAlerts(daysOld: number = 30): Promise<number> {
    try {
      const result = await query(
        `DELETE FROM alerts 
         WHERE resolved_at IS NOT NULL 
           AND resolved_at < NOW() - INTERVAL '${daysOld} days'`
      );

      return result.rowCount || 0;
    } catch (error) {
      console.error('Failed to cleanup old alerts:', error);
      throw error;
    }
  }

  /**
   * Close queue connections
   */
  async close(): Promise<void> {
    await this.alertQueue.close();
    this.redis.disconnect();
  }
}