import { Router } from 'express';
import { NotificationController } from '../controllers/notifications';
import { 
  authenticate, 
  authorize, 
  validateRequestBody,
  AuthenticatedRequest 
} from '../middleware/auth';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

/**
 * @route GET /api/notifications/preferences
 * @desc Get notification preferences for current user
 * @access Private
 */
router.get('/preferences', NotificationController.getPreferences);

/**
 * @route PUT /api/notifications/preferences
 * @desc Update notification preferences for current user
 * @access Private
 */
router.put('/preferences', NotificationController.updatePreferences);

/**
 * @route GET /api/notifications/in-app
 * @desc Get in-app notifications for current user
 * @query unread_only - boolean, filter for unread notifications only
 * @query limit - number, max 100, default 20
 * @query offset - number, default 0
 * @access Private
 */
router.get('/in-app', NotificationController.getInAppNotifications);

/**
 * @route PUT /api/notifications/in-app/:notificationId/read
 * @desc Mark specific in-app notification as read
 * @access Private
 */
router.put('/in-app/:notificationId/read', NotificationController.markAsRead);

/**
 * @route PUT /api/notifications/in-app/read-all
 * @desc Mark all in-app notifications as read for current user
 * @access Private
 */
router.put('/in-app/read-all', NotificationController.markAllAsRead);

/**
 * @route GET /api/notifications/history
 * @desc Get notification delivery history for current user
 * @query channel - string, filter by notification channel
 * @query limit - number, max 100, default 50
 * @query offset - number, default 0
 * @access Private
 */
router.get('/history', NotificationController.getDeliveryHistory);

/**
 * @route GET /api/notifications/statistics
 * @desc Get notification statistics for current user
 * @access Private
 */
router.get('/statistics', NotificationController.getStatistics);

/**
 * @route POST /api/notifications/test
 * @desc Send test notification via specified channel
 * @body channel - string, required (email, sms, webhook, in_app)
 * @access Private
 */
router.post('/test', 
  validateRequestBody(['channel']),
  NotificationController.testNotification
);

// Admin-only routes for template management
/**
 * @route GET /api/notifications/templates
 * @desc Get notification templates (admin only)
 * @query type - string, filter by template type
 * @access Admin
 */
router.get('/templates', 
  authorize(['admin']),
  NotificationController.getTemplates
);

/**
 * @route POST /api/notifications/templates
 * @desc Create or update notification template (admin only)
 * @body name - string, required
 * @body type - string, required (email, sms, webhook, in_app)
 * @body subject - string, optional
 * @body body - string, required
 * @body variables - array, optional
 * @body is_active - boolean, optional, default true
 * @access Admin
 */
router.post('/templates',
  authorize(['admin']),
  validateRequestBody(['name', 'type', 'body']),
  NotificationController.upsertTemplate
);

/**
 * @route PUT /api/notifications/templates/:templateId
 * @desc Update notification template (admin only)
 * @access Admin
 */
router.put('/templates/:templateId',
  authorize(['admin']),
  validateRequestBody(['name', 'type', 'body']),
  NotificationController.upsertTemplate
);

/**
 * @route DELETE /api/notifications/templates/:templateId
 * @desc Delete notification template (admin only)
 * @access Admin
 */
router.delete('/templates/:templateId',
  authorize(['admin']),
  NotificationController.deleteTemplate
);

export { router as notificationRouter };