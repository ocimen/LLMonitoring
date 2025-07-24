import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { BrandModel } from '../models/Brand';
import { validateSchema, updateUserSchema, paginationSchema } from '../models/validation';

export class UserController {
  /**
   * Get all users (admin only)
   */
  static async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const { limit, offset } = validateSchema<{
        limit?: number;
        offset?: number;
      }>(paginationSchema, req.query);

      const result = await UserModel.getAll(limit, offset);

      res.json({
        users: result.users.map(user => UserModel.sanitize(user)),
        total: result.total,
        limit,
        offset
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Validation error')) {
        res.status(400).json({
          error: 'Validation failed',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to get users',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get user by ID (admin or self)
   */
  static async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'User ID is required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check if user is admin or requesting their own profile
      if (req.user.role !== 'admin' && req.user.userId !== userId) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You can only access your own profile'
        });
        return;
      }

      const user = await UserModel.findById(userId);

      if (!user) {
        res.status(404).json({
          error: 'User not found',
          message: 'User does not exist or has been deactivated'
        });
        return;
      }

      // Get user's brands
      const brandsResult = await UserModel.getBrands(userId);

      res.json({
        user: UserModel.sanitize(user),
        brands: brandsResult.rows
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get user',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update user (admin or self)
   */
  static async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'User ID is required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check permissions
      const canUpdate = req.user.role === 'admin' || req.user.userId === userId;
      if (!canUpdate) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You can only update your own profile'
        });
        return;
      }

      // Non-admin users cannot change their role
      if (req.user.role !== 'admin' && req.body.role) {
        delete req.body.role;
      }

      // Non-admin users cannot change is_active status
      if (req.user.role !== 'admin' && req.body.is_active !== undefined) {
        delete req.body.is_active;
      }

      const updatedUser = await UserModel.update(userId, req.body);

      res.json({
        message: 'User updated successfully',
        user: UserModel.sanitize(updatedUser)
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Validation error')) {
          res.status(400).json({
            error: 'Validation failed',
            message: error.message
          });
          return;
        }

        if (error.message.includes('not found')) {
          res.status(404).json({
            error: 'User not found',
            message: error.message
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Failed to update user',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Deactivate user (admin only)
   */
  static async deactivateUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'User ID is required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Prevent self-deactivation
      if (req.user.userId === userId) {
        res.status(400).json({
          error: 'Invalid operation',
          message: 'You cannot deactivate your own account'
        });
        return;
      }

      const deactivatedUser = await UserModel.softDelete(userId);

      res.json({
        message: 'User deactivated successfully',
        user: UserModel.sanitize(deactivatedUser)
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: 'User not found',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to deactivate user',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get user's brands
   */
  static async getUserBrands(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'User ID is required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check permissions
      const canView = req.user.role === 'admin' || req.user.userId === userId;
      if (!canView) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You can only view your own brands'
        });
        return;
      }

      const brandsResult = await UserModel.getBrands(userId);

      res.json({
        brands: brandsResult.rows,
        total: brandsResult.rowCount
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get user brands',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Add user to brand (admin or brand owner)
   */
  static async addUserToBrand(req: Request, res: Response): Promise<void> {
    try {
      const { userId, brandId } = req.params;
      const { role = 'viewer' } = req.body;

      if (!userId || !brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'User ID and Brand ID are required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Validate role
      if (!['owner', 'editor', 'viewer'].includes(role)) {
        res.status(400).json({
          error: 'Invalid role',
          message: 'Role must be owner, editor, or viewer'
        });
        return;
      }

      // Check if user has permission to add users to this brand
      const canAddUser = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId, 'owner');

      if (!canAddUser) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You must be an admin or brand owner to add users'
        });
        return;
      }

      // Check if target user exists
      const targetUser = await UserModel.findById(userId);
      if (!targetUser) {
        res.status(404).json({
          error: 'User not found',
          message: 'Target user does not exist'
        });
        return;
      }

      // Check if brand exists
      const brand = await BrandModel.findById(brandId);
      if (!brand) {
        res.status(404).json({
          error: 'Brand not found',
          message: 'Brand does not exist'
        });
        return;
      }

      await BrandModel.addUser(brandId, userId, role);

      res.json({
        message: 'User added to brand successfully',
        user: UserModel.sanitize(targetUser),
        brand: brand.name,
        role
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to add user to brand',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Remove user from brand (admin or brand owner)
   */
  static async removeUserFromBrand(req: Request, res: Response): Promise<void> {
    try {
      const { userId, brandId } = req.params;

      if (!userId || !brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'User ID and Brand ID are required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Check if user has permission to remove users from this brand
      const canRemoveUser = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId, 'owner');

      if (!canRemoveUser) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You must be an admin or brand owner to remove users'
        });
        return;
      }

      // Prevent removing self if they're the only owner
      if (req.user.userId === userId) {
        // Check if user is the only owner
        const brandUsers = await BrandModel.getUsers(brandId);
        const owners = brandUsers.rows.filter((u: any) => u.brand_role === 'owner');
        
        if (owners.length === 1) {
          res.status(400).json({
            error: 'Invalid operation',
            message: 'Cannot remove the only owner from a brand'
          });
          return;
        }
      }

      await BrandModel.removeUser(brandId, userId);

      res.json({
        message: 'User removed from brand successfully'
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: 'Association not found',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to remove user from brand',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update user role in brand (admin or brand owner)
   */
  static async updateUserBrandRole(req: Request, res: Response): Promise<void> {
    try {
      const { userId, brandId } = req.params;
      const { role } = req.body;

      if (!userId || !brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'User ID and Brand ID are required'
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      // Validate role
      if (!['owner', 'editor', 'viewer'].includes(role)) {
        res.status(400).json({
          error: 'Invalid role',
          message: 'Role must be owner, editor, or viewer'
        });
        return;
      }

      // Check permissions
      const canUpdateRole = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId, 'owner');

      if (!canUpdateRole) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You must be an admin or brand owner to update user roles'
        });
        return;
      }

      // Prevent demoting self if they're the only owner
      if (req.user.userId === userId && role !== 'owner') {
        const brandUsers = await BrandModel.getUsers(brandId);
        const owners = brandUsers.rows.filter((u: any) => u.brand_role === 'owner');
        
        if (owners.length === 1) {
          res.status(400).json({
            error: 'Invalid operation',
            message: 'Cannot demote the only owner of a brand'
          });
          return;
        }
      }

      await BrandModel.addUser(brandId, userId, role); // This will update existing role

      res.json({
        message: 'User role updated successfully',
        role
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to update user role',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Search users (admin only)
   */
  static async searchUsers(req: Request, res: Response): Promise<void> {
    try {
      const { q: searchTerm, limit = 20 } = req.query;

      if (!searchTerm || typeof searchTerm !== 'string') {
        res.status(400).json({
          error: 'Invalid search term',
          message: 'Search term is required'
        });
        return;
      }

      // Simple search implementation - in production, you might want more sophisticated search
      const result = await UserModel.getAll(Number(limit), 0);
      const filteredUsers = result.users.filter(user => 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.last_name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      res.json({
        users: filteredUsers.map(user => UserModel.sanitize(user)),
        total: filteredUsers.length
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to search users',
        message: 'Internal server error'
      });
    }
  }
}