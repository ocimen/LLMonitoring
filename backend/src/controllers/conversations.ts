import { Request, Response } from 'express';
import { ConversationMonitoringService } from '../services/ConversationMonitoringService';
import { ConversationModel } from '../models/Conversation';
import { ConversationFilter } from '../types/database';
import { 
  validateSchema, 
  startConversationSchema, 
  continueConversationSchema,
  detectMentionsSchema 
} from '../models/validation';

/**
 * Start a new conversation tracking session
 */
export const startConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = validateSchema(startConversationSchema, req.body) as {
      brandId: string;
      aiModelId: string;
      initialQuery: string;
      aiResponse: string;
      conversationThreadId?: string;
      context?: Record<string, any>;
    };
    const {
      brandId,
      aiModelId,
      initialQuery,
      aiResponse,
      conversationThreadId,
      context
    } = validatedData;

    const result = await ConversationMonitoringService.startConversation(
      brandId,
      aiModelId,
      initialQuery,
      aiResponse,
      conversationThreadId,
      context
    );

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error starting conversation:', error);
    res.status(500).json({
      error: 'Failed to start conversation tracking',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Continue an existing conversation with a new turn
 */
export const continueConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;
    const validatedData = validateSchema(continueConversationSchema, req.body) as {
      userInput: string;
      aiResponse: string;
      turnType?: 'follow_up' | 'clarification' | 'comparison';
    };
    const { userInput, aiResponse, turnType } = validatedData;

    if (!conversationId) {
      res.status(400).json({
        error: 'Missing conversation ID'
      });
      return;
    }

    const result = await ConversationMonitoringService.continueConversation(
      conversationId,
      userInput,
      aiResponse,
      turnType
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error continuing conversation:', error);
    
    if (error instanceof Error && error.message === 'Conversation not found') {
      res.status(404).json({
        error: 'Conversation not found'
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to continue conversation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get conversations with filtering and pagination
 */
export const getConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      brandId,
      aiModelId,
      conversationType,
      isActive,
      hasMentions,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    const filter: ConversationFilter = {
      limit: parseInt(limit as string) || 50,
      offset: parseInt(offset as string) || 0,
      ...(brandId && { brand_id: brandId as string }),
      ...(aiModelId && { ai_model_id: aiModelId as string }),
      ...(conversationType && { conversation_type: conversationType as string }),
      ...(isActive === 'true' && { is_active: true }),
      ...(isActive === 'false' && { is_active: false }),
      ...(hasMentions === 'true' && { has_mentions: true }),
      ...(startDate && { start_date: new Date(startDate as string) }),
      ...(endDate && { end_date: new Date(endDate as string) })
    };

    const result = await ConversationMonitoringService.getConversations(filter);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get conversation details with all related data
 */
export const getConversationDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({
        error: 'Missing conversation ID'
      });
      return;
    }

    const result = await ConversationMonitoringService.getConversationDetails(conversationId);

    if (!result) {
      res.status(404).json({
        error: 'Conversation not found'
      });
      return;
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting conversation details:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get conversation monitoring dashboard data
 */
export const getDashboardData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { brandId } = req.params;
    const { days = 30 } = req.query;

    if (!brandId) {
      res.status(400).json({
        error: 'Missing brand ID'
      });
      return;
    }

    const result = await ConversationMonitoringService.getDashboardData(
      brandId,
      parseInt(days as string) || 30
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({
      error: 'Failed to retrieve dashboard data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Detect mentions in text
 */
export const detectMentions = async (req: Request, res: Response): Promise<void> => {
  try {
    const validatedData = validateSchema(detectMentionsSchema, req.body) as {
      brand_id: string;
      response_text: string;
      context?: string;
    };
    const { brand_id: brandId, response_text: responseText, context } = validatedData;

    const result = await ConversationMonitoringService.detectMentions(
      brandId,
      responseText,
      context
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error detecting mentions:', error);
    res.status(500).json({
      error: 'Failed to detect mentions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Mark conversation as inactive
 */
export const markConversationInactive = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({
        error: 'Missing conversation ID'
      });
      return;
    }

    const result = await ConversationModel.markInactive(conversationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error marking conversation inactive:', error);
    
    if (error instanceof Error && error.message === 'Conversation not found') {
      res.status(404).json({
        error: 'Conversation not found'
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to mark conversation inactive',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get conversation statistics for a brand
 */
export const getConversationStatistics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { brandId } = req.params;
    const { days = 30 } = req.query;

    if (!brandId) {
      res.status(400).json({
        error: 'Missing brand ID'
      });
      return;
    }

    const result = await ConversationModel.getStatistics(
      brandId,
      parseInt(days as string) || 30
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting conversation statistics:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation statistics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Search conversations by content
 */
export const searchConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { brandId } = req.params;
    const { q: searchTerm, limit = 20 } = req.query;

    if (!brandId) {
      res.status(400).json({
        error: 'Missing brand ID'
      });
      return;
    }

    if (!searchTerm) {
      res.status(400).json({
        error: 'Missing search term parameter: q'
      });
      return;
    }

    const result = await ConversationModel.searchConversations(
      brandId,
      searchTerm as string,
      parseInt(limit as string) || 20
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error searching conversations:', error);
    res.status(500).json({
      error: 'Failed to search conversations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get conversation turns
 */
export const getConversationTurns = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({
        error: 'Missing conversation ID'
      });
      return;
    }

    const result = await ConversationModel.getTurns(conversationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting conversation turns:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation turns',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get conversation mentions
 */
export const getConversationMentions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({
        error: 'Missing conversation ID'
      });
      return;
    }

    const result = await ConversationModel.getMentions(conversationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting conversation mentions:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation mentions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get conversation topics
 */
export const getConversationTopics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      res.status(400).json({
        error: 'Missing conversation ID'
      });
      return;
    }

    const result = await ConversationModel.getTopics(conversationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting conversation topics:', error);
    res.status(500).json({
      error: 'Failed to retrieve conversation topics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};