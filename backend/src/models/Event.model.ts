import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { EventType, VALIDATION_PATTERNS } from '../types/database.types';

// Event payload interfaces for different event types
export interface SessionStatePayload {
  oldStatus?: string;
  newStatus: string;
  deviceInfo?: any;
  phone?: string;
  error?: string;
}

export interface MessagePayload {
  messageId: string;
  to: string;
  type: string;
  status?: string;
  error?: string;
}

export interface QRPayload {
  qrData: string;
  expiresAt: Date;
  tries: number;
}

export interface AuthPayload {
  method: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
}

export interface ErrorPayload {
  error: string;
  stack?: string;
  context?: any;
}

// Union type for all possible payloads
export type EventPayload = 
  | SessionStatePayload 
  | MessagePayload 
  | QRPayload 
  | AuthPayload 
  | ErrorPayload 
  | any;

// Interface for Event document
export interface IEvent extends Document {
  userId: Types.ObjectId;
  sessionId?: string;
  eventId: string;
  type: EventType;
  payload: EventPayload;
  createdAt: Date;
  
  // Additional metadata
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  
  // Instance methods
  isExpired(): boolean;
  getAge(): number;
}

// Interface for Event model (static methods)
export interface IEventModel extends Model<IEvent> {
  recordEvent(eventData: {
    userId: string;
    sessionId?: string;
    type: EventType;
    payload: EventPayload;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }): Promise<IEvent>;
  getEvents(
    userId: string,
    filters?: {
      sessionId?: string;
      type?: EventType;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: IEvent[]; total: number }>;
  getEventsByType(userId: string, type: EventType, limit?: number): Promise<IEvent[]>;
  getEventsBySession(userId: string, sessionId: string, limit?: number): Promise<IEvent[]>;
  cleanupOldEvents(retentionDays?: number): Promise<number>;
  getEventAnalytics(userId: string, dateFrom?: Date, dateTo?: Date): Promise<{
    totalEvents: number;
    eventsByType: { [key in EventType]?: number };
    eventsByDay: { date: string; count: number }[];
    userActivityPattern: { hour: number; count: number }[];
  }>;
  archiveOldEvents(archiveDays?: number): Promise<number>;
}

// Event schema definition
const EventSchema = new Schema<IEvent>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  sessionId: {
    type: String,
    validate: {
      validator: function(sessionId: string) {
        if (!sessionId) return true;
        return VALIDATION_PATTERNS.UUID.test(sessionId);
      },
      message: 'Session ID must be a valid UUID'
    }
  },
  eventId: {
    type: String,
    required: [true, 'Event ID is required'],
    unique: true,
    validate: {
      validator: function(eventId: string) {
        return VALIDATION_PATTERNS.UUID.test(eventId);
      },
      message: 'Event ID must be a valid UUID'
    }
  },
  type: {
    type: String,
    enum: Object.values(EventType),
    required: [true, 'Event type is required']
  },
  payload: {
    type: Schema.Types.Mixed,
    required: [true, 'Event payload is required'],
    validate: {
      validator: function(payload: any) {
        // Basic payload validation based on event type
        if (!payload || typeof payload !== 'object') {
          return false;
        }
        
        // Type-specific validation
        switch (this.type) {
          case EventType.SESSION_STATE:
            return payload.newStatus !== undefined;
          case EventType.SESSION_DELETED:
            return payload.deletedAt !== undefined || payload.action !== undefined;
          case EventType.MESSAGE_SENT:
          case EventType.MESSAGE_DELIVERED:
          case EventType.MESSAGE_READ:
            return payload.messageId !== undefined;
          case EventType.QR_REFRESHED:
            return payload.qrData !== undefined || payload.attempts !== undefined;
          case EventType.LOGIN:
          case EventType.LOGOUT:
            return payload.method !== undefined;
          case EventType.ERROR:
            return payload.error !== undefined;
          case EventType.DISCONNECTED:
          case EventType.RECONNECTED:
            return true; // These events can have flexible payloads
          default:
            return true;
        }
      },
      message: 'Invalid payload for event type'
    }
  },
  
  // Additional metadata
  ipAddress: {
    type: String,
    validate: {
      validator: function(ip: string) {
        if (!ip) return true;
        // Basic IP validation (IPv4 and IPv6)
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
      },
      message: 'Invalid IP address format'
    }
  },
  userAgent: {
    type: String,
    maxlength: [500, 'User agent cannot exceed 500 characters']
  },
  correlationId: {
    type: String,
    validate: {
      validator: function(correlationId: string) {
        if (!correlationId) return true;
        return VALIDATION_PATTERNS.UUID.test(correlationId);
      },
      message: 'Correlation ID must be a valid UUID'
    }
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Only track creation time
  collection: 'events'
});

// Indexes
EventSchema.index({ userId: 1, createdAt: -1 });
EventSchema.index({ sessionId: 1, type: 1, createdAt: -1 });
EventSchema.index({ type: 1, createdAt: -1 });
EventSchema.index({ eventId: 1 }, { unique: true });
EventSchema.index({ correlationId: 1 });

