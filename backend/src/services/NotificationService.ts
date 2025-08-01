import { query } from '../config/database';
import { Alert, User } from '../types/database';
import nodemailer from 'nodemailer';
import { Server as SocketIOServer } from 'socket.io';
import axios from 'axios';

export interface NotificationTemplate {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'webhook' | 'in_app';
  subject?: string;
  body: string;
  variables: string[];
  created_at: Date;
  updated_at: Date;
}

export interface NotificationPreferences {
  user_id: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  webhook_enabled: boolean;
  in_app_enabled: boolean;
  quiet_hours_start?: string; // HH:MM format
  quiet_hours_end?: string; // HH:MM format
  frequency_limit?: number; // Max notifications per hour
  email_address?: string;
  phone_number?: string;
  webhook_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationDelivery {
  id: string;
  alert_id: string;
  user_id: string;
  channel: 'email' | 'sms' | 'webhook' | 'in_app';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  recipient: string;
  subject?: string;
  content: string;
  error_message?: string;
  sent_at?: Date;
  delivered_at?: Date;
  created_at: Date;
}

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface SMSConfig {
  provider: 'twilio' | 'aws_sns';
  apiKey: string;
  apiSecret: string;
  fromNumber?: string | undefined;
}

export interface WebhookConfig {
  timeout: number;
  retries: number;
  headers?: Record<string, string>;
}

export class NotificationService {
  private emailTransporter: nodemailer.Transporter | null = null;
  private socketIO: SocketIOServer | null = null;
  private smsConfig: SMSConfig | null = null;
  private webhookConfig: WebhookConfig;

  constructor(socketIO?: SocketIOServer) {
    this.socketIO = socketIO || null;
    this.webhookConfig = {
      timeout: 10000,
      retries: 3,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Brand-Monitor/1.0'
      }
    };
    this.initializeEmailTransporter();
    this.initializeSMSConfig();
  }

