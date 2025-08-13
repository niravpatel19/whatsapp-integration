import { AuditLog, IAuditLog } from '../models/AuditLog.model';
import { AuditAction } from '../types/database.types';
import { Request } from 'express';

export class AuditService {
  /**
   * Log an audit action with automatic IP and User-Agent extraction from request
   */
  static async logAction(
    userId: string,
    actor: string,
    action: AuditAction,
    targetType: string,
    options: {
      targetId?: string;
      metadata?: Record<string, any>;
      req?: Request;
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<IAuditLog> {
    
    // Extract IP address and User-Agent from request if provided
    let ipAddress = options.ipAddress;
    let userAgent = options.userAgent;
    
    if (options.req) {
      // Get real IP address (considering proxies)
      ipAddress = ipAddress || 
        (options.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        (options.req.headers['x-real-ip'] as string) ||
        options.req.connection.remoteAddress ||
        options.req.socket.remoteAddress;
      
      userAgent = userAgent || options.req.headers['user-agent'];
    }
    
    const auditData: any = {
      userId,
      actor,
      action,
      targetType,
      ipAddress,
      userAgent
    };
    
    if (options.targetId !== undefined) {
      auditData.targetId = options.targetId;
    }
    
    if (options.metadata !== undefined) {
      auditData.metadata = options.metadata;
    }
    
    return await AuditLog.logAction(auditData);
  }
  
  /**
   * Log user login attempt
   */
  static async logLogin(
    userId: string,
    email: string,
    success: boolean,
    req?: Request,
    metadata?: Record<string, any>
  ): Promise<IAuditLog> {
    return await this.logAction(
      userId,
      email,
      AuditAction.LOGIN,
      'User',
      {
        targetId: userId,
        metadata: {
          success,
          ...(metadata || {})
        },
        ...(req && { req })
      }
    );
  }
  
  /**
   * Log user logout
   */
  static async logLogout(
    userId: string,
    email: string,
    req?: Request
  ): Promise<IAuditLog> {
    return await this.logAction(
      userId,
      email,
      AuditAction.LOGOUT,
      'User',
      {
        targetId: userId,
        ...(req && { req })
      }
    );
  }
  
  /**
   * Log API key generation
   */
  static async logAPIKeyGenerated(
    userId: string,
    actor: string,
    apiKeyId: string,
    label?: string,
    req?: Request
  ): Promise<IAuditLog> {
    return await this.logAction(
      userId,
      actor,
      AuditAction.API_KEY_GENERATED,
      'APIKey',
      {
        targetId: apiKeyId,
        metadata: {
          label
        },
        ...(req && { req })
      }
    );
  }
  
  /**
   * Log session creation
   */
  static async logSessionCreated(
    userId: string,
    actor: string,
    sessionId: string,
    deviceName?: string,
    req?: Request
  ): Promise<IAuditLog> {
    return await this.logAction(
      userId,
      actor,
      AuditAction.SESSION_CREATED,
      'Session',
      {
        targetId: sessionId,
        metadata: {
          deviceName
        },
        ...(req && { req })
      }
    );
  }
  
  /**
   * Log message sent
   */
  static async logMessageSent(
    userId: string,
    actor: string,
    messageId: string,
    to: string,
    messageType: string,
    req?: Request
  ): Promise<IAuditLog> {
    return await this.logAction(
      userId,
      actor,
      AuditAction.MESSAGE_SENT,
      'Message',
      {
        targetId: messageId,
        metadata: {
          to,
          messageType
        },
        ...(req && { req })
      }
    );
  }
  
  /**
   * Log resource creation
   */
  static async logCreate(
    userId: string,
    actor: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, any>,
    req?: Request
  ): Promise<IAuditLog> {
    return await this.logAction(
      userId,
      actor,
      AuditAction.CREATE,
      targetType,
      {
        targetId,
        ...(metadata && { metadata }),
        ...(req && { req })
      }
    );
  }
  
  /**
   * Log resource update
   */
  static async logUpdate(
    userId: string,
    actor: string,
    targetType: string,
    targetId: string,
    changes?: Record<string, any>,
    req?: Request
  ): Promise<IAuditLog> {
    return await this.logAction(
      userId,
      actor,
      AuditAction.UPDATE,
      targetType,
      {
        targetId,
        metadata: {
          changes
        },
        ...(req && { req })
      }
    );
  }
  
  /**
   * Log resource deletion
   */
  static async logDelete(
    userId: string,
    actor: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, any>,
    req?: Request
  ): Promise<IAuditLog> {
    return await this.logAction(
      userId,
      actor,
      AuditAction.DELETE,
      targetType,
      {
        targetId,
        ...(metadata && { metadata }),
        ...(req && { req })
      }
    );
  }
  
  /**
   * Get audit trail with filters
   */
  static async getAuditTrail(filters: {
    userId?: string;
    actor?: string;
    action?: AuditAction;
    targetType?: string;
    targetId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
  }) {
    return await AuditLog.getAuditTrail(filters);
  }
  
  /**
   * Export audit data for compliance
   */
  static async exportAuditData(filters: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    format?: 'json' | 'csv';
  }): Promise<string> {
    return await AuditLog.exportAuditData(filters);
  }
  
  /**
   * Get user activity patterns for analysis
   */
  static async getUserActivityPatterns(userId: string, days?: number) {
    return await AuditLog.getUserActivityPatterns(userId, days);
  }
  
  /**
   * Detect security events
   */
  static async detectSecurityEvents(timeWindowHours?: number) {
    return await AuditLog.detectSecurityEvents(timeWindowHours);
  }
  
  /**
   * Verify audit log integrity
   */
  static async verifyIntegrity(startDate?: Date, endDate?: Date) {
    return await AuditLog.verifyIntegrity(startDate, endDate);
  }
  
  /**
   * Cleanup old audit logs
   */
  static async cleanupOldLogs(retentionYears?: number) {
    return await AuditLog.cleanupOldLogs(retentionYears);
  }
  
  /**
   * Generate compliance report
   */
  static async generateComplianceReport(
    userId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    summary: {
      totalLogs: number;
      uniqueUsers: number;
      actionBreakdown: Record<string, number>;
      timeRange: { start: Date; end: Date };
    };
    securityEvents: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      affectedUsers: string[];
      count: number;
    }>;
    integrityCheck: {
      isValid: boolean;
      corruptedLogs: string[];
      totalChecked: number;
    };
    exportData: string;
  }> {
    
    // Set default date range if not provided
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - (90 * 24 * 60 * 60 * 1000)); // 90 days ago
    
    // Get audit trail summary
    const auditTrailFilters: any = {
      startDate: start,
      endDate: end,
      limit: 10000 // Large limit for summary
    };
    
    if (userId) {
      auditTrailFilters.userId = userId;
    }
    
    const auditTrail = await AuditLog.getAuditTrail(auditTrailFilters);
    
    // Calculate action breakdown
    const actionBreakdown: Record<string, number> = {};
    const uniqueUsers = new Set<string>();
    
    auditTrail.logs.forEach(log => {
      actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
      uniqueUsers.add(log.actor);
    });
    
    // Get security events
    const securityEvents = await AuditLog.detectSecurityEvents(24 * 7); // Last 7 days
    
    // Verify integrity
    const integrityCheck = await AuditLog.verifyIntegrity(start, end);
    
    // Export data
    const exportFilters: any = {
      startDate: start,
      endDate: end,
      format: 'json'
    };
    
    if (userId) {
      exportFilters.userId = userId;
    }
    
    const exportData = await AuditLog.exportAuditData(exportFilters);
    
    return {
      summary: {
        totalLogs: auditTrail.total,
        uniqueUsers: uniqueUsers.size,
        actionBreakdown,
        timeRange: { start, end }
      },
      securityEvents,
      integrityCheck,
      exportData
    };
  }
}