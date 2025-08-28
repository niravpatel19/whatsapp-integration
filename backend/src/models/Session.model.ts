import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  SessionStatus,
  DeviceInfo,
  VALIDATION_PATTERNS,
  FIELD_LIMITS,
} from '../types/database.types';

// Interface for Session document
export interface ISession extends Document {
  userId: Types.ObjectId;
  sessionId: string;
  status: SessionStatus;
  deviceInfo?: DeviceInfo;
  phone?: string;
  lastSeenAt?: Date;
  wppState?: any;
  metadata?: any; // Custom metadata for third-party integrations
  config?: any; // Configuration data for the session
  createdAt: Date;
  updatedAt: Date;

  // Statistics
  messageCount: number;
  connectionDuration: number; // in seconds
  errorCount: number;
  lastErrorAt?: Date;
  lastErrorMessage?: string;

  // Notification tracking
  lastNotificationSent?: Date;
  notificationsSuppressed?: boolean;

  // Instance methods
  updateStatus(newStatus: SessionStatus, error?: string): Promise<void>;
  updateDeviceInfo(deviceInfo: DeviceInfo): Promise<void>;
  markLastSeen(): Promise<void>;
  incrementMessageCount(): Promise<void>;
  incrementErrorCount(errorMessage?: string): Promise<void>;
  calculateConnectionDuration(): number;
  isExpired(): boolean;
}

// Interface for Session model (static methods)
export interface ISessionModel extends Model<ISession> {
  createSession(
    userId: string,
    deviceName?: string,
    metadata?: any,
    config?: any
  ): Promise<ISession>;
  getUserSessions(userId: string, includeExpired?: boolean): Promise<ISession[]>;
  getSessionBySessionId(sessionId: string, userId: string): Promise<ISession | null>;
  updateStatus(
    sessionId: string,
    newStatus: SessionStatus,
    error?: string
  ): Promise<ISession | null>;
  expireSession(sessionId: string, userId: string): Promise<ISession | null>;
  cleanupExpiredSessions(): Promise<number>;
  getSessionStatistics(userId: string): Promise<{
    total: number;
    active: number;
    connected: number;
    expired: number;
    totalMessages: number;
    totalErrors: number;
  }>;
  rehydrateActiveSessions(): Promise<ISession[]>;
}

// Device info sub-schema
const DeviceInfoSchema = new Schema<DeviceInfo>(
  {
    name: {
      type: String,
      required: [true, 'Device name is required'],
      trim: true,
      maxlength: [FIELD_LIMITS.NAME_MAX, 'Device name cannot exceed 100 characters'],
    },
    platform: {
      type: String,
      required: [true, 'Platform is required'],
      trim: true,
      maxlength: [50, 'Platform cannot exceed 50 characters'],
    },
    version: {
      type: String,
      required: [true, 'Version is required'],
      trim: true,
      maxlength: [50, 'Version cannot exceed 50 characters'],
    },
    browser: {
      type: String,
      trim: true,
      maxlength: [50, 'Browser cannot exceed 50 characters'],
    },
    os: {
      type: String,
      trim: true,
      maxlength: [50, 'OS cannot exceed 50 characters'],
    },
  },
  { _id: false }
);

// Session schema definition
const SessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    sessionId: {
      type: String,
      required: [true, 'Session ID is required'],
      validate: {
        validator: function (sessionId: string) {
          return VALIDATION_PATTERNS.UUID.test(sessionId);
        },
        message: 'Session ID must be a valid UUID',
      },
    },
    status: {
      type: String,
      enum: Object.values(SessionStatus),
      default: SessionStatus.PENDING,
      required: [true, 'Status is required'],
    },
    deviceInfo: {
      type: DeviceInfoSchema,
      required: false,
    },
    phone: {
      type: String,
      validate: {
        validator: function (phone: string) {
          if (!phone) return true;
          return VALIDATION_PATTERNS.PHONE_E164.test(phone);
        },
        message: 'Phone number must be in E.164 format',
      },
      maxlength: [FIELD_LIMITS.PHONE_MAX, 'Phone number cannot exceed 20 characters'],
    },
    lastSeenAt: {
      type: Date,
    },
    wppState: {
      type: Schema.Types.Mixed, // Flexible JSON for WPPConnect state
      select: false, // Don't include by default for performance
    },
    metadata: {
      type: Schema.Types.Mixed, // Custom metadata for third-party integrations
      default: {},
    },
    config: {
      type: Schema.Types.Mixed, // Configuration data for the session
      default: {},
    },

    // Statistics
    messageCount: {
      type: Number,
      default: 0,
      min: [0, 'Message count cannot be negative'],
    },
    connectionDuration: {
      type: Number,
      default: 0,
      min: [0, 'Connection duration cannot be negative'],
    },
    errorCount: {
      type: Number,
      default: 0,
      min: [0, 'Error count cannot be negative'],
    },
    lastErrorAt: {
      type: Date,
    },
    lastErrorMessage: {
      type: String,
      maxlength: [500, 'Error message cannot exceed 500 characters'],
    },

    // Notification tracking
    lastNotificationSent: {
      type: Date,
    },
    notificationsSuppressed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: 'sessions',
  }
);

