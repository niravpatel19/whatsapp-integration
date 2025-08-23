import mongoose, { Document, Schema, Model } from 'mongoose';
import crypto from 'crypto';
import { AuditAction, FIELD_LIMITS } from '../types/database.types';

// Interface for AuditLog document
export interface IAuditLog extends Document {
  userId: mongoose.Types.ObjectId;
  actor: string; // User email or API key identifier
  action: AuditAction;
  targetType: string; // e.g., 'User', 'Session', 'Message', 'APIKey'
  targetId?: string; // ID of the target resource
  metadata?: Record<string, any>; // Additional context data
  ipAddress?: string;
  userAgent?: string;
  previousHash?: string; // Hash of previous audit log for integrity chain
  hash: string; // Hash of current audit log for integrity
  createdAt: Date;
}

// Interface for AuditLog model (static methods)
export interface IAuditLogModel extends Model<IAuditLog> {
  logAction(auditData: {
    userId: string;
    actor: string;
    action: AuditAction;
    targetType: string;
    targetId?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<IAuditLog>;

  getAuditTrail(filters: {
    userId?: string;
    actor?: string;
    action?: AuditAction;
    targetType?: string;
    targetId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
  }): Promise<{
    logs: IAuditLog[];
    total: number;
  }>;

  exportAuditData(filters: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    format?: 'json' | 'csv';
  }): Promise<string>;

  cleanupOldLogs(retentionYears?: number): Promise<{
    deletedCount: number;
    compressedCount: number;
  }>;

  getUserActivityPatterns(
    userId: string,
    days?: number
  ): Promise<{
    totalActions: number;
    actionsByType: Record<string, number>;
    dailyActivity: Array<{ date: string; count: number }>;
    suspiciousPatterns: string[];
  }>;

  detectSecurityEvents(timeWindowHours?: number): Promise<
    Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
      affectedUsers: string[];
      count: number;
    }>
  >;

  verifyIntegrity(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    isValid: boolean;
    corruptedLogs: string[];
    totalChecked: number;
  }>;
}

// AuditLog schema definition
const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    actor: {
      type: String,
      required: [true, 'Actor is required'],
      trim: true,
      maxlength: [FIELD_LIMITS.EMAIL_MAX, 'Actor cannot exceed 254 characters'],
    },
    action: {
      type: String,
      enum: Object.values(AuditAction),
      required: [true, 'Action is required'],
      index: true,
    },
    targetType: {
      type: String,
      required: [true, 'Target type is required'],
      trim: true,
      maxlength: [50, 'Target type cannot exceed 50 characters'],
      index: true,
    },
    targetId: {
      type: String,
      trim: true,
      maxlength: [100, 'Target ID cannot exceed 100 characters'],
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: [45, 'IP address cannot exceed 45 characters'], // IPv6 max length
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, 'User agent cannot exceed 500 characters'],
    },
    previousHash: {
      type: String,
      length: [64, 'Previous hash must be 64 characters'], // SHA-256 hex length
    },
    hash: {
      type: String,
      required: [true, 'Hash is required'],
      length: [64, 'Hash must be 64 characters'], // SHA-256 hex length
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only createdAt for audit logs
    collection: 'audit_logs',
  }
);

// Indexes for efficient querying
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ createdAt: -1 }); // For cleanup operations
AuditLogSchema.index({ actor: 1, createdAt: -1 });

// TTL index for automatic cleanup after 7 years (2557 days)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2557 * 24 * 60 * 60 });

