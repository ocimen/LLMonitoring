import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { testConnection, closePool } from './config/database';
import { DatabaseUtils, CommonQueries } from './utils/database';
import { AuthService } from './services/auth';
import { AuthController } from './controllers/auth';
import { UserController } from './controllers/users';
import { BrandController } from './controllers/brands';
import { NotificationController } from './controllers/notifications';
import { NotificationService } from './services/NotificationService';
import { reportsRouter } from './routes/reports';
import { competitiveRouter } from './routes/competitive';
import { notificationRouter } from './routes/notifications';
import conversationRouter from './routes/conversations';
import { 
  authenticate, 
  authorize, 
  authRateLimit, 
  authorizeBrandAccess,
  validateRequestBody,
  securityHeaders,
  loadCurrentUser
} from './middleware/auth';

// Load environment variables
dotenv.config();

// Validate JWT configuration
AuthService.validateConfiguration();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Initialize NotificationService with Socket.IO
const notificationService = new NotificationService(io);
NotificationController.initialize(notificationService);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle user authentication for socket
  socket.on('authenticate', async (token) => {
    try {
      // Verify JWT token and join user-specific room
      const decoded = await AuthService.verifyAccessToken(token);
      if (decoded && decoded.userId) {
        socket.join(`user-${decoded.userId}`);
        socket.emit('authenticated', { success: true });
        console.log(`User ${decoded.userId} authenticated and joined room`);
      }
    } catch (error) {
      console.error('Socket authentication failed:', error);
      socket.emit('authentication_error', { error: 'Invalid token' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Global rate limiting
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Please try again later'
  }
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(globalRateLimit);
app.use(securityHeaders);

// Health check endpoint with database status
app.get('/health', async (_req, res) => {
  try {
    const dbHealth = await DatabaseUtils.getHealthInfo();
    res.status(200).json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      service: 'llm-brand-monitoring-backend',
      database: dbHealth
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      service: 'llm-brand-monitoring-backend',
      database: { connected: false },
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Database status endpoint
app.get('/api/database/status', async (_req, res) => {
  try {
    const health = await DatabaseUtils.getHealthInfo();
    const aiModelsCount = await DatabaseUtils.getTableCount('ai_models');
    const usersCount = await DatabaseUtils.getTableCount('users');
    const brandsCount = await DatabaseUtils.getTableCount('brands');
    
    res.json({
      health,
      tables: {
        ai_models: aiModelsCount,
        users: usersCount,
        brands: brandsCount
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get database status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Authentication routes
const authRateLimiter = authRateLimit(5, 15 * 60 * 1000); // 5 attempts per 15 minutes

app.post('/api/auth/register', 
  authRateLimiter,
  validateRequestBody(['email', 'password', 'first_name', 'last_name']),
  AuthController.register
);

app.post('/api/auth/login', 
  authRateLimiter,
  validateRequestBody(['email', 'password']),
  AuthController.login
);

app.post('/api/auth/refresh', 
  validateRequestBody(['refreshToken']),
  AuthController.refreshToken
);

app.post('/api/auth/logout', 
  authenticate,
  AuthController.logout
);

app.post('/api/auth/logout-all', 
  authenticate,
  AuthController.logoutAll
);

app.post('/api/auth/verify-email',
  validateRequestBody(['token']),
  AuthController.verifyEmail
);

// Protected user routes
app.get('/api/auth/profile', 
  authenticate,
  loadCurrentUser,
  AuthController.getProfile
);

app.put('/api/auth/profile', 
  authenticate,
  AuthController.updateProfile
);

app.get('/api/auth/sessions', 
  authenticate,
  AuthController.getSessions
);

app.delete('/api/auth/sessions/:sessionId', 
  authenticate,
  AuthController.revokeSession
);

// User management routes
app.get('/api/users',
  authenticate,
  authorize(['admin']),
  UserController.getAllUsers
);

app.get('/api/users/search',
  authenticate,
  authorize(['admin']),
  UserController.searchUsers
);

app.get('/api/users/:userId',
  authenticate,
  UserController.getUserById
);

app.put('/api/users/:userId',
  authenticate,
  UserController.updateUser
);

app.delete('/api/users/:userId',
  authenticate,
  authorize(['admin']),
  UserController.deactivateUser
);

app.get('/api/users/:userId/brands',
  authenticate,
  UserController.getUserBrands
);

app.post('/api/users/:userId/brands/:brandId',
  authenticate,
  UserController.addUserToBrand
);

app.delete('/api/users/:userId/brands/:brandId',
  authenticate,
  UserController.removeUserFromBrand
);

app.put('/api/users/:userId/brands/:brandId/role',
  authenticate,
  validateRequestBody(['role']),
  UserController.updateUserBrandRole
);

// Brand management routes
app.post('/api/brands',
  authenticate,
  validateRequestBody(['name']),
  BrandController.createBrand
);

app.get('/api/brands',
  authenticate,
  BrandController.getBrands
);

app.get('/api/brands/search',
  authenticate,
  BrandController.searchBrands
);

app.get('/api/brands/:brandId',
  authenticate,
  authorizeBrandAccess('viewer'),
  BrandController.getBrandById
);

app.put('/api/brands/:brandId',
  authenticate,
  authorizeBrandAccess('editor'),
  BrandController.updateBrand
);

app.delete('/api/brands/:brandId',
  authenticate,
  authorizeBrandAccess('owner'),
  BrandController.deleteBrand
);

app.get('/api/brands/:brandId/users',
  authenticate,
  authorizeBrandAccess('viewer'),
  BrandController.getBrandUsers
);

app.put('/api/brands/:brandId/keywords',
  authenticate,
  authorizeBrandAccess('editor'),
  validateRequestBody(['keywords']),
  BrandController.updateMonitoringKeywords
);

app.put('/api/brands/:brandId/competitors',
  authenticate,
  authorizeBrandAccess('editor'),
  validateRequestBody(['competitors']),
  BrandController.updateCompetitorBrands
);

// Reports routes
app.use('/api/reports', reportsRouter);

// Competitive analysis routes
app.use('/api/competitive', competitiveRouter);

// Notification routes
app.use('/api/notifications', notificationRouter);

// Conversation monitoring routes
app.use('/api/conversations', conversationRouter);

// Get active AI models endpoint
app.get('/api/ai-models', async (_req, res) => {
  try {
    const result = await CommonQueries.getActiveAIModels();
    res.json({
      models: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get AI models',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Protected AI models endpoint (admin only)
app.get('/api/admin/ai-models', 
  authenticate,
  authorize(['admin']),
  async (_req, res) => {
    try {
      const result = await CommonQueries.getActiveAIModels();
      res.json({
        models: result.rows,
        count: result.rowCount
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get AI models',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

// Basic API route
app.get('/api', (_req, res) => {
  res.json({ 
    message: 'LLM Brand Monitoring API is running!',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'GET /api/database/status - Database status',
      'GET /api/ai-models - Active AI models',
      'POST /api/auth/register - User registration',
      'POST /api/auth/login - User login',
      'POST /api/auth/refresh - Refresh token',
      'POST /api/auth/logout - Logout current session',
      'POST /api/auth/logout-all - Logout all sessions',
      'GET /api/auth/profile - Get user profile',
      'PUT /api/auth/profile - Update user profile',
      'GET /api/auth/sessions - Get user sessions',
      'DELETE /api/auth/sessions/:id - Revoke session'
    ]
  });
});

// Initialize database connection
const initializeDatabase = async (): Promise<void> => {
  try {
    await testConnection();
    console.log('📊 Database initialization completed');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (): Promise<void> => {
  console.log('🛑 Received shutdown signal, closing server...');
  
  try {
    await closePool();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const startServer = async (): Promise<void> => {
  try {
    await initializeDatabase();
    
    server.listen(PORT, () => {
      console.log(`🚀 Backend server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 API endpoint: http://localhost:${PORT}/api`);
      console.log(`🔌 Socket.IO enabled for real-time notifications`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;