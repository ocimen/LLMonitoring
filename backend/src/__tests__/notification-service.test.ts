import { NotificationService } from '../services/NotificationService';
import { query } from '../config/database';
import { Alert } from '../types/database';
import nodemailer from 'nodemailer';
import axios from 'axios';
import { Server as SocketIOServer } from 'socket.io';

// Mock database queries
jest.mock('../config/database', () => ({
  query: jest.fn()
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  })
}));

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ status: 200, data: { success: true } })
}));

// Mock Socket.IO
const mockSocketIO = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn()
} as any;

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockSendMail = jest.fn();
const mockAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

describe('NotificationService', () => {
  let service: NotificationService;

  const mockAlert: Alert = {
    id: 'alert-1',
    brand_id: 'brand-1',
    severity: 'medium',
    title: 'Test Alert',
    message: 'This is a test alert message',
    metric_type: 'overall_score',
    current_value: 65,
    threshold_value: 70,
    is_acknowledged: false,
    created_at: new Date('2024-01-15T10:00:00Z')
  };

  const mockNotificationPreferences = {
    user_id: 'user-1',
    email_enabled: true,
    sms_enabled: true,
    webhook_enabled: true,
    in_app_enabled: true,
    quiet_hours_start: undefined,
    quiet_hours_end: undefined,
    frequency_limit: 10,
    email_address: 'test@example.com',
    phone_number: '+1234567890',
    webhook_url: 'https://example.com/webhook',
    created_at: new Date('2024-01-15'),
    updated_at: new Date('2024-01-15')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockSendMail.mockReset();
    mockAxiosPost.mockReset();
    
    // Set up environment variables for testing
    process.env.SMTP_USER = 'test@example.com';
    process.env.SMTP_PASS = 'password';
    process.env.SMS_PROVIDER = 'twilio';
    process.env.SMS_API_KEY = 'test-api-key';
    process.env.SMS_API_SECRET = 'test-api-secret';
    
    // Mock nodemailer transporter
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail.mockResolvedValue({ messageId: 'test-message-id' })
    });

    service = new NotificationService(mockSocketIO);
  });

  describe('sendNotification', () => {
    describe('email notifications', () => {
      it('should send email notification successfully', async () => {
        // Mock user email lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'test@example.com' }],
          rowCount: 1
        });

        // Mock email template lookup
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        });

        // Mock delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            alert_id: 'alert-1',
            user_id: 'user-1',
            channel: 'email',
            status: 'sent',
            recipient: 'test@example.com',
            subject: 'Medium Alert: Test Alert',
            content: 'Email content',
            sent_at: new Date(),
            created_at: new Date()
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(mockAlert, 'email', 'user-1');

        expect(result.channel).toBe('email');
        expect(result.status).toBe('sent');
        expect(result.recipient).toBe('test@example.com');
        expect(mockSendMail).toHaveBeenCalled();
      });

      it('should handle email sending failure', async () => {
        // Mock user email lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'test@example.com' }],
          rowCount: 1
        });

        // Mock email template lookup
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        });

        // Mock email sending failure
        mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

        // Mock failed delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            alert_id: 'alert-1',
            user_id: 'user-1',
            channel: 'email',
            status: 'failed',
            recipient: 'user-1',
            content: mockAlert.message,
            error_message: 'Email sending failed: SMTP connection failed',
            created_at: new Date()
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(mockAlert, 'email', 'user-1');

        expect(result.status).toBe('failed');
        expect(result.error_message).toContain('Email sending failed');
      });

      it('should handle user not found for email', async () => {
        // Mock user not found
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        });

        // Mock failed delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            status: 'failed',
            error_message: 'Email sending failed: User user-1 not found'
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(mockAlert, 'email', 'user-1');

        expect(result.status).toBe('failed');
        expect(result.error_message).toContain('User user-1 not found');
      });
    });

    describe('SMS notifications', () => {
      beforeEach(() => {
        // Set SMS environment variables
        process.env.SMS_PROVIDER = 'twilio';
        process.env.SMS_API_KEY = 'test-api-key';
        process.env.SMS_API_SECRET = 'test-api-secret';
        
        // Reinitialize service to pick up env vars
        service = new NotificationService(mockSocketIO);
      });

      it('should send SMS notification successfully', async () => {
        // Mock phone number lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ phone_number: '+1234567890' }],
          rowCount: 1
        });

        // Mock delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            alert_id: 'alert-1',
            user_id: 'user-1',
            channel: 'sms',
            status: 'sent',
            recipient: '+1234567890',
            content: 'MEDIUM ALERT: Test Alert',
            sent_at: new Date(),
            created_at: new Date()
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(mockAlert, 'sms', 'user-1');

        expect(result.channel).toBe('sms');
        expect(result.status).toBe('sent');
        expect(result.recipient).toBe('+1234567890');
      });

      it('should handle missing phone number', async () => {
        // Mock no phone number found
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 0
        });

        // Mock failed delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            status: 'failed',
            error_message: 'SMS sending failed: Phone number not found for user user-1'
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(mockAlert, 'sms', 'user-1');

        expect(result.status).toBe('failed');
        expect(result.error_message).toContain('Phone number not found');
      });
    });

    describe('webhook notifications', () => {
      it('should send webhook notification successfully', async () => {
        // Mock webhook URL lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ webhook_url: 'https://example.com/webhook' }],
          rowCount: 1
        });

        // Mock delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            alert_id: 'alert-1',
            user_id: 'user-1',
            channel: 'webhook',
            status: 'delivered',
            recipient: 'https://example.com/webhook',
            content: JSON.stringify({ event: 'alert.triggered' }),
            delivered_at: new Date(),
            created_at: new Date()
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(mockAlert, 'webhook', 'user-1');

        expect(result.channel).toBe('webhook');
        expect(result.status).toBe('delivered');
        expect(result.recipient).toBe('https://example.com/webhook');
        expect(mockAxiosPost).toHaveBeenCalledWith(
          'https://example.com/webhook',
          expect.objectContaining({
            event: 'alert.triggered',
            alert: expect.objectContaining({
              id: 'alert-1',
              title: 'Test Alert'
            })
          }),
          expect.any(Object)
        );
      });

      it('should handle webhook sending failure', async () => {
        // Mock webhook URL lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ webhook_url: 'https://example.com/webhook' }],
          rowCount: 1
        });

        // Mock webhook failure
        mockAxiosPost.mockRejectedValueOnce(new Error('Network timeout'));

        // Mock failed delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            status: 'failed',
            error_message: 'Webhook sending failed: Network timeout'
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(mockAlert, 'webhook', 'user-1');

        expect(result.status).toBe('failed');
        expect(result.error_message).toContain('Network timeout');
      });
    });

    describe('in-app notifications', () => {
      it('should send in-app notification successfully', async () => {
        // Mock in-app notification creation
        mockQuery.mockResolvedValueOnce({
          rows: [],
          rowCount: 1
        });

        // Mock delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            alert_id: 'alert-1',
            user_id: 'user-1',
            channel: 'in_app',
            status: 'delivered',
            recipient: 'user-1',
            content: JSON.stringify({
              id: expect.any(String),
              alert_id: 'alert-1',
              title: 'Test Alert',
              message: 'This is a test alert message',
              severity: 'medium'
            }),
            delivered_at: expect.any(Date),
            created_at: expect.any(Date)
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(mockAlert, 'in_app', 'user-1');

        expect(result.channel).toBe('in_app');
        expect(result.status).toBe('delivered');
        expect(result.recipient).toBe('user-1');
        expect(mockSocketIO.to).toHaveBeenCalledWith('user-user-1');
        expect(mockSocketIO.emit).toHaveBeenCalledWith('notification', expect.any(Object));
      });
    });

    describe('notification preferences', () => {
      it('should respect disabled notification channels', async () => {
        const disabledPreferences = {
          ...mockNotificationPreferences,
          email_enabled: false
        } as any;

        // Mock failed delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            status: 'failed',
            error_message: 'Notifications disabled for channel: email'
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(
          mockAlert, 
          'email', 
          'user-1', 
          disabledPreferences
        );

        expect(result.status).toBe('failed');
        expect(result.error_message).toContain('Notifications disabled for channel: email');
      });

      it('should respect quiet hours', async () => {
        const quietHoursPreferences = {
          ...mockNotificationPreferences,
          quiet_hours_start: '22:00',
          quiet_hours_end: '08:00'
        } as any;

        // Mock current time to be within quiet hours
        const originalDate = Date;
        // Mock current time to be within quiet hours
        const originalDate = Date;
        const mockDate = new Date('2024-01-15T23:00:00Z'); // 11 PM
        jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
        Date.now = originalDate.now;
        Date.UTC = originalDate.UTC;
        Date.parse = originalDate.parse;

        // Mock failed delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            status: 'failed',
            error_message: 'Notification blocked due to quiet hours'
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(
          mockAlert, 
          'email', 
          'user-1', 
          quietHoursPreferences
        );

        expect(result.status).toBe('failed');
        expect(result.error_message).toContain('quiet hours');

        // Restore original Date
        jest.restoreAllMocks();

      it('should respect frequency limits', async () => {
        const limitedPreferences = {
          ...mockNotificationPreferences,
          frequency_limit: 1
        } as any;

        // Mock preferences lookup for frequency check
        mockQuery.mockResolvedValueOnce({
          rows: [limitedPreferences],
          rowCount: 1
        });

        // Mock frequency check - user has already received 1 notification
        mockQuery.mockResolvedValueOnce({
          rows: [{ count: '1' }],
          rowCount: 1
        });

        // Mock failed delivery record creation
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: 'delivery-1',
            alert_id: 'alert-1',
            user_id: 'user-1',
            channel: 'email',
            status: 'failed',
            recipient: 'user-1',
            content: 'This is a test alert message',
            error_message: 'Notification frequency limit exceeded',
            created_at: new Date()
          }],
          rowCount: 1
        });

        const result = await service.sendNotification(
          mockAlert, 
          'email', 
          'user-1', 
          limitedPreferences
        );

        expect(result.status).toBe('failed');
        expect(result.error_message).toContain('frequency limit exceeded');
      });
    });
  });

  describe('getNotificationPreferences', () => {
    it('should return existing preferences', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [mockNotificationPreferences],
        rowCount: 1
      });

      const result = await service.getNotificationPreferences('user-1');

      expect(result).toEqual(mockNotificationPreferences);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        ['user-1']
      );
    });

    it('should create default preferences if none exist', async () => {
      // Mock no existing preferences
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      // Mock creation of default preferences
      const defaultPrefs = {
        user_id: 'user-1',
        email_enabled: true,
        sms_enabled: false,
        webhook_enabled: false,
        in_app_enabled: true,
        frequency_limit: 10
      };

      mockQuery.mockResolvedValueOnce({
        rows: [defaultPrefs],
        rowCount: 1
      });

      const result = await service.getNotificationPreferences('user-1');

      expect(result.user_id).toBe('user-1');
      expect(result.email_enabled).toBe(true);
      expect(result.in_app_enabled).toBe(true);
      expect(result.frequency_limit).toBe(10);
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update notification preferences successfully', async () => {
      const updates = {
        email_enabled: false,
        sms_enabled: true,
        frequency_limit: 5
      };

      const updatedPrefs = {
        ...mockNotificationPreferences,
        ...updates
      };

      mockQuery.mockResolvedValueOnce({
        rows: [updatedPrefs],
        rowCount: 1
      });

      const result = await service.updateNotificationPreferences('user-1', updates);

      expect(result.email_enabled).toBe(false);
      expect(result.sms_enabled).toBe(true);
      expect(result.frequency_limit).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE notification_preferences'),
        expect.arrayContaining([false, true, 5, 'user-1'])
      );
    });

    it('should throw error when no preferences found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await expect(
        service.updateNotificationPreferences('user-1', { email_enabled: false })
      ).rejects.toThrow('Notification preferences not found for user user-1');
    });

    it('should throw error when no valid fields to update', async () => {
      await expect(
        service.updateNotificationPreferences('user-1', {})
      ).rejects.toThrow('No valid fields to update');
    });
  });

  describe('getDeliveryHistory', () => {
    it('should return delivery history with default parameters', async () => {
      const mockDeliveries = [
        {
          id: 'delivery-1',
          alert_id: 'alert-1',
          user_id: 'user-1',
          channel: 'email',
          status: 'sent',
          recipient: 'test@example.com',
          created_at: new Date()
        }
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockDeliveries,
        rowCount: 1
      });

      const result = await service.getDeliveryHistory();

      expect(result).toEqual(mockDeliveries);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM notification_deliveries'),
        [50, 0]
      );
    });

    it('should filter by user ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await service.getDeliveryHistory('user-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND user_id = $1'),
        ['user-1', 50, 0]
      );
    });

    it('should filter by channel', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await service.getDeliveryHistory(undefined, undefined, 'email');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND channel = $1'),
        ['email', 50, 0]
      );
    });

    it('should apply pagination', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await service.getDeliveryHistory(undefined, undefined, undefined, 10, 20);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [10, 20]
      );
    });
  });

  describe('getInAppNotifications', () => {
    it('should return in-app notifications for user', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          user_id: 'user-1',
          alert_id: 'alert-1',
          title: 'Test Notification',
          message: 'Test message',
          severity: 'medium',
          is_read: false,
          created_at: new Date()
        }
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockNotifications,
        rowCount: 1
      });

      const result = await service.getInAppNotifications('user-1');

      expect(result).toEqual(mockNotifications);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-1', 20, 0]
      );
    });

    it('should filter unread notifications only', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await service.getInAppNotifications('user-1', true);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND is_read = false'),
        ['user-1', 20, 0]
      );
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read successfully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 1
      });

      await service.markNotificationAsRead('notif-1', 'user-1');

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE in_app_notifications SET is_read = true WHERE id = $1 AND user_id = $2',
        ['notif-1', 'user-1']
      );
    });

    it('should throw error when notification not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      await expect(
        service.markNotificationAsRead('notif-1', 'user-1')
      ).rejects.toThrow('Notification notif-1 not found for user user-1');
    });
  });

  describe('getNotificationStatistics', () => {
    it('should return comprehensive statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_sent: '100',
          email: '40',
          sms: '20',
          webhook: '15',
          in_app: '25',
          sent: '80',
          delivered: '15',
          failed: '5',
          bounced: '0'
        }],
        rowCount: 1
      });

      const result = await service.getNotificationStatistics();

      expect(result).toEqual({
        total_sent: 100,
        by_channel: {
          email: 40,
          sms: 20,
          webhook: 15,
          in_app: 25
        },
        by_status: {
          sent: 80,
          delivered: 15,
          failed: 5,
          bounced: 0
        },
        success_rate: 95 // (80 + 15) / 100 * 100
      });
    });

    it('should filter statistics by user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_sent: '10',
          email: '5',
          sms: '2',
          webhook: '1',
          in_app: '2',
          sent: '8',
          delivered: '1',
          failed: '1',
          bounced: '0'
        }],
        rowCount: 1
      });

      const result = await service.getNotificationStatistics('user-1');

      expect(result.total_sent).toBe(10);
      expect(result.success_rate).toBe(90);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-1']
      );
    });
  });

  describe('testNotification', () => {
    it('should send test notification successfully', async () => {
      // Mock user email lookup for test email
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: 'test@example.com' }],
        rowCount: 1
      });

      // Mock email template lookup
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      // Mock delivery record creation
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'delivery-1',
          status: 'sent'
        }],
        rowCount: 1
      });

      const result = await service.testNotification('user-1', 'email');

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalled();
    });

    it('should return false when test notification fails', async () => {
      // Mock user not found
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0
      });

      // Mock failed delivery record creation
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'delivery-1',
          status: 'failed'
        }],
        rowCount: 1
      });

      const result = await service.testNotification('user-1', 'email');

      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        service.getNotificationPreferences('user-1')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle unsupported notification channels', async () => {
      // Mock failed delivery record creation
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'delivery-1',
          status: 'failed',
          error_message: 'Unsupported notification channel: invalid'
        }],
        rowCount: 1
      });

      const result = await service.sendNotification(
        mockAlert, 
        'invalid' as any, 
        'user-1'
      );

      expect(result.status).toBe('failed');
      expect(result.error_message).toContain('Unsupported notification channel');
    });
  });
});