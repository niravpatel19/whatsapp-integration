import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import {
  MessageType,
  MessageStatus,
  VALIDATION_PATTERNS,
  FIELD_LIMITS,
} from '../types/database.types';

// Interface for Message document
export interface IMessage extends Document {
  userId: Types.ObjectId;
  sessionId: string;
  messageId: string;
  to: string;
  type: MessageType;
  content?: string;
  mediaUrl?: string;
  caption?: string;
  status: MessageStatus;
  error?: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;

  // Delivery tracking
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  retryCount: number;
  nextRetryAt?: Date;

  // Instance methods
  updateStatus(newStatus: MessageStatus, error?: string): Promise<void>;
  addDeliveryReceipt(receiptType: 'sent' | 'delivered' | 'read'): Promise<void>;
  canRetry(): boolean;
  scheduleRetry(): Promise<void>;
  calculateResponseTime(): number | null;
}

// Interface for Message model (static methods)
export interface IMessageModel extends Model<IMessage> {
  createMessage(messageData: {
    userId: string;
    sessionId: string;
    to: string;
    type: MessageType;
    content?: string;
    mediaUrl?: string;
    caption?: string;
    metadata?: any;
    idempotencyKey?: string;
  }): Promise<IMessage>;
  updateStatus(
    messageId: string,
    newStatus: MessageStatus,
    error?: string
  ): Promise<IMessage | null>;
  getMessageHistory(
    userId: string,
    filters?: {
      sessionId?: string;
      status?: MessageStatus;
      type?: MessageType;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ messages: IMessage[]; total: number }>;
  getMessageStatistics(
    userId: string,
    sessionId?: string
  ): Promise<{
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    deliveryRate: number;
    averageResponseTime: number;
    errorBreakdown: { [key: string]: number };
  }>;
  getMessagesForRetry(): Promise<IMessage[]>;
  updateMessageStatus(
    messageId: string,
    status: MessageStatus,
    error?: string
  ): Promise<IMessage | null>;
}

// Message schema definition
const MessageSchema = new Schema<IMessage>(
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
    messageId: {
      type: String,
      required: [true, 'Message ID is required'],
      validate: {
        validator: function (messageId: string) {
          return VALIDATION_PATTERNS.UUID.test(messageId);
        },
        message: 'Message ID must be a valid UUID',
      },
    },
    to: {
      type: String,
      required: [true, 'Recipient phone number is required'],
      validate: {
        validator: function (phone: string) {
          return VALIDATION_PATTERNS.PHONE_E164.test(phone);
        },
        message: 'Phone number must be in E.164 format',
      },
      maxlength: [FIELD_LIMITS.PHONE_MAX, 'Phone number cannot exceed 20 characters'],
    },
    type: {
      type: String,
      enum: Object.values(MessageType),
      required: [true, 'Message type is required'],
    },
    content: {
      type: String,
      maxlength: [FIELD_LIMITS.CONTENT_MAX, 'Content cannot exceed 4096 characters'],
      validate: {
        validator: function (content: string) {
          // Content is required for text messages
          if (this.type === MessageType.TEXT) {
            return content && content.trim().length > 0;
          }
          return true;
        },
        message: 'Content is required for text messages',
      },
    },
    mediaUrl: {
      type: String,
      maxlength: [FIELD_LIMITS.URL_MAX, 'Media URL cannot exceed 2048 characters'],
      validate: {
        validator: function (url: string) {
          if (!url) return true;
          return VALIDATION_PATTERNS.URL.test(url);
        },
        message: 'Media URL must be a valid HTTP/HTTPS URL',
      },
    },
    caption: {
      type: String,
      maxlength: [FIELD_LIMITS.CONTENT_MAX, 'Caption cannot exceed 4096 characters'],
    },
    status: {
      type: String,
      enum: Object.values(MessageStatus),
      default: MessageStatus.QUEUED,
      required: [true, 'Message status is required'],
    },
    error: {
      type: String,
      maxlength: [500, 'Error message cannot exceed 500 characters'],
    },
    metadata: {
      type: Schema.Types.Mixed, // Flexible JSON for additional data
      default: {},
    },

    // Delivery tracking
    sentAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: [0, 'Retry count cannot be negative'],
      max: [3, 'Maximum 3 retries allowed'],
    },
    nextRetryAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'messages',
  }
);

// Indexes
MessageSchema.index({ userId: 1, sessionId: 1, createdAt: -1 });
MessageSchema.index({ messageId: 1 }, { unique: true });
MessageSchema.index({ userId: 1, status: 1 });
MessageSchema.index({ userId: 1, type: 1, createdAt: -1 });
MessageSchema.index({ status: 1, nextRetryAt: 1 }); // For retry queries
MessageSchema.index({ sessionId: 1, createdAt: -1 });