// Helper function to generate hash for integrity chain
function generateHash(data: string, previousHash?: string): string {
  const content = previousHash ? `${previousHash}:${data}` : data;
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Static Methods
AuditLogSchema.statics['logAction'] = async function (auditData: {
  userId: string;
  actor: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<IAuditLog> {
  // Get the last audit log for hash chaining
  const lastLog = await this.findOne({}, {}, { sort: { createdAt: -1 } });

  // Create hash content
  const hashContent = JSON.stringify({
    userId: auditData.userId,
    actor: auditData.actor,
    action: auditData.action,
    targetType: auditData.targetType,
    targetId: auditData.targetId,
    metadata: auditData.metadata,
    timestamp: new Date().toISOString(),
  });

  // Generate hash with chaining
  const hash = generateHash(hashContent, lastLog?.hash);

  // Create audit log
  const auditLog = new this({
    userId: new mongoose.Types.ObjectId(auditData.userId),
    actor: auditData.actor,
    action: auditData.action,
    targetType: auditData.targetType,
    targetId: auditData.targetId,
    metadata: auditData.metadata || {},
    ipAddress: auditData.ipAddress,
    userAgent: auditData.userAgent,
    previousHash: lastLog?.hash,
    hash,
  });

  return await auditLog.save();
};

AuditLogSchema.statics['getAuditTrail'] = async function (filters: {
  userId?: string;
  actor?: string;
  action?: AuditAction;
  targetType?: string;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  skip?: number;
}): Promise<{ logs: IAuditLog[]; total: number }> {
  const query: any = {};

  // Build query filters
  if (filters.userId) {
    query.userId = new mongoose.Types.ObjectId(filters.userId);
  }
  if (filters.actor) {
    query.actor = { $regex: filters.actor, $options: 'i' };
  }
  if (filters.action) {
    query.action = filters.action;
  }
  if (filters.targetType) {
    query.targetType = filters.targetType;
  }
  if (filters.targetId) {
    query.targetId = filters.targetId;
  }
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      query.createdAt.$gte = filters.startDate;
    }
    if (filters.endDate) {
      query.createdAt.$lte = filters.endDate;
    }
  }

  // Execute query with pagination
  const [logs, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 100)
      .skip(filters.skip || 0)
      .populate('userId', 'email name'),
    this.countDocuments(query),
  ]);

  return { logs, total };
};

AuditLogSchema.statics['exportAuditData'] = async function (filters: {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  format?: 'json' | 'csv';
}): Promise<string> {
  const query: any = {};

  if (filters.userId) {
    query.userId = new mongoose.Types.ObjectId(filters.userId);
  }
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      query.createdAt.$gte = filters.startDate;
    }
    if (filters.endDate) {
      query.createdAt.$lte = filters.endDate;
    }
  }

  const logs = await this.find(query)
    .sort({ createdAt: -1 })
    .populate('userId', 'email name')
    .lean();

  if (filters.format === 'csv') {
    // Convert to CSV format
    const headers = [
      'Date',
      'User',
      'Actor',
      'Action',
      'Target Type',
      'Target ID',
      'IP Address',
      'User Agent',
    ];
    const csvRows = [headers.join(',')];

    logs.forEach((log: any) => {
      const row = [
        log.createdAt.toISOString(),
        (log.userId as any)?.email || 'Unknown',
        log.actor,
        log.action,
        log.targetType,
        log.targetId || '',
        log.ipAddress || '',
        log.userAgent ? `"${log.userAgent.replace(/"/g, '""')}"` : '',
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  } else {
    // Return JSON format
    return JSON.stringify(logs, null, 2);
  }
};

AuditLogSchema.statics['cleanupOldLogs'] = async function (retentionYears: number = 7): Promise<{
  deletedCount: number;
  compressedCount: number;
}> {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

  // For now, we'll just delete old logs
  // In a production system, you might want to compress and archive them
  const deleteResult = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
  });

  return {
    deletedCount: deleteResult.deletedCount || 0,
    compressedCount: 0, // Placeholder for future compression implementation
  };
};

