import { BrandMonitoringService } from './BrandMonitoringService';
import { query } from '../config/database';
import { VisibilityMetrics } from '../types/database';

export interface ReportTimeRange {
  start_date: Date;
  end_date: Date;
  period: 'daily' | 'weekly' | 'monthly';
}

export interface PerformanceMetrics {
  overall_score: {
    current: number;
    previous: number;
    change: number;
    trend: 'up' | 'down' | 'stable';
  };
  mention_frequency: {
    current: number;
    previous: number;
    change: number;
    trend: 'up' | 'down' | 'stable';
  };
  sentiment_score: {
    current: number;
    previous: number;
    change: number;
    trend: 'up' | 'down' | 'stable';
  };
  ranking_position: {
    current: number;
    previous: number;
    change: number;
    trend: 'up' | 'down' | 'stable';
  };
}

export interface ChartDataPoint {
  date: string;
  overall_score: number;
  mention_frequency: number;
  sentiment_score: number;
  ranking_position: number;
}

export interface PerformanceReport {
  brand_id: string;
  brand_name: string;
  report_period: ReportTimeRange;
  summary_metrics: PerformanceMetrics;
  chart_data: ChartDataPoint[];
  insights: string[];
  recommendations: string[];
  generated_at: Date;
}

export interface ExportOptions {
  format: 'pdf' | 'csv' | 'json';
  include_charts: boolean;
  include_insights: boolean;
  date_range: ReportTimeRange;
}

export class PerformanceReportingService {
  private brandMonitoringService: BrandMonitoringService;

  constructor() {
    this.brandMonitoringService = new BrandMonitoringService();
  }

  /**
   * Generate comprehensive performance report for a brand
   */
  async generatePerformanceReport(
    brandId: string,
    timeRange: ReportTimeRange
  ): Promise<PerformanceReport> {
    // Get brand information
    const brandResult = await query('SELECT name FROM brands WHERE id = $1', [brandId]);
    if (brandResult.rows.length === 0) {
      throw new Error(`Brand with ID ${brandId} not found`);
    }
    const brandName = brandResult.rows[0].name;

    // Get visibility metrics for the specified time range
    const metrics = await this.getAggregatedMetrics(brandId, timeRange);
    
    // Calculate summary metrics with trends
    const summaryMetrics = await this.calculateSummaryMetrics(brandId, timeRange);
    
    // Prepare chart data
    const chartData = await this.prepareChartData(brandId, timeRange);
    
    // Generate insights and recommendations
    const insights = this.generateInsights(metrics, summaryMetrics);
    const recommendations = this.generateRecommendations(summaryMetrics);

    return {
      brand_id: brandId,
      brand_name: brandName,
      report_period: timeRange,
      summary_metrics: summaryMetrics,
      chart_data: chartData,
      insights,
      recommendations,
      generated_at: new Date()
    };
  }

  /**
   * Get aggregated metrics for different time periods
   */
  async getAggregatedMetrics(
    brandId: string,
    timeRange: ReportTimeRange
  ): Promise<VisibilityMetrics[]> {
    let groupByClause = '';
    let selectClause = '';

    switch (timeRange.period) {
      case 'daily':
        groupByClause = 'GROUP BY metric_date';
        selectClause = `
          metric_date as date,
          AVG(overall_score) as overall_score,
          AVG(mention_frequency) as mention_frequency,
          AVG(average_sentiment) as average_sentiment,
          AVG(ranking_position) as ranking_position,
          AVG(citation_count) as citation_count,
          AVG(source_quality_score) as source_quality_score
        `;
        break;
      case 'weekly':
        groupByClause = 'GROUP BY DATE_TRUNC(\'week\', metric_date)';
        selectClause = `
          DATE_TRUNC('week', metric_date) as date,
          AVG(overall_score) as overall_score,
          AVG(mention_frequency) as mention_frequency,
          AVG(average_sentiment) as average_sentiment,
          AVG(ranking_position) as ranking_position,
          AVG(citation_count) as citation_count,
          AVG(source_quality_score) as source_quality_score
        `;
        break;
      case 'monthly':
        groupByClause = 'GROUP BY DATE_TRUNC(\'month\', metric_date)';
        selectClause = `
          DATE_TRUNC('month', metric_date) as date,
          AVG(overall_score) as overall_score,
          AVG(mention_frequency) as mention_frequency,
          AVG(average_sentiment) as average_sentiment,
          AVG(ranking_position) as ranking_position,
          AVG(citation_count) as citation_count,
          AVG(source_quality_score) as source_quality_score
        `;
        break;
    }

    const result = await query(`
      SELECT ${selectClause}
      FROM visibility_metrics
      WHERE brand_id = $1 
        AND metric_date >= $2 
        AND metric_date <= $3
      ${groupByClause}
      ORDER BY date
    `, [brandId, timeRange.start_date, timeRange.end_date]);

    return result.rows as VisibilityMetrics[];
  }