  /**
   * Initialize email transporter
   */
  private initializeEmailTransporter(): void {
    try {
      const emailConfig: EmailConfig = {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        }
      };

      // Always create transporter for testing
      this.emailTransporter = nodemailer.createTransport(emailConfig);
    } catch (error) {
      console.error('Failed to initialize email transporter:', error);
    }
  }

  /**
   * Initialize SMS configuration
   */
  private initializeSMSConfig(): void {
    try {
      if (process.env.SMS_PROVIDER && process.env.SMS_API_KEY) {
        this.smsConfig = {
          provider: process.env.SMS_PROVIDER as 'twilio' | 'aws_sns',
          apiKey: process.env.SMS_API_KEY,
          apiSecret: process.env.SMS_API_SECRET || '',
          ...(process.env.SMS_FROM_NUMBER && { fromNumber: process.env.SMS_FROM_NUMBER })
        };
      }
    } catch (error) {
      console.error('Failed to initialize SMS configuration:', error);
    }
  }

  /**
   * Send notification through specified channel
   */
  async sendNotification(
    alert: Alert,
    channel: 'email' | 'sms' | 'webhook' | 'in_app',
    recipient: string,
    preferences?: NotificationPreferences
  ): Promise<NotificationDelivery> {
    try {
      // Check if notifications are allowed based on preferences
      if (preferences && !this.isNotificationAllowed(channel, preferences)) {
        throw new Error(`Notifications disabled for channel: ${channel}`);
      }

      // Check quiet hours
      if (preferences && this.isInQuietHours(preferences)) {
        throw new Error('Notification blocked due to quiet hours');
      }

      // Check frequency limits
      if (preferences && await this.isFrequencyLimitExceeded(preferences.user_id)) {
        throw new Error('Notification frequency limit exceeded');
      }

      let delivery: NotificationDelivery;

      switch (channel) {
        case 'email':
          delivery = await this.sendEmailNotification(alert, recipient);
          break;
        case 'sms':
          delivery = await this.sendSMSNotification(alert, recipient);
          break;
        case 'webhook':
          delivery = await this.sendWebhookNotification(alert, recipient);
          break;
        case 'in_app':
          delivery = await this.sendInAppNotification(alert, recipient);
          break;
        default:
          throw new Error(`Unsupported notification channel: ${channel}`);
      }

      return delivery;
    } catch (error) {
      console.error(`Failed to send ${channel} notification:`, error);
      
      // Create failed delivery record
      return await this.createDeliveryRecord({
        alert_id: alert.id,
        user_id: recipient,
        channel,
        status: 'failed',
        recipient,
        content: alert.message,
        error_message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    alert: Alert,
    recipient: string
  ): Promise<NotificationDelivery> {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not configured');
    }

    try {
      // Get user email address
      const userResult = await query('SELECT email FROM users WHERE id = $1', [recipient]);
      if (userResult.rows.length === 0) {
        throw new Error(`User ${recipient} not found`);
      }

      const userEmail = userResult.rows[0].email;
      const template = await this.getEmailTemplate(alert.severity);
      const emailContent = this.renderTemplate(template, alert);

      const mailOptions = {
        from: process.env.SMTP_FROM || 'noreply@brandmonitor.com',
        to: userEmail,
        subject: template.subject || alert.title,
        html: emailContent,
        text: alert.message
      };

      const info = await this.emailTransporter.sendMail(mailOptions);

      return await this.createDeliveryRecord({
        alert_id: alert.id,
        user_id: recipient,
        channel: 'email',
        status: 'sent',
        recipient: userEmail,
        subject: mailOptions.subject,
        content: emailContent,
        sent_at: new Date()
      });
    } catch (error) {
      throw new Error(`Email sending failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(
    alert: Alert,
    recipient: string
  ): Promise<NotificationDelivery> {
    if (!this.smsConfig) {
      throw new Error('SMS configuration not available');
    }

    try {
      // Get user phone number from preferences
      const prefsResult = await query(
        'SELECT phone_number FROM notification_preferences WHERE user_id = $1',
        [recipient]
      );

      if (prefsResult.rows.length === 0 || !prefsResult.rows[0].phone_number) {
        throw new Error(`Phone number not found for user ${recipient}`);
      }

      const phoneNumber = prefsResult.rows[0].phone_number;
      const smsContent = this.formatSMSContent(alert);

      let success = false;
      let errorMessage = '';

      if (this.smsConfig.provider === 'twilio') {
        success = await this.sendTwilioSMS(phoneNumber, smsContent);
      } else if (this.smsConfig.provider === 'aws_sns') {
        success = await this.sendAWSSNSSMS(phoneNumber, smsContent);
      }

      if (!success) {
        throw new Error(errorMessage || 'SMS sending failed');
      }

      return await this.createDeliveryRecord({
        alert_id: alert.id,
        user_id: recipient,
        channel: 'sms',
        status: 'sent',
        recipient: phoneNumber,
        content: smsContent,
        sent_at: new Date()
      });
    } catch (error) {
      throw new Error(`SMS sending failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    alert: Alert,
    recipient: string
  ): Promise<NotificationDelivery> {
    try {
      // Get webhook URL from preferences
      const prefsResult = await query(
        'SELECT webhook_url FROM notification_preferences WHERE user_id = $1',
        [recipient]
      );

      if (prefsResult.rows.length === 0 || !prefsResult.rows[0].webhook_url) {
        throw new Error(`Webhook URL not found for user ${recipient}`);
      }

      const webhookUrl = prefsResult.rows[0].webhook_url;
      const payload = this.formatWebhookPayload(alert);

      const response = await axios.post(webhookUrl, payload, {
        timeout: this.webhookConfig.timeout,
        headers: this.webhookConfig.headers || {},
        validateStatus: (status) => status >= 200 && status < 300
      });

      return await this.createDeliveryRecord({
        alert_id: alert.id,
        user_id: recipient,
        channel: 'webhook',
        status: 'delivered',
        recipient: webhookUrl,
        content: JSON.stringify(payload),
        delivered_at: new Date()
      });
    } catch (error) {
      throw new Error(`Webhook sending failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send in-app notification
   */
  private async sendInAppNotification(
    alert: Alert,
    recipient: string
  ): Promise<NotificationDelivery> {
    try {
      const notification = {
        id: `notif-${Date.now()}`,
        alert_id: alert.id,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        timestamp: new Date(),
        read: false
      };

      // Store in-app notification in database
      await query(
        `INSERT INTO in_app_notifications 
         (id, user_id, alert_id, title, message, severity, is_read)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          notification.id,
          recipient,
          alert.id,
          alert.title,
          alert.message,
          alert.severity,
          false
        ]
      );

      // Send real-time notification via Socket.IO
      if (this.socketIO) {
        this.socketIO.to(`user-${recipient}`).emit('notification', notification);
      }

      return await this.createDeliveryRecord({
        alert_id: alert.id,
        user_id: recipient,
        channel: 'in_app',
        status: 'delivered',
        recipient: recipient,
        content: JSON.stringify(notification),
        delivered_at: new Date()
      });
    } catch (error) {
      throw new Error(`In-app notification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get or create notification preferences for a user
   */
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const result = await query(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length > 0) {
        return result.rows[0] as NotificationPreferences;
      }

      // Create default preferences
      const defaultPrefs = {
        user_id: userId,
        email_enabled: true,
        sms_enabled: false,
        webhook_enabled: false,
        in_app_enabled: true,
        frequency_limit: 10 // 10 notifications per hour
      };

      const createResult = await query(
        `INSERT INTO notification_preferences 
         (user_id, email_enabled, sms_enabled, webhook_enabled, in_app_enabled, frequency_limit)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          defaultPrefs.user_id,
          defaultPrefs.email_enabled,
          defaultPrefs.sms_enabled,
          defaultPrefs.webhook_enabled,
          defaultPrefs.in_app_enabled,
          defaultPrefs.frequency_limit
        ]
      );

      return createResult.rows[0] as NotificationPreferences;
    } catch (error) {
      console.error(`Failed to get notification preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    try {
      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      const updateableFields = [
        'email_enabled',
        'sms_enabled', 
        'webhook_enabled',
        'in_app_enabled',
        'quiet_hours_start',
        'quiet_hours_end',
        'frequency_limit',
        'email_address',
        'phone_number',
        'webhook_url'
      ];

      for (const field of updateableFields) {
        if (preferences[field as keyof NotificationPreferences] !== undefined) {
          setParts.push(`${field} = $${paramIndex++}`);
          values.push(preferences[field as keyof NotificationPreferences]);
        }
      }

      if (setParts.length === 0) {
        throw new Error('No valid fields to update');
      }

      setParts.push(`updated_at = NOW()`);
      values.push(userId);

      const result = await query(
        `UPDATE notification_preferences 
         SET ${setParts.join(', ')}
         WHERE user_id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error(`Notification preferences not found for user ${userId}`);
      }

      return result.rows[0] as NotificationPreferences;
    } catch (error) {
      console.error(`Failed to update notification preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get notification delivery history
   */
  async getDeliveryHistory(
    userId?: string,
    alertId?: string,
    channel?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<NotificationDelivery[]> {
    try {
      let whereClause = 'WHERE 1=1';
      const values: any[] = [];
      let paramIndex = 1;

      if (userId) {
        whereClause += ` AND user_id = $${paramIndex++}`;
        values.push(userId);
      }

      if (alertId) {
        whereClause += ` AND alert_id = $${paramIndex++}`;
        values.push(alertId);
      }

      if (channel) {
        whereClause += ` AND channel = $${paramIndex++}`;
        values.push(channel);
      }

      whereClause += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      values.push(limit, offset);

      const result = await query(
        `SELECT * FROM notification_deliveries ${whereClause}`,
        values
      );

      return result.rows as NotificationDelivery[];
    } catch (error) {
      console.error('Failed to get delivery history:', error);
      throw error;
    }
  }

  /**
   * Get in-app notifications for a user
   */
  async getInAppNotifications(
    userId: string,
    unreadOnly: boolean = false,
    limit: number = 20,
    offset: number = 0
  ): Promise<any[]> {
    try {
      let whereClause = 'WHERE user_id = $1';
      const values: any[] = [userId];
      let paramIndex = 2;

      if (unreadOnly) {
        whereClause += ` AND is_read = false`;
      }

      whereClause += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      values.push(limit, offset);

      const result = await query(
        `SELECT * FROM in_app_notifications ${whereClause}`,
        values
      );

      return result.rows;
    } catch (error) {
      console.error(`Failed to get in-app notifications for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Mark in-app notification as read
   */
  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      const result = await query(
        'UPDATE in_app_notifications SET is_read = true WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
      );

      if (result.rowCount === 0) {
        throw new Error(`Notification ${notificationId} not found for user ${userId}`);
      }
    } catch (error) {
      console.error(`Failed to mark notification ${notificationId} as read:`, error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStatistics(userId?: string): Promise<{
    total_sent: number;
    by_channel: Record<string, number>;
    by_status: Record<string, number>;
    success_rate: number;
  }> {
    try {
      let whereClause = '';
      const values: any[] = [];

      if (userId) {
        whereClause = 'WHERE user_id = $1';
        values.push(userId);
      }

      const result = await query(
        `SELECT 
           COUNT(*) as total_sent,
           COUNT(CASE WHEN channel = 'email' THEN 1 END) as email,
           COUNT(CASE WHEN channel = 'sms' THEN 1 END) as sms,
           COUNT(CASE WHEN channel = 'webhook' THEN 1 END) as webhook,
           COUNT(CASE WHEN channel = 'in_app' THEN 1 END) as in_app,
           COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
           COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
           COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
           COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced
         FROM notification_deliveries ${whereClause}`,
        values
      );

      const stats = result.rows[0];
      const totalSent = parseInt(stats.total_sent);
      const successful = parseInt(stats.sent) + parseInt(stats.delivered);
      const successRate = totalSent > 0 ? (successful / totalSent) * 100 : 0;

      return {
        total_sent: totalSent,
        by_channel: {
          email: parseInt(stats.email),
          sms: parseInt(stats.sms),
          webhook: parseInt(stats.webhook),
          in_app: parseInt(stats.in_app)
        },
        by_status: {
          sent: parseInt(stats.sent),
          delivered: parseInt(stats.delivered),
          failed: parseInt(stats.failed),
          bounced: parseInt(stats.bounced)
        },
        success_rate: successRate
      };
    } catch (error) {
      console.error('Failed to get notification statistics:', error);
      throw error;
    }
  }

  /**
   * Check if notification is allowed based on preferences
   */
  private isNotificationAllowed(
    channel: string,
    preferences: NotificationPreferences
  ): boolean {
    switch (channel) {
      case 'email':
        return preferences.email_enabled;
      case 'sms':
        return preferences.sms_enabled;
      case 'webhook':
        return preferences.webhook_enabled;
      case 'in_app':
        return preferences.in_app_enabled;
      default:
        return false;
    }
  }

  /**
   * Check if current time is within quiet hours
   */
  private isInQuietHours(preferences: NotificationPreferences): boolean {
    if (!preferences.quiet_hours_start || !preferences.quiet_hours_end) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = preferences.quiet_hours_start.split(':').map(Number);
    const [endHour, endMin] = preferences.quiet_hours_end.split(':').map(Number);
    
    const startTime = (startHour || 0) * 60 + (startMin || 0);
    const endTime = (endHour || 0) * 60 + (endMin || 0);

    if (startTime <= endTime) {
      // Same day quiet hours
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Overnight quiet hours
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  /**
   * Check if frequency limit is exceeded
   */
  private async isFrequencyLimitExceeded(userId: string): Promise<boolean> {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      
      if (!preferences.frequency_limit) {
        return false;
      }

      const result = await query(
        `SELECT COUNT(*) as count FROM notification_deliveries 
         WHERE user_id = $1 
           AND created_at > NOW() - INTERVAL '1 hour'
           AND status IN ('sent', 'delivered')`,
        [userId]
      );

      const recentCount = parseInt(result.rows[0].count);
      return recentCount >= preferences.frequency_limit;
    } catch (error) {
      console.error('Failed to check frequency limit:', error);
      return false; // Don't block on error
    }
  }

  /**
   * Create delivery record in database
   */
  private async createDeliveryRecord(
    delivery: Omit<NotificationDelivery, 'id' | 'created_at'>
  ): Promise<NotificationDelivery> {
    try {
      const result = await query(
        `INSERT INTO notification_deliveries 
         (alert_id, user_id, channel, status, recipient, subject, content, error_message, sent_at, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          delivery.alert_id,
          delivery.user_id,
          delivery.channel,
          delivery.status,
          delivery.recipient,
          delivery.subject || null,
          delivery.content,
          delivery.error_message || null,
          delivery.sent_at || null,
          delivery.delivered_at || null
        ]
      );

      return result.rows[0] as NotificationDelivery;
    } catch (error) {
      console.error('Failed to create delivery record:', error);
      throw error;
    }
  }

  /**
   * Get email template based on alert severity
   */
  private async getEmailTemplate(severity: string): Promise<NotificationTemplate> {
    try {
      const result = await query(
        'SELECT * FROM notification_templates WHERE type = $1 AND name = $2',
        ['email', `alert_${severity}`]
      );

      if (result.rows.length > 0) {
        return result.rows[0] as NotificationTemplate;
      }

      // Return default template
      return {
        id: 'default-email',
        name: `alert_${severity}`,
        type: 'email',
        subject: '{{severity}} Alert: {{title}}',
        body: `
          <h2>{{title}}</h2>
          <p><strong>Severity:</strong> {{severity}}</p>
          <p><strong>Brand:</strong> {{brand_name}}</p>
          <p><strong>Message:</strong></p>
          <div>{{message}}</div>
          <p><strong>Time:</strong> {{created_at}}</p>
          <hr>
          <p><small>This is an automated alert from your Brand Monitoring System.</small></p>
        `,
        variables: ['severity', 'title', 'brand_name', 'message', 'created_at'],
        created_at: new Date(),
        updated_at: new Date()
      };
    } catch (error) {
      console.error('Failed to get email template:', error);
      throw error;
    }
  }

  /**
   * Render template with alert data
   */
  private renderTemplate(template: NotificationTemplate, alert: Alert): string {
    let content = template.body;
    
    const variables = {
      severity: alert.severity.toUpperCase(),
      title: alert.title,
      message: alert.message,
      created_at: alert.created_at.toLocaleString(),
      brand_name: 'Your Brand' // This would come from brand lookup
    };

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, value);
    }

    return content;
  }

  /**
   * Format SMS content
   */
  private formatSMSContent(alert: Alert): string {
    const maxLength = 160; // SMS character limit
    let content = `${alert.severity.toUpperCase()} ALERT: ${alert.title}`;
    
    if (content.length < maxLength - 20) {
      const remainingSpace = maxLength - content.length - 5; // Leave space for "..."
      const messagePreview = alert.message.substring(0, remainingSpace);
      content += `\n${messagePreview}${alert.message.length > remainingSpace ? '...' : ''}`;
    }

    return content;
  }

  /**
   * Format webhook payload
   */
  private formatWebhookPayload(alert: Alert): any {
    return {
      event: 'alert.triggered',
      timestamp: new Date().toISOString(),
      alert: {
        id: alert.id,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        brand_id: alert.brand_id,
        metric_type: alert.metric_type,
        current_value: alert.current_value,
        threshold_value: alert.threshold_value,
        created_at: alert.created_at
      }
    };
  }

  /**
   * Send SMS via Twilio
   */
  private async sendTwilioSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // This would integrate with Twilio SDK
      // For now, return success for testing
      console.log(`Twilio SMS to ${phoneNumber}: ${message}`);
      return true;
    } catch (error) {
      console.error('Twilio SMS failed:', error);
      return false;
    }
  }

  /**
   * Send SMS via AWS SNS
   */
  private async sendAWSSNSSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {
      // This would integrate with AWS SNS SDK
      // For now, return success for testing
      console.log(`AWS SNS SMS to ${phoneNumber}: ${message}`);
      return true;
    } catch (error) {
      console.error('AWS SNS SMS failed:', error);
      return false;
    }
  }

  /**
   * Test notification delivery
   */
  async testNotification(
    userId: string,
    channel: 'email' | 'sms' | 'webhook' | 'in_app'
  ): Promise<boolean> {
    try {
      const testAlert: Alert = {
        id: `test-${Date.now()}`,
        brand_id: 'test-brand',
        severity: 'low',
        title: 'Test Notification',
        message: 'This is a test notification to verify your notification settings.',
        metric_type: 'test',
        is_acknowledged: false,
        created_at: new Date()
      };

      const delivery = await this.sendNotification(testAlert, channel, userId);
      return delivery.status === 'sent' || delivery.status === 'delivered';
    } catch (error) {
      console.error(`Test notification failed for ${channel}:`, error);
      return false;
    }
  }
}