import { Request, Response } from 'express';
import { AuditService } from '../services/audit.service';
import { AuditAction } from '../types/database.types';

export class AuditController {
  /**
   * Get audit trail with filters
   */
  static async getAuditTrail(req: Request, res: Response): Promise<void> {
    try {
      const {
        actor,
        action,
        targetType,
        targetId,
        startDate,
        endDate,
        limit = 100,
        skip = 0
      } = req.query;

      // Only allow users to see their own audit logs unless they're admin
      const userId = (req as any).user?.userId;
      
      const filters: any = {
        userId, // Scope to current user
        limit: Number(limit),
        skip: Number(skip)
      };

      if (actor) filters.actor = actor as string;
      if (action) filters.action = action as AuditAction;
      if (targetType) filters.targetType = targetType as string;
      if (targetId) filters.targetId = targetId as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const result = await AuditService.getAuditTrail(filters);

      res.json({
        success: true,
        data: {
          logs: result.logs,
          pagination: {
            total: result.total,
            limit: Number(limit),
            skip: Number(skip),
            hasMore: result.total > Number(skip) + result.logs.length
          }
        }
      });
    } catch (error) {
      console.error('Error getting audit trail:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve audit trail'
        }
      });
    }
  }

  /**
   * Export audit data for compliance
   */
  static async exportAuditData(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, format = 'json' } = req.query;
      const userId = (req as any).user?.userId;

      const filters: any = { userId };
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (format) filters.format = format as 'json' | 'csv';

      const exportData = await AuditService.exportAuditData(filters);

      // Set appropriate content type and headers
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-export.csv"');
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="audit-export.json"');
      }

      res.send(exportData);
    } catch (error) {
      console.error('Error exporting audit data:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_FAILED',
          message: 'Failed to export audit data'
        }
      });
    }
  }

  /**
   * Get user activity patterns
   */
  static async getUserActivity(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { days = 30 } = req.query;
      const currentUserId = (req as any).user?.userId;

      // Users can only view their own activity unless they're admin
      if (userId !== currentUserId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only view your own activity patterns'
          }
        });
        return;
      }

      const activityPatterns = await AuditService.getUserActivityPatterns(
        userId,
        Number(days)
      );

      res.json({
        success: true,
        data: activityPatterns
      });
    } catch (error) {
      console.error('Error getting user activity:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve user activity patterns'
        }
      });
    }
  }

  /**
   * Detect security events
   */
  static async getSecurityEvents(req: Request, res: Response): Promise<void> {
    try {
      const { timeWindowHours = 24 } = req.query;

      const securityEvents = await AuditService.detectSecurityEvents(
        Number(timeWindowHours)
      );

      res.json({
        success: true,
        data: {
          events: securityEvents,
          timeWindow: `${timeWindowHours} hours`,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error detecting security events:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to detect security events'
        }
      });
    }
  }

  /**
   * Verify audit log integrity
   */
  static async verifyIntegrity(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const integrityResult = await AuditService.verifyIntegrity(
        filters.startDate,
        filters.endDate
      );

      res.json({
        success: true,
        data: {
          ...integrityResult,
          verifiedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error verifying integrity:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTEGRITY_CHECK_FAILED',
          message: 'Failed to verify audit log integrity'
        }
      });
    }
  }

  /**
   * Generate comprehensive compliance report
   */
  static async getComplianceReport(req: Request, res: Response): Promise<void> {
    try {
      const { userId, startDate, endDate } = req.query;
      const currentUserId = (req as any).user?.userId;

      // If userId is specified, ensure user can only access their own data
      const targetUserId = userId ? 
        (userId === currentUserId ? userId as string : null) : 
        currentUserId;

      if (userId && userId !== currentUserId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You can only generate reports for your own data'
          }
        });
        return;
      }

      const filters: any = {};
      if (targetUserId) filters.userId = targetUserId;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const complianceReport = await AuditService.generateComplianceReport(
        filters.userId,
        filters.startDate,
        filters.endDate
      );

      res.json({
        success: true,
        data: {
          ...complianceReport,
          generatedAt: new Date().toISOString(),
          generatedBy: (req as any).user?.email || 'Unknown'
        }
      });
    } catch (error) {
      console.error('Error generating compliance report:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REPORT_GENERATION_FAILED',
          message: 'Failed to generate compliance report'
        }
      });
    }
  }

  /**
   * Cleanup old audit logs (Admin only)
   */
  static async cleanupOldLogs(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Add admin role check
      const { retentionYears = 7 } = req.body;

      const cleanupResult = await AuditService.cleanupOldLogs(Number(retentionYears));

      // Log the cleanup action
      await AuditService.logAction(
        (req as any).user?.userId,
        (req as any).user?.email || 'System',
        AuditAction.DELETE,
        'AuditLog',
        {
          metadata: {
            operation: 'cleanup',
            retentionYears: Number(retentionYears),
            deletedCount: cleanupResult.deletedCount,
            compressedCount: cleanupResult.compressedCount
          },
          req
        }
      );

      res.json({
        success: true,
        data: {
          ...cleanupResult,
          retentionYears: Number(retentionYears),
          cleanupAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error cleaning up audit logs:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CLEANUP_FAILED',
          message: 'Failed to cleanup old audit logs'
        }
      });
    }
  }
}