// Instance Methods
MessageSchema.methods.updateStatus = async function (
  newStatus: MessageStatus,
  error?: string
): Promise<void> {
  const oldStatus = this.status;
  this.status = newStatus;

  // Update timestamps based on status
  const now = new Date();
  switch (newStatus) {
    case MessageStatus.SENT:
      if (!this.sentAt) this.sentAt = now;
      break;
    case MessageStatus.DELIVERED:
      if (!this.deliveredAt) this.deliveredAt = now;
      break;
    case MessageStatus.READ:
      if (!this.readAt) this.readAt = now;
      break;
    case MessageStatus.FAILED:
      this.failedAt = now;
      if (error) this.error = error;
      break;
  }

  // Clear retry scheduling if message succeeded
  if ([MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ].includes(newStatus)) {
    this.nextRetryAt = undefined;
  }

  await this.save();
};

MessageSchema.methods.addDeliveryReceipt = async function (
  receiptType: 'sent' | 'delivered' | 'read'
): Promise<void> {
  const now = new Date();

  switch (receiptType) {
    case 'sent':
      if (!this.sentAt) {
        this.sentAt = now;
        this.status = MessageStatus.SENT;
      }
      break;
    case 'delivered':
      if (!this.deliveredAt) {
        this.deliveredAt = now;
        this.status = MessageStatus.DELIVERED;
      }
      break;
    case 'read':
      if (!this.readAt) {
        this.readAt = now;
        this.status = MessageStatus.READ;
      }
      break;
  }

  await this.save();
};

MessageSchema.methods.canRetry = function (): boolean {
  return (
    this.status === MessageStatus.FAILED &&
    this.retryCount < 3 &&
    (!this.nextRetryAt || this.nextRetryAt <= new Date())
  );
};

MessageSchema.methods.scheduleRetry = async function (): Promise<void> {
  if (this.retryCount >= 3) {
    throw new Error('Maximum retry attempts exceeded');
  }

  this.retryCount += 1;

  // Exponential backoff: 1min, 5min, 15min
  const backoffMinutes = [1, 5, 15][this.retryCount - 1] || 15;
  this.nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
  this.status = MessageStatus.QUEUED;

  await this.save();
};

MessageSchema.methods.calculateResponseTime = function (): number | null {
  if (!this.sentAt) return null;

  const endTime = this.readAt || this.deliveredAt;
  if (!endTime) return null;

  return endTime.getTime() - this.sentAt.getTime();
};

// Static Methods
MessageSchema.statics.createMessage = async function (messageData: {
  userId: string;
  sessionId: string;
  to: string;
  type: MessageType;
  content?: string;
  mediaUrl?: string;
  caption?: string;
  metadata?: any;
}): Promise<IMessage> {
  const messageId = uuidv4();

  // Validate message data based on type
  if (messageData.type === MessageType.TEXT && !messageData.content) {
    throw new Error('Content is required for text messages');
  }

  if (
    [
      MessageType.IMAGE,
      MessageType.DOCUMENT,
      MessageType.AUDIO,
      MessageType.VIDEO,
      MessageType.STICKER,
    ].includes(messageData.type) &&
    !messageData.mediaUrl
  ) {
    throw new Error('Media URL is required for media messages');
  }

  if (messageData.type === MessageType.LOCATION && !messageData.metadata?.latitude) {
    throw new Error('Location coordinates are required for location messages');
  }

  const message = new this({
    userId: new Types.ObjectId(messageData.userId),
    sessionId: messageData.sessionId,
    messageId,
    to: messageData.to,
    type: messageData.type,
    content: messageData.content,
    mediaUrl: messageData.mediaUrl,
    caption: messageData.caption,
    metadata: messageData.metadata || {},
  });

  return await message.save();
};

MessageSchema.statics.getMessageHistory = async function (
  userId: string,
  filters: {
    sessionId?: string;
    status?: MessageStatus;
    type?: MessageType;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ messages: IMessage[]; total: number }> {
  const query: any = { userId: new Types.ObjectId(userId) };

  if (filters.sessionId) query.sessionId = filters.sessionId;
  if (filters.status) query.status = filters.status;
  if (filters.type) query.type = filters.type;

  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = filters.dateFrom;
    if (filters.dateTo) query.createdAt.$lte = filters.dateTo;
  }

  const limit = Math.min(filters.limit || 50, 100); // Max 100 messages per request
  const offset = filters.offset || 0;

  const [messages, total] = await Promise.all([
    this.find(query).sort({ createdAt: -1 }).limit(limit).skip(offset).lean(),
    this.countDocuments(query),
  ]);

  return { messages, total };
};