// TTL index for automatic cleanup (90 days retention)
EventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Instance Methods
EventSchema.methods.isExpired = function(): boolean {
  const retentionPeriod = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds
  const now = new Date();
  return (now.getTime() - this.createdAt.getTime()) > retentionPeriod;
};

EventSchema.methods.getAge = function(): number {
  const now = new Date();
  return Math.floor((now.getTime() - this.createdAt.getTime()) / 1000); // Age in seconds
};

// Static Methods
EventSchema.statics.recordEvent = async function(eventData: {
  userId: string;
  sessionId?: string;
  type: EventType;
  payload: EventPayload;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}): Promise<IEvent> {
  const eventId = uuidv4();
  
  const event = new this({
    userId: new Types.ObjectId(eventData.userId),
    sessionId: eventData.sessionId,
    eventId,
    type: eventData.type,
    payload: eventData.payload,
    ipAddress: eventData.ipAddress,
    userAgent: eventData.userAgent,
    correlationId: eventData.correlationId
  });
  
  return await event.save();
};

EventSchema.statics.getEvents = async function(
  userId: string,
  filters: {
    sessionId?: string;
    type?: EventType;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ events: IEvent[]; total: number }> {
  const query: any = { userId: new Types.ObjectId(userId) };
  
  if (filters.sessionId) query.sessionId = filters.sessionId;
  if (filters.type) query.type = filters.type;
  
  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = filters.dateFrom;
    if (filters.dateTo) query.createdAt.$lte = filters.dateTo;
  }
  
  const limit = Math.min(filters.limit || 100, 500); // Max 500 events per request
  const offset = filters.offset || 0;
  
  const [events, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean(),
    this.countDocuments(query)
  ]);
  
  return { events, total };
};

EventSchema.statics.getEventsByType = async function(
  userId: string,
  type: EventType,
  limit: number = 50
): Promise<IEvent[]> {
  return await this.find({
    userId: new Types.ObjectId(userId),
    type
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();
};

EventSchema.statics.getEventsBySession = async function(
  userId: string,
  sessionId: string,
  limit: number = 50
): Promise<IEvent[]> {
  return await this.find({
    userId: new Types.ObjectId(userId),
    sessionId
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();
};

EventSchema.statics.cleanupOldEvents = async function(retentionDays: number = 90): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate }
  });
  
  return result.deletedCount || 0;
};

EventSchema.statics.getEventAnalytics = async function(
  userId: string,
  dateFrom?: Date,
  dateTo?: Date
): Promise<{
  totalEvents: number;
  eventsByType: { [key in EventType]?: number };
  eventsByDay: { date: string; count: number }[];
  userActivityPattern: { hour: number; count: number }[];
}> {
  const matchStage: any = { userId: new Types.ObjectId(userId) };
  
  if (dateFrom || dateTo) {
    matchStage.createdAt = {};
    if (dateFrom) matchStage.createdAt.$gte = dateFrom;
    if (dateTo) matchStage.createdAt.$lte = dateTo;
  }
  
  const pipeline = [
    { $match: matchStage },
    {
      $facet: {
        totalEvents: [{ $count: 'count' }],
        eventsByType: [
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ],
        eventsByDay: [
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ],
        userActivityPattern: [
          {
            $group: {
              _id: { $hour: '$createdAt' },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]
      }
    }
  ];
  
  const result = await this.aggregate(pipeline as any);
  const data = result[0];
  
  // Format results
  const eventsByType: { [key in EventType]?: number } = {};
  data.eventsByType.forEach((item: any) => {
    eventsByType[item._id as EventType] = item.count;
  });
  
  const eventsByDay = data.eventsByDay.map((item: any) => ({
    date: item._id,
    count: item.count
  }));
  
  const userActivityPattern = data.userActivityPattern.map((item: any) => ({
    hour: item._id,
    count: item.count
  }));
  
  return {
    totalEvents: data.totalEvents[0]?.count || 0,
    eventsByType,
    eventsByDay,
    userActivityPattern
  };
};

EventSchema.statics.archiveOldEvents = async function(archiveDays: number = 365): Promise<number> {
  // This would typically move events to an archive collection
  // For now, we'll just mark them as archived in metadata
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - archiveDays);
  
  const result = await this.updateMany(
    {
      createdAt: { $lt: cutoffDate },
      'payload.archived': { $ne: true }
    },
    {
      $set: { 'payload.archived': true }
    }
  );
  
  return result.modifiedCount || 0;
};

// Pre-save middleware
EventSchema.pre('save', function(next) {
  // Ensure payload is properly formatted
  if (this.isModified('payload')) {
    // Add timestamp to payload if not present
    if (!this.payload.timestamp) {
      this.payload.timestamp = new Date();
    }
  }
  
  next();
});

// Create and export the model
export const Event: IEventModel = mongoose.model<IEvent, IEventModel>('Event', EventSchema);