AuditLogSchema.statics['getUserActivityPatterns'] = async function (
  userId: string,
  days: number = 30
): Promise<{
  totalActions: number;
  actionsByType: Record<string, number>;
  dailyActivity: Array<{ date: string; count: number }>;
  suspiciousPatterns: string[];
}> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Get total actions
  const totalActions = await this.countDocuments({
    userId: userObjectId,
    createdAt: { $gte: startDate },
  });

  // Get actions by type
  const actionsByTypeResult = await this.aggregate([
    {
      $match: {
        userId: userObjectId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
      },
    },
  ]);

  const actionsByType: Record<string, number> = {};
  actionsByTypeResult.forEach((item) => {
    actionsByType[item._id] = item.count;
  });

  // Get daily activity
  const dailyActivityResult = await this.aggregate([
    {
      $match: {
        userId: userObjectId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
          },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const dailyActivity = dailyActivityResult.map((item) => ({
    date: item._id,
    count: item.count,
  }));

  // Detect suspicious patterns
  const suspiciousPatterns: string[] = [];

  // Check for unusual login frequency
  const loginCount = actionsByType[AuditAction.LOGIN] || 0;
  if (loginCount > days * 5) {
    // More than 5 logins per day on average
    suspiciousPatterns.push('High frequency login attempts');
  }

  // Check for API key generation spikes
  const apiKeyGenCount = actionsByType[AuditAction.API_KEY_GENERATED] || 0;
  if (apiKeyGenCount > 10) {
    suspiciousPatterns.push('Excessive API key generation');
  }

  // Check for unusual activity patterns (e.g., activity at odd hours)
  const hourlyActivity = await this.aggregate([
    {
      $match: {
        userId: userObjectId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: { $hour: '$createdAt' },
        count: { $sum: 1 },
      },
    },
  ]);

  const nightActivity = hourlyActivity
    .filter((item) => item._id >= 0 && item._id <= 5) // 12 AM to 5 AM
    .reduce((sum, item) => sum + item.count, 0);

  if (nightActivity > totalActions * 0.3) {
    // More than 30% activity at night
    suspiciousPatterns.push('Unusual activity during night hours');
  }

  return {
    totalActions,
    actionsByType,
    dailyActivity,
    suspiciousPatterns,
  };
};

AuditLogSchema.statics['detectSecurityEvents'] = async function (
  timeWindowHours: number = 24
): Promise<
  Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    affectedUsers: string[];
    count: number;
  }>
> {
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - timeWindowHours);

  const securityEvents: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    affectedUsers: string[];
    count: number;
  }> = [];

  // Detect multiple failed login attempts
  const failedLogins = await this.aggregate([
    {
      $match: {
        action: AuditAction.LOGIN,
        createdAt: { $gte: startTime },
        'metadata.success': false,
      },
    },
    {
      $group: {
        _id: '$actor',
        count: { $sum: 1 },
        userId: { $first: '$userId' },
      },
    },
    {
      $match: { count: { $gte: 5 } },
    },
  ]);

  if (failedLogins.length > 0) {
    securityEvents.push({
      type: 'MULTIPLE_FAILED_LOGINS',
      description: 'Multiple failed login attempts detected',
      severity: 'high',
      affectedUsers: failedLogins.map((item) => item._id),
      count: failedLogins.reduce((sum, item) => sum + item.count, 0),
    });
  }

  // Detect unusual API key generation
  const apiKeyGeneration = await this.aggregate([
    {
      $match: {
        action: AuditAction.API_KEY_GENERATED,
        createdAt: { $gte: startTime },
      },
    },
    {
      $group: {
        _id: '$userId',
        count: { $sum: 1 },
        actor: { $first: '$actor' },
      },
    },
    {
      $match: { count: { $gte: 5 } },
    },
  ]);

  if (apiKeyGeneration.length > 0) {
    securityEvents.push({
      type: 'EXCESSIVE_API_KEY_GENERATION',
      description: 'Excessive API key generation detected',
      severity: 'medium',
      affectedUsers: apiKeyGeneration.map((item) => item.actor),
      count: apiKeyGeneration.reduce((sum, item) => sum + item.count, 0),
    });
  }

  // Detect unusual IP address patterns
  const ipPatterns = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startTime },
        ipAddress: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: {
          userId: '$userId',
          ipAddress: '$ipAddress',
        },
        count: { $sum: 1 },
        actor: { $first: '$actor' },
      },
    },
    {
      $group: {
        _id: '$_id.userId',
        ipCount: { $sum: 1 },
        actor: { $first: '$actor' },
      },
    },
    {
      $match: { ipCount: { $gte: 5 } },
    },
  ]);

  if (ipPatterns.length > 0) {
    securityEvents.push({
      type: 'MULTIPLE_IP_ADDRESSES',
      description: 'User accessing from multiple IP addresses',
      severity: 'low',
      affectedUsers: ipPatterns.map((item) => item.actor),
      count: ipPatterns.length,
    });
  }

  return securityEvents;
};

AuditLogSchema.statics['verifyIntegrity'] = async function (
  startDate?: Date,
  endDate?: Date
): Promise<{
  isValid: boolean;
  corruptedLogs: string[];
  totalChecked: number;
}> {
  const query: any = {};
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  const logs = await this.find(query).sort({ createdAt: 1 }).lean();

  const corruptedLogs: string[] = [];
  let previousHash: string | undefined;

  for (const log of logs) {
    // Recreate hash content
    const hashContent = JSON.stringify({
      userId: log.userId.toString(),
      actor: log.actor,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      metadata: log.metadata,
      timestamp: log.createdAt.toISOString(),
    });

    // Verify hash
    const expectedHash = generateHash(hashContent, previousHash);

    if (log.hash !== expectedHash) {
      corruptedLogs.push(log._id.toString());
    }

    // Verify chain integrity
    if (log.previousHash !== previousHash) {
      corruptedLogs.push(log._id.toString());
    }

    previousHash = log.hash;
  }

  return {
    isValid: corruptedLogs.length === 0,
    corruptedLogs,
    totalChecked: logs.length,
  };
};

// Create and export the model
export const AuditLog: IAuditLogModel = mongoose.model<IAuditLog, IAuditLogModel>(
  'AuditLog',
  AuditLogSchema
);