  /**
   * Calculate summary metrics with trend analysis
   */
  async calculateSummaryMetrics(
    brandId: string,
    timeRange: ReportTimeRange
  ): Promise<PerformanceMetrics> {
    // Get current period metrics
    const currentMetrics = await this.getAggregatedMetrics(brandId, timeRange);
    
    // Get previous period metrics for comparison
    const periodDuration = timeRange.end_date.getTime() - timeRange.start_date.getTime();
    const previousTimeRange: ReportTimeRange = {
      start_date: new Date(timeRange.start_date.getTime() - periodDuration),
      end_date: new Date(timeRange.start_date.getTime()),
      period: timeRange.period
    };
    const previousMetrics = await this.getAggregatedMetrics(brandId, previousTimeRange);

    // Calculate averages
    const currentAvg = this.calculateAverages(currentMetrics);
    const previousAvg = this.calculateAverages(previousMetrics);

    return {
      overall_score: {
        current: currentAvg.overall_score,
        previous: previousAvg.overall_score,
        change: currentAvg.overall_score - previousAvg.overall_score,
        trend: this.determineTrend(currentAvg.overall_score, previousAvg.overall_score)
      },
      mention_frequency: {
        current: currentAvg.mention_frequency,
        previous: previousAvg.mention_frequency,
        change: currentAvg.mention_frequency - previousAvg.mention_frequency,
        trend: this.determineTrend(currentAvg.mention_frequency, previousAvg.mention_frequency)
      },
      sentiment_score: {
        current: currentAvg.average_sentiment,
        previous: previousAvg.average_sentiment,
        change: currentAvg.average_sentiment - previousAvg.average_sentiment,
        trend: this.determineTrend(currentAvg.average_sentiment, previousAvg.average_sentiment)
      },
      ranking_position: {
        current: currentAvg.ranking_position,
        previous: previousAvg.ranking_position,
        change: currentAvg.ranking_position - previousAvg.ranking_position,
        trend: this.determineTrend(previousAvg.ranking_position, currentAvg.ranking_position) // Inverted for ranking
      }
    };
  }

  /**
   * Prepare chart data for visualization
   */
  async prepareChartData(
    brandId: string,
    timeRange: ReportTimeRange
  ): Promise<ChartDataPoint[]> {
    const metrics = await this.getAggregatedMetrics(brandId, timeRange);
    
    return metrics.map(metric => {
      const metricDate = (metric as any).date || metric.metric_date;
      let dateStr: string;
      
      if (metricDate instanceof Date) {
        dateStr = metricDate.toISOString().split('T')[0] || '';
      } else if (metricDate) {
        dateStr = new Date(metricDate).toISOString().split('T')[0] || '';
      } else {
        dateStr = new Date().toISOString().split('T')[0] || '';
      }
      
      return {
        date: dateStr,
        overall_score: metric.overall_score || 0,
        mention_frequency: metric.mention_frequency || 0,
        sentiment_score: ((metric.average_sentiment || 0) + 1) * 50, // Convert -1,1 to 0,100
        ranking_position: metric.ranking_position || 0
      };
    });
  }

