import { Request, Response, NextFunction } from 'express';
import { AuthService, JWTPayload } from '../services/auth';
import { UserModel } from '../models/User';

// Extend Express Request interface to include user data
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      currentUser?: any; // Full user object from database
    }
  }
}

/**
 * Authentication middleware - verifies JWT token
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = AuthService.extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided'
      });
      return;
    }

    const payload = await AuthService.verifyAccessToken(token);

    if (!payload) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid or expired token'
      });
      return;
    }

    // Attach user payload to request
    req.user = payload;
    next();
  } catch (error) {
    res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = AuthService.extractTokenFromHeader(authHeader);

    if (token) {
      const payload = await AuthService.verifyAccessToken(token);
      if (payload) {
        req.user = payload;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Access denied',
        message: `Required role: ${allowedRoles.join(' or ')}`
      });
      return;
    }

    next();
  };
};

/**
 * Brand access authorization middleware
 */
export const authorizeBrandAccess = (requiredRole?: 'owner' | 'editor' | 'viewer') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      const brandId = req.params.brandId || req.body.brandId;
      
      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
        });
        return;
      }

      // Admin users have access to all brands
      if (req.user.role === 'admin') {
        next();
        return;
      }

      const hasAccess = await UserModel.hasAccessToBrand(
        req.user.userId,
        brandId,
        requiredRole
      );

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'Insufficient permissions for this brand'
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        error: 'Authorization error',
        message: 'Internal server error during authorization'
      });
    }
  };
};

/**
 * Load current user middleware - adds full user object to request
 */
export const loadCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user) {
      const user = await UserModel.findById(req.user.userId);
      if (user) {
        req.currentUser = UserModel.sanitize(user);
      }
    }
    next();
  } catch (error) {
    next(); // Continue without loading user
  }
};

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimit = (maxAttempts: number, windowMs: number) => {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    const clientAttempts = attempts.get(clientId);
    
    if (!clientAttempts || now > clientAttempts.resetTime) {
      attempts.set(clientId, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }
    
    if (clientAttempts.count >= maxAttempts) {
      res.status(429).json({
        error: 'Too many attempts',
        message: 'Please try again later',
        retryAfter: Math.ceil((clientAttempts.resetTime - now) / 1000)
      });
      return;
    }
    
    clientAttempts.count++;
    next();
  };
};

/**
 * Validate request body middleware
 */
export const validateRequestBody = (requiredFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      res.status(400).json({
        error: 'Validation error',
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
      return;
    }
    
    next();
  };
};

/**
 * Security headers middleware
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};