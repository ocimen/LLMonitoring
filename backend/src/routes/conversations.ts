import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  startConversation,
  continueConversation,
  getConversations,
  getConversationDetails,
  getDashboardData,
  detectMentions,
  markConversationInactive,
  getConversationStatistics,
  searchConversations,
  getConversationTurns,
  getConversationMentions,
  getConversationTopics
} from '../controllers/conversations';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Conversation management routes
router.post('/', startConversation);
router.get('/', getConversations);
router.get('/search/:brandId', searchConversations);

// Individual conversation routes
router.get('/:conversationId', getConversationDetails);
router.post('/:conversationId/continue', continueConversation);
router.patch('/:conversationId/inactive', markConversationInactive);

// Conversation sub-resources
router.get('/:conversationId/turns', getConversationTurns);
router.get('/:conversationId/mentions', getConversationMentions);
router.get('/:conversationId/topics', getConversationTopics);

// Analytics and dashboard routes
router.get('/dashboard/:brandId', getDashboardData);
router.get('/statistics/:brandId', getConversationStatistics);

// Utility routes
router.post('/detect-mentions', detectMentions);

export default router;