  /**
   * Generate insights based on performance data
   */
  private generateInsights(
    metrics: VisibilityMetrics[],
    summaryMetrics: PerformanceMetrics
  ): string[] {
    const insights: string[] = [];

    // Overall score insights
    if (summaryMetrics.overall_score.trend === 'up') {
      insights.push(`Overall visibility score improved by ${summaryMetrics.overall_score.change.toFixed(1)} points, indicating stronger brand presence.`);
    } else if (summaryMetrics.overall_score.trend === 'down') {
      insights.push(`Overall visibility score declined by ${Math.abs(summaryMetrics.overall_score.change).toFixed(1)} points, requiring attention.`);
    }

    // Mention frequency insights
    if (summaryMetrics.mention_frequency.change > 2) {
      insights.push(`Brand mentions increased significantly by ${summaryMetrics.mention_frequency.change.toFixed(1)}, showing growing awareness.`);
    } else if (summaryMetrics.mention_frequency.change < -2) {
      insights.push(`Brand mentions decreased by ${Math.abs(summaryMetrics.mention_frequency.change).toFixed(1)}, indicating reduced visibility.`);
    }

    // Sentiment insights
    if (summaryMetrics.sentiment_score.change > 0.1) {
      insights.push(`Sentiment improved by ${(summaryMetrics.sentiment_score.change * 100).toFixed(1)}%, reflecting positive brand perception.`);
    } else if (summaryMetrics.sentiment_score.change < -0.1) {
      insights.push(`Sentiment declined by ${Math.abs(summaryMetrics.sentiment_score.change * 100).toFixed(1)}%, requiring reputation management.`);
    }

    // Ranking insights
    if (summaryMetrics.ranking_position.change < -2) {
      insights.push(`Ranking position improved by ${Math.abs(summaryMetrics.ranking_position.change).toFixed(0)} positions, showing better search visibility.`);
    } else if (summaryMetrics.ranking_position.change > 2) {
      insights.push(`Ranking position dropped by ${summaryMetrics.ranking_position.change.toFixed(0)} positions, indicating decreased search prominence.`);
    }

    // Data quality insights
    if (metrics.length < 5) {
      insights.push('Limited data points available for this period. Consider increasing monitoring frequency for better insights.');
    }

    return insights;
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(summaryMetrics: PerformanceMetrics): string[] {
    const recommendations: string[] = [];

    // Overall score recommendations
    if (summaryMetrics.overall_score.current < 50) {
      recommendations.push('Focus on increasing brand mentions through content marketing and PR initiatives.');
    }

    // Mention frequency recommendations
    if (summaryMetrics.mention_frequency.trend === 'down') {
      recommendations.push('Implement a content strategy to increase brand visibility and mentions.');
      recommendations.push('Consider influencer partnerships to expand brand reach.');
    }

    // Sentiment recommendations
    if (summaryMetrics.sentiment_score.current < 0) {
      recommendations.push('Address negative sentiment through improved customer service and reputation management.');
      recommendations.push('Monitor social media and respond promptly to customer concerns.');
    }

    // Ranking recommendations
    if (summaryMetrics.ranking_position.current > 10) {
      recommendations.push('Optimize content for AI search engines to improve ranking position.');
      recommendations.push('Increase authoritative backlinks and citations to boost search prominence.');
    }

    // General recommendations
    if (summaryMetrics.overall_score.trend === 'stable') {
      recommendations.push('Maintain current strategies while exploring new opportunities for growth.');
    }

    return recommendations;
  }

  /**
   * Export report in different formats
   */
  async exportReport(
    report: PerformanceReport,
    options: ExportOptions
  ): Promise<{ data: string | Buffer; filename: string; contentType: string }> {
    switch (options.format) {
      case 'json':
        return {
          data: JSON.stringify(report, null, 2),
          filename: `brand-report-${report.brand_id}-${Date.now()}.json`,
          contentType: 'application/json'
        };
      
      case 'csv':
        return this.exportToCSV(report);
      
      case 'pdf':
        return this.exportToPDF(report, options);
      
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Export report to CSV format
   */
  private exportToCSV(report: PerformanceReport): { data: string; filename: string; contentType: string } {
    const headers = ['Date', 'Overall Score', 'Mention Frequency', 'Sentiment Score', 'Ranking Position'];
    const csvRows = [headers.join(',')];

    report.chart_data.forEach(dataPoint => {
      const row = [
        dataPoint.date,
        dataPoint.overall_score.toString(),
        dataPoint.mention_frequency.toString(),
        dataPoint.sentiment_score.toString(),
        dataPoint.ranking_position.toString()
      ];
      csvRows.push(row.join(','));
    });

    // Add summary section
    csvRows.push('');
    csvRows.push('Summary Metrics');
    csvRows.push(`Overall Score,${report.summary_metrics.overall_score.current},${report.summary_metrics.overall_score.change > 0 ? '+' : ''}${report.summary_metrics.overall_score.change.toFixed(2)}`);
    csvRows.push(`Mention Frequency,${report.summary_metrics.mention_frequency.current},${report.summary_metrics.mention_frequency.change > 0 ? '+' : ''}${report.summary_metrics.mention_frequency.change.toFixed(2)}`);
    csvRows.push(`Sentiment Score,${report.summary_metrics.sentiment_score.current},${report.summary_metrics.sentiment_score.change > 0 ? '+' : ''}${report.summary_metrics.sentiment_score.change.toFixed(2)}`);
    csvRows.push(`Ranking Position,${report.summary_metrics.ranking_position.current},${report.summary_metrics.ranking_position.change > 0 ? '+' : ''}${report.summary_metrics.ranking_position.change.toFixed(2)}`);

    return {
      data: csvRows.join('\n'),
      filename: `brand-report-${report.brand_id}-${Date.now()}.csv`,
      contentType: 'text/csv'
    };
  }

  /**
   * Export report to PDF format (simplified implementation)
   */
  private exportToPDF(
    report: PerformanceReport,
    options: ExportOptions
  ): { data: string; filename: string; contentType: string } {
    // This is a simplified PDF export - in production you'd use a proper PDF library
    const pdfContent = `
BRAND PERFORMANCE REPORT
========================

Brand: ${report.brand_name}
Period: ${report.report_period.start_date.toDateString()} - ${report.report_period.end_date.toDateString()}
Generated: ${report.generated_at.toDateString()}

SUMMARY METRICS
===============
Overall Score: ${report.summary_metrics.overall_score.current.toFixed(2)} (${report.summary_metrics.overall_score.change > 0 ? '+' : ''}${report.summary_metrics.overall_score.change.toFixed(2)})
Mention Frequency: ${report.summary_metrics.mention_frequency.current.toFixed(2)} (${report.summary_metrics.mention_frequency.change > 0 ? '+' : ''}${report.summary_metrics.mention_frequency.change.toFixed(2)})
Sentiment Score: ${report.summary_metrics.sentiment_score.current.toFixed(2)} (${report.summary_metrics.sentiment_score.change > 0 ? '+' : ''}${report.summary_metrics.sentiment_score.change.toFixed(2)})
Ranking Position: ${report.summary_metrics.ranking_position.current.toFixed(0)} (${report.summary_metrics.ranking_position.change > 0 ? '+' : ''}${report.summary_metrics.ranking_position.change.toFixed(0)})

${options.include_insights ? `
INSIGHTS
========
${report.insights.map(insight => `• ${insight}`).join('\n')}

RECOMMENDATIONS
===============
${report.recommendations.map(rec => `• ${rec}`).join('\n')}
` : ''}

DATA POINTS
===========
${report.chart_data.map(point => 
  `${point.date}: Score=${point.overall_score.toFixed(2)}, Mentions=${point.mention_frequency.toFixed(2)}, Sentiment=${point.sentiment_score.toFixed(2)}, Ranking=${point.ranking_position.toFixed(0)}`
).join('\n')}
    `;

    return {
      data: pdfContent,
      filename: `brand-report-${report.brand_id}-${Date.now()}.txt`, // Simplified as text
      contentType: 'text/plain'
    };
  }

  /**
   * Helper method to calculate averages from metrics array
   */
  private calculateAverages(metrics: VisibilityMetrics[]): {
    overall_score: number;
    mention_frequency: number;
    average_sentiment: number;
    ranking_position: number;
  } {
    if (metrics.length === 0) {
      return {
        overall_score: 0,
        mention_frequency: 0,
        average_sentiment: 0,
        ranking_position: 0
      };
    }

    const totals = metrics.reduce((acc, metric) => ({
      overall_score: acc.overall_score + (metric.overall_score || 0),
      mention_frequency: acc.mention_frequency + (metric.mention_frequency || 0),
      average_sentiment: acc.average_sentiment + (metric.average_sentiment || 0),
      ranking_position: acc.ranking_position + (metric.ranking_position || 0)
    }), {
      overall_score: 0,
      mention_frequency: 0,
      average_sentiment: 0,
      ranking_position: 0
    });

    return {
      overall_score: totals.overall_score / metrics.length,
      mention_frequency: totals.mention_frequency / metrics.length,
      average_sentiment: totals.average_sentiment / metrics.length,
      ranking_position: totals.ranking_position / metrics.length
    };
  }

  /**
   * Helper method to determine trend direction
   */
  private determineTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    const threshold = 0.05; // 5% threshold for stability
    const change = Math.abs(current - previous);
    const percentChange = previous !== 0 ? change / Math.abs(previous) : 0;

    if (percentChange < threshold) return 'stable';
    return current > previous ? 'up' : 'down';
  }
}