// Indexes
SessionSchema.index({ sessionId: 1 }, { unique: true });
SessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
SessionSchema.index({ userId: 1, status: 1 });
SessionSchema.index({ userId: 1, createdAt: -1 });
SessionSchema.index({ status: 1, updatedAt: 1 }); // For cleanup queries
SessionSchema.index({ sessionId: 1 }, { unique: true });

// TTL indexes for automatic cleanup
SessionSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 24 * 60 * 60, // 24 hours
    partialFilterExpression: { status: SessionStatus.QR },
  }
);

SessionSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 7 * 24 * 60 * 60, // 7 days
    partialFilterExpression: { status: SessionStatus.DISCONNECTED },
  }
);

// Instance Methods
SessionSchema.methods.updateStatus = async function (
  newStatus: SessionStatus,
  error?: string
): Promise<void> {
  const oldStatus = this.status;
  this.status = newStatus;

  // Update connection duration if transitioning from CONNECTED
  if (oldStatus === SessionStatus.CONNECTED && newStatus !== SessionStatus.CONNECTED) {
    const connectionStart = this.lastSeenAt || this.updatedAt;
    const connectionEnd = new Date();
    const duration = Math.floor((connectionEnd.getTime() - connectionStart.getTime()) / 1000);
    this.connectionDuration += duration;
  }

  // Set lastSeenAt for CONNECTED status
  if (newStatus === SessionStatus.CONNECTED) {
    this.lastSeenAt = new Date();
  }

  // Handle error status
  if (newStatus === SessionStatus.ERROR && error) {
    this.lastErrorAt = new Date();
    this.lastErrorMessage = error;
    this.errorCount += 1;
  }

  await this.save();
};

SessionSchema.methods.updateDeviceInfo = async function (deviceInfo: DeviceInfo): Promise<void> {
  this.deviceInfo = deviceInfo;
  await this.save();
};

SessionSchema.methods.markLastSeen = async function (): Promise<void> {
  this.lastSeenAt = new Date();
  await this.save();
};

SessionSchema.methods.incrementMessageCount = async function (): Promise<void> {
  this.messageCount += 1;
  await this.save();
};

SessionSchema.methods.incrementErrorCount = async function (errorMessage?: string): Promise<void> {
  this.errorCount += 1;
  this.lastErrorAt = new Date();
  if (errorMessage) {
    this.lastErrorMessage = errorMessage;
  }
  await this.save();
};

SessionSchema.methods.calculateConnectionDuration = function (): number {
  if (this.status === SessionStatus.CONNECTED && this.lastSeenAt) {
    const now = new Date();
    const currentSessionDuration = Math.floor((now.getTime() - this.lastSeenAt.getTime()) / 1000);
    return this.connectionDuration + currentSessionDuration;
  }
  return this.connectionDuration;
};

SessionSchema.methods.isExpired = function (): boolean {
  const now = new Date();
  const timeSinceUpdate = now.getTime() - this.updatedAt.getTime();

  switch (this.status) {
    case SessionStatus.QR:
      return timeSinceUpdate > 24 * 60 * 60 * 1000; // 24 hours
    case SessionStatus.DISCONNECTED:
      return timeSinceUpdate > 7 * 24 * 60 * 60 * 1000; // 7 days
    case SessionStatus.EXPIRED:
    case SessionStatus.ERROR:
      return true;
    default:
      return false;
  }
};

