import { Request, Response } from 'express';
import { BrandModel } from '../models/Brand';
import { UserModel } from '../models/User';
import { validateSchema, createBrandSchema, updateBrandSchema, paginationSchema } from '../models/validation';

export class BrandController {
  /**
   * Create a new brand
   */
  static async createBrand(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      const brandData = {
        ...req.body,
        created_by: req.user.userId
      };

      const validatedData = validateSchema<{
        name: string;
        domain?: string;
        industry?: string;
        description?: string;
        logo_url?: string;
        website_url?: string;
        monitoring_keywords?: string[];
        competitor_brands?: string[];
        created_by: string;
      }>(createBrandSchema, brandData);

      const brand = await BrandModel.create(validatedData);

      // Add creator as owner
      await BrandModel.addUser(brand.id, req.user.userId, 'owner');

      res.status(201).json({
        message: 'Brand created successfully',
        brand
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          res.status(409).json({
            error: 'Brand creation failed',
            message: error.message
          });
          return;
        }

        if (error.message.includes('Validation error')) {
          res.status(400).json({
            error: 'Validation failed',
            message: error.message
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Brand creation failed',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get all brands (admin) or user's brands
   */
  static async getBrands(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      const { limit, offset } = validateSchema<{
        limit?: number;
        offset?: number;
      }>(paginationSchema, req.query);

      let result;

      if (req.user.role === 'admin') {
        // Admin can see all brands
        result = await BrandModel.getAll(limit, offset);
        res.json({
          brands: result.brands,
          total: result.total,
          limit,
          offset
        });
      } else {
        // Regular users see only their brands
        const brandsResult = await UserModel.getBrands(req.user.userId);
        res.json({
          brands: brandsResult.rows,
          total: brandsResult.rowCount
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Validation error')) {
        res.status(400).json({
          error: 'Validation failed',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to get brands',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get brand by ID
   */
  static async getBrandById(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
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

      // Check if user has access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId);

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this brand'
        });
        return;
      }

      const brand = await BrandModel.findById(brandId);

      if (!brand) {
        res.status(404).json({
          error: 'Brand not found',
          message: 'Brand does not exist or has been deactivated'
        });
        return;
      }

      // Get brand statistics
      const statistics = await BrandModel.getStatistics(brandId);

      // Get brand users
      const usersResult = await BrandModel.getUsers(brandId);

      res.json({
        brand,
        statistics,
        users: usersResult.rows
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get brand',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update brand
   */
  static async updateBrand(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
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

      // Check if user has edit access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId, 'editor');

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You need editor or owner access to update this brand'
        });
        return;
      }

      const updatedBrand = await BrandModel.update(brandId, req.body);

      res.json({
        message: 'Brand updated successfully',
        brand: updatedBrand
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
            error: 'Brand not found',
            message: error.message
          });
          return;
        }

        if (error.message.includes('already exists')) {
          res.status(409).json({
            error: 'Update failed',
            message: error.message
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Failed to update brand',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete brand (soft delete)
   */
  static async deleteBrand(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
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

      // Check if user has owner access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId, 'owner');

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You need owner access to delete this brand'
        });
        return;
      }

      const deletedBrand = await BrandModel.softDelete(brandId);

      res.json({
        message: 'Brand deleted successfully',
        brand: deletedBrand
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({
          error: 'Brand not found',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to delete brand',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get brand users
   */
  static async getBrandUsers(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
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

      // Check if user has access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId);

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have access to this brand'
        });
        return;
      }

      const usersResult = await BrandModel.getUsers(brandId);

      res.json({
        users: usersResult.rows,
        total: usersResult.rowCount
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get brand users',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update monitoring keywords
   */
  static async updateMonitoringKeywords(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { keywords } = req.body;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
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

      if (!Array.isArray(keywords)) {
        res.status(400).json({
          error: 'Invalid keywords',
          message: 'Keywords must be an array'
        });
        return;
      }

      // Check if user has edit access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId, 'editor');

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You need editor or owner access to update monitoring keywords'
        });
        return;
      }

      const updatedBrand = await BrandModel.updateMonitoringKeywords(brandId, keywords);

      res.json({
        message: 'Monitoring keywords updated successfully',
        keywords: updatedBrand.monitoring_keywords
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Maximum')) {
          res.status(400).json({
            error: 'Too many keywords',
            message: error.message
          });
          return;
        }

        if (error.message.includes('not found')) {
          res.status(404).json({
            error: 'Brand not found',
            message: error.message
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Failed to update monitoring keywords',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update competitor brands
   */
  static async updateCompetitorBrands(req: Request, res: Response): Promise<void> {
    try {
      const { brandId } = req.params;
      const { competitors } = req.body;

      if (!brandId) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Brand ID is required'
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

      if (!Array.isArray(competitors)) {
        res.status(400).json({
          error: 'Invalid competitors',
          message: 'Competitors must be an array'
        });
        return;
      }

      // Check if user has edit access to this brand
      const hasAccess = req.user.role === 'admin' || 
        await UserModel.hasAccessToBrand(req.user.userId, brandId, 'editor');

      if (!hasAccess) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You need editor or owner access to update competitor brands'
        });
        return;
      }

      const updatedBrand = await BrandModel.updateCompetitorBrands(brandId, competitors);

      res.json({
        message: 'Competitor brands updated successfully',
        competitors: updatedBrand.competitor_brands
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Maximum')) {
          res.status(400).json({
            error: 'Too many competitors',
            message: error.message
          });
          return;
        }

        if (error.message.includes('not found')) {
          res.status(404).json({
            error: 'Brand not found',
            message: error.message
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Failed to update competitor brands',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Search brands
   */
  static async searchBrands(req: Request, res: Response): Promise<void> {
    try {
      const { q: searchTerm, limit = 20 } = req.query;

      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
        return;
      }

      if (!searchTerm || typeof searchTerm !== 'string') {
        res.status(400).json({
          error: 'Invalid search term',
          message: 'Search term is required'
        });
        return;
      }

      let brands;

      if (req.user.role === 'admin') {
        // Admin can search all brands
        brands = await BrandModel.search(searchTerm, Number(limit));
      } else {
        // Regular users can only search their brands
        const userBrands = await UserModel.getBrands(req.user.userId);
        brands = userBrands.rows.filter((brand: any) => 
          brand.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (brand.domain && brand.domain.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (brand.description && brand.description.toLowerCase().includes(searchTerm.toLowerCase()))
        ).slice(0, Number(limit));
      }

      res.json({
        brands,
        total: brands.length
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to search brands',
        message: 'Internal server error'
      });
    }
  }
}