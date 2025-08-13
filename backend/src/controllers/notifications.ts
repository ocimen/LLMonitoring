import { Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService';
import { query } from '../config/database';

export class NotificationController {
  private static notificationService: NotificationService;

  static initialize(notificationService: NotificationService): void {
    NotificationController.notificationService = notificationService;
  }

  /**
   * Get notification preferences for the current user
   */
  static async getPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const preferences = await NotificationController.notificationService.getNotificationPreferences(userId);
      
      res.json({
        success: true,
        data: preferences
      });
    } catch (error) {
      console.error('Failed to get notification preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get notification preferences',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update notification preferences for the current user
   */
  static async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const updates = req.body;

      // Validate preference fields
      const allowedFields = [
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

      const validUpdates: any = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          validUpdates[field] = updates[field];
        }
      }

      if (Object.keys(validUpdates).length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid fields provided for update'
        });
        return;
      }

      // Validate quiet hours format if provided
      if (validUpdates.quiet_hours_start && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(validUpdates.quiet_hours_start)) {
        res.status(400).json({
          success: false,
          error: 'Invalid quiet_hours_start format. Use HH:MM format.'
        });
        return;
      }

      if (validUpdates.quiet_hours_end && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(validUpdates.quiet_hours_end)) {
        res.status(400).json({
          success: false,
          error: 'Invalid quiet_hours_end format. Use HH:MM format.'
        });
        return;
      }

      // Validate frequency limit
      if (validUpdates.frequency_limit !== undefined && (validUpdates.frequency_limit < 1 || validUpdates.frequency_limit > 100)) {
        res.status(400).json({
          success: false,
          error: 'Frequency limit must be between 1 and 100'
        });
        return;
      }

      // Validate email format if provided
      if (validUpdates.email_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validUpdates.email_address)) {
        res.status(400).json({
          success: false,
          error: 'Invalid email address format'
        });
        return;
      }

      // Validate webhook URL if provided
      if (validUpdates.webhook_url && !/^https?:\/\/.+/.test(validUpdates.webhook_url)) {
        res.status(400).json({
          success: false,
          error: 'Invalid webhook URL format. Must start with http:// or https://'
        });
        return;
      }

      const updatedPreferences = await NotificationController.notificationService.updateNotificationPreferences(
        userId,
        validUpdates
      );

      res.json({
        success: true,
        data: updatedPreferences,
        message: 'Notification preferences updated successfully'
      });
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update notification preferences',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get in-app notifications for the current user
   */
  static async getInAppNotifications(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const unreadOnly = req.query.unread_only === 'true';
      const limitParam = parseInt(req.query.limit as string);
      const offsetParam = parseInt(req.query.offset as string);
      const limit = Math.min(isNaN(limitParam) ? 20 : limitParam, 100);
      const offset = Math.max(isNaN(offsetParam) ? 0 : offsetParam, 0);

      const notifications = await NotificationController.notificationService.getInAppNotifications(
        userId,
        unreadOnly,
        limit,
        offset
      );

      res.json({
        success: true,
        data: notifications,
        pagination: {
          limit,
          offset,
          count: notifications.length
        }
      });
    } catch (error) {
      console.error('Failed to get in-app notifications:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get in-app notifications',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Mark an in-app notification as read
   */
  static async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const notificationId = req.params.notificationId;

      if (!notificationId) {
        res.status(400).json({
          success: false,
          error: 'Notification ID is required'
        });
        return;
      }

      await NotificationController.notificationService.markNotificationAsRead(notificationId, userId);

      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark notification as read',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Mark all in-app notifications as read for the current user
   */
  static async markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      const result = await query(
        'UPDATE in_app_notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
        [userId]
      );

      res.json({
        success: true,
        message: `Marked ${result.rowCount} notifications as read`
      });
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to mark all notifications as read',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get notification delivery history
   */
  static async getDeliveryHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const channel = req.query.channel as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const history = await NotificationController.notificationService.getDeliveryHistory(
        userId,
        undefined, // alertId
        channel,
        limit,
        offset
      );

      res.json({
        success: true,
        data: history,
        pagination: {
          limit,
          offset,
          count: history.length
        }
      });
    } catch (error) {
      console.error('Failed to get delivery history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get delivery history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get notification statistics for the current user
   */
  static async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const statistics = await NotificationController.notificationService.getNotificationStatistics(userId);

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      console.error('Failed to get notification statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get notification statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Test notification delivery for a specific channel
   */
  static async testNotification(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { channel } = req.body;

      if (!channel || !['email', 'sms', 'webhook', 'in_app'].includes(channel)) {
        res.status(400).json({
          success: false,
          error: 'Valid channel is required (email, sms, webhook, in_app)'
        });
        return;
      }

      const success = await NotificationController.notificationService.testNotification(userId, channel);

      if (success) {
        res.json({
          success: true,
          message: `Test notification sent successfully via ${channel}`
        });
      } else {
        res.status(500).json({
          success: false,
          error: `Failed to send test notification via ${channel}`
        });
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send test notification',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get notification templates (admin only)
   */
  static async getTemplates(req: Request, res: Response): Promise<void> {
    try {
      const type = req.query.type as string;
      let whereClause = 'WHERE is_active = true';
      const values: any[] = [];

      if (type) {
        whereClause += ' AND type = $1';
        values.push(type);
      }

      const result = await query(
        `SELECT * FROM notification_templates ${whereClause} ORDER BY type, name`,
        values
      );

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('Failed to get notification templates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get notification templates',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create or update notification template (admin only)
   */
  static async upsertTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { name, type, subject, body, variables, is_active } = req.body;

      if (!name || !type || !body) {
        res.status(400).json({
          success: false,
          error: 'Name, type, and body are required'
        });
        return;
      }

      if (!['email', 'sms', 'webhook', 'in_app'].includes(type)) {
        res.status(400).json({
          success: false,
          error: 'Invalid template type'
        });
        return;
      }

      const result = await query(
        `INSERT INTO notification_templates (name, type, subject, body, variables, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name, type) 
         DO UPDATE SET 
           subject = EXCLUDED.subject,
           body = EXCLUDED.body,
           variables = EXCLUDED.variables,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()
         RETURNING *`,
        [name, type, subject || null, body, variables || [], is_active !== false]
      );

      res.json({
        success: true,
        data: result.rows[0],
        message: 'Template saved successfully'
      });
    } catch (error) {
      console.error('Failed to save notification template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save notification template',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete notification template (admin only)
   */
  static async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      const { templateId } = req.params;

      const result = await query(
        'DELETE FROM notification_templates WHERE id = $1 RETURNING *',
        [templateId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({
          success: false,
          error: 'Template not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Template deleted successfully'
      });
    } catch (error) {
      console.error('Failed to delete notification template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete notification template',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}