// Static Methods
SessionSchema.statics.createSession = async function (
  userId: string,
  deviceName?: string,
  metadata?: any,
  config?: any
): Promise<ISession> {
  const sessionId = uuidv4();

  const session = new this({
    userId: new Types.ObjectId(userId),
    sessionId,
    status: SessionStatus.PENDING,
    deviceInfo: deviceName
      ? {
          name: deviceName,
          platform: 'Unknown',
          version: 'Unknown',
        }
      : undefined,
    metadata: metadata || {},
    config: config || {},
  });

  return await session.save();
};

SessionSchema.statics.getUserSessions = async function (
  userId: string,
  includeExpired: boolean = false
): Promise<ISession[]> {
  const query: any = { userId: new Types.ObjectId(userId) };

  if (!includeExpired) {
    query.status = { $nin: [SessionStatus.EXPIRED, SessionStatus.ERROR] };
  }

  return await this.find(query).sort({ createdAt: -1 }).select('-wppState'); // Exclude WPP state for performance
};

SessionSchema.statics.getSessionBySessionId = async function (
  sessionId: string,
  userId: string
): Promise<ISession | null> {
  return await this.findOne({
    sessionId,
    userId: new Types.ObjectId(userId),
  });
};

SessionSchema.statics.updateStatus = async function (
  sessionId: string,
  newStatus: SessionStatus,
  error?: string
): Promise<ISession | null> {
  const session = await this.findOne({ sessionId });
  if (!session) {
    return null;
  }

  await session.updateStatus(newStatus, error);
  return session;
};

SessionSchema.statics.expireSession = async function (
  sessionId: string,
  userId: string
): Promise<ISession | null> {
  return await this.findOneAndUpdate(
    {
      sessionId,
      userId: new Types.ObjectId(userId),
      status: { $nin: [SessionStatus.EXPIRED, SessionStatus.ERROR] },
    },
    {
      $set: { status: SessionStatus.EXPIRED },
    },
    { new: true }
  );
};

SessionSchema.statics.cleanupExpiredSessions = async function (): Promise<number> {
  const now = new Date();

  // Mark QR sessions older than 24 hours as expired
  const qrExpired = await this.updateMany(
    {
      status: SessionStatus.QR,
      updatedAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    { $set: { status: SessionStatus.EXPIRED } }
  );

  // Mark disconnected sessions older than 7 days as expired
  const disconnectedExpired = await this.updateMany(
    {
      status: SessionStatus.DISCONNECTED,
      updatedAt: { $lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    },
    { $set: { status: SessionStatus.EXPIRED } }
  );

  return qrExpired.modifiedCount + disconnectedExpired.modifiedCount;
};

SessionSchema.statics.getSessionStatistics = async function (userId: string): Promise<{
  total: number;
  active: number;
  connected: number;
  expired: number;
  totalMessages: number;
  totalErrors: number;
}> {
  const pipeline = [
    { $match: { userId: new Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: {
          $sum: {
            $cond: [{ $not: { $in: ['$status', [SessionStatus.EXPIRED, SessionStatus.ERROR]] } }, 1, 0],
          },
        },
        connected: {
          $sum: {
            $cond: [{ $eq: ['$status', SessionStatus.CONNECTED] }, 1, 0],
          },
        },
        expired: {
          $sum: {
            $cond: [{ $in: ['$status', [SessionStatus.EXPIRED, SessionStatus.ERROR]] }, 1, 0],
          },
        },
        totalMessages: { $sum: '$messageCount' },
        totalErrors: { $sum: '$errorCount' },
      },
    },
  ];

  const result = await this.aggregate(pipeline);

  return (
    result[0] || {
      total: 0,
      active: 0,
      connected: 0,
      expired: 0,
      totalMessages: 0,
      totalErrors: 0,
    }
  );
};

SessionSchema.statics.rehydrateActiveSessions = async function (): Promise<ISession[]> {
  return await this.find({
    status: { $in: [SessionStatus.CONNECTED, SessionStatus.QR, SessionStatus.PENDING] },
  }).select('+wppState'); // Include WPP state for rehydration
};

// Pre-save middleware
SessionSchema.pre('save', function (next) {
  // Ensure phone number is properly formatted
  if (this.isModified('phone') && this.phone) {
    this.phone = this.phone.trim();
  }

  next();
});

// Create and export the model
export const Session: ISessionModel = mongoose.model<ISession, ISessionModel>(
  'Session',
  SessionSchema
);