MessageSchema.statics.getMessageStatistics = async function (
  userId: string,
  sessionId?: string
): Promise<{
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number;
  averageResponseTime: number;
  errorBreakdown: { [key: string]: number };
}> {
  const matchStage: any = { userId: new Types.ObjectId(userId) };
  if (sessionId) matchStage.sessionId = sessionId;

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        sent: {
          $sum: {
            $cond: [
              {
                $in: ['$status', [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ]],
              },
              1,
              0,
            ],
          },
        },
        delivered: {
          $sum: {
            $cond: [{ $in: ['$status', [MessageStatus.DELIVERED, MessageStatus.READ]] }, 1, 0],
          },
        },
        read: {
          $sum: {
            $cond: [{ $eq: ['$status', MessageStatus.READ] }, 1, 0],
          },
        },
        failed: {
          $sum: {
            $cond: [{ $eq: ['$status', MessageStatus.FAILED] }, 1, 0],
          },
        },
        responseTimes: {
          $push: {
            $cond: [{ $and: ['$sentAt', '$readAt'] }, { $subtract: ['$readAt', '$sentAt'] }, null],
          },
        },
        errors: { $push: '$error' },
      },
    },
    {
      $project: {
        total: 1,
        sent: 1,
        delivered: 1,
        read: 1,
        failed: 1,
        deliveryRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $multiply: [{ $divide: ['$sent', '$total'] }, 100] },
            0,
          ],
        },
        averageResponseTime: {
          $avg: {
            $filter: {
              input: '$responseTimes',
              cond: { $ne: ['$$this', null] },
            },
          },
        },
        errors: 1,
      },
    },
  ];

  const result = await this.aggregate(pipeline);
  const stats = result[0] || {
    total: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    deliveryRate: 0,
    averageResponseTime: 0,
    errors: [],
  };

  // Calculate error breakdown
  const errorBreakdown: { [key: string]: number } = {};
  stats.errors.forEach((error: string) => {
    if (error) {
      errorBreakdown[error] = (errorBreakdown[error] || 0) + 1;
    }
  });

  return {
    ...stats,
    averageResponseTime: stats.averageResponseTime || 0,
    errorBreakdown,
  };
};

MessageSchema.statics.getMessagesForRetry = async function (): Promise<IMessage[]> {
  return await this.find({
    status: MessageStatus.FAILED,
    retryCount: { $lt: 3 },
    $or: [{ nextRetryAt: { $exists: false } }, { nextRetryAt: { $lte: new Date() } }],
  }).limit(100); // Process max 100 retries at a time
};

MessageSchema.statics.updateStatus = async function (
  messageId: string,
  newStatus: MessageStatus,
  error?: string
): Promise<IMessage | null> {
  const message = await this.findOne({ messageId });
  if (!message) return null;

  await message.updateStatus(newStatus, error);
  return message;
};

MessageSchema.statics.updateMessageStatus = async function (
  messageId: string,
  status: MessageStatus,
  error?: string
): Promise<IMessage | null> {
  const message = await this.findOne({ messageId });
  if (!message) return null;

  await message.updateStatus(status, error);
  return message;
};

// Pre-save middleware
MessageSchema.pre('save', function (next) {
  // Trim string fields
  if (this.isModified('content') && this.content) {
    this.content = this.content.trim();
  }

  if (this.isModified('caption') && this.caption) {
    this.caption = this.caption.trim();
  }

  // Validate status transitions
  if (this.isModified('status')) {
    const validTransitions: { [key in MessageStatus]: MessageStatus[] } = {
      [MessageStatus.QUEUED]: [MessageStatus.SENT, MessageStatus.FAILED],
      [MessageStatus.SENT]: [MessageStatus.DELIVERED, MessageStatus.FAILED],
      [MessageStatus.DELIVERED]: [MessageStatus.READ, MessageStatus.FAILED],
      [MessageStatus.READ]: [], // Final state
      [MessageStatus.FAILED]: [MessageStatus.QUEUED], // Can retry
    };

    const currentStatus = this.status;
    const previousStatus = (this as any)._original?.status;

    if (previousStatus && !validTransitions[previousStatus].includes(currentStatus)) {
      return next(
        new Error(`Invalid status transition from ${previousStatus} to ${currentStatus}`)
      );
    }
  }

  next();
});

// Create and export the model
export const Message: IMessageModel = mongoose.model<IMessage, IMessageModel>(
  'Message',
  MessageSchema
);
