import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { NotificationStatus, NotificationType } from '../types/database.types';

export interface INotification extends Document {
  userId: Types.ObjectId;
  sessionId: string;
  type: NotificationType;
  status: NotificationStatus;
  recipient: string; // Email address
  subject: string;
  content: string;
  sentAt?: Date;
  errorMessage?: string;
  suppressedUntil?: Date; // Suppress notifications until this time
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationModel extends Model<INotification> {
  createNotification(
    userId: string,
    sessionId: string,
    type: NotificationType,
    recipient: string,
    subject: string,
    content: string,
    metadata?: any
  ): Promise<INotification>;
  
  shouldSendNotification(
    userId: string,
    sessionId: string,
    type: NotificationType
  ): Promise<boolean>;
  
  markAsSent(notificationId: string): Promise<void>;
  markAsFailed(notificationId: string, errorMessage: string): Promise<void>;
  suppressNotifications(userId: string, sessionId: string, type: NotificationType, hours: number): Promise<void>;
  getPendingNotifications(limit?: number): Promise<INotification[]>;
  cleanupOldNotifications(daysOld: number): Promise<number>;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    sessionId: {
      type: String,
      required: [true, 'Session ID is required'],
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: [true, 'Notification type is required'],
    },
    status: {
      type: String,
      enum: Object.values(NotificationStatus),
      default: NotificationStatus.PENDING,
      required: [true, 'Status is required'],
    },
    recipient: {
      type: String,
      required: [true, 'Recipient email is required'],
      validate: {
        validator: function (email: string) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        },
        message: 'Invalid email address',
      },
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
      maxlength: [5000, 'Content cannot exceed 5000 characters'],
    },
    sentAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
      maxlength: [500, 'Error message cannot exceed 500 characters'],
    },
    suppressedUntil: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'notifications',
  }
);

// Indexes
NotificationSchema.index({ userId: 1, sessionId: 1, type: 1 });
NotificationSchema.index({ status: 1, createdAt: 1 });
NotificationSchema.index({ suppressedUntil: 1 });
NotificationSchema.index({ createdAt: 1 }); // For cleanup

// TTL index for automatic cleanup of old notifications (30 days)
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

// Static Methods
NotificationSchema.statics.createNotification = async function (
  userId: string,
  sessionId: string,
  type: NotificationType,
  recipient: string,
  subject: string,
  content: string,
  metadata?: any
): Promise<INotification> {
  const notification = new this({
    userId: new Types.ObjectId(userId),
    sessionId,
    type,
    recipient,
    subject,
    content,
    metadata: metadata || {},
  });

  return await notification.save();
};

NotificationSchema.statics.shouldSendNotification = async function (
  userId: string,
  sessionId: string,
  type: NotificationType
): Promise<boolean> {
  const now = new Date();
  
  // Check if there's a recent notification of the same type that's suppressed
  const recentNotification = await this.findOne({
    userId: new Types.ObjectId(userId),
    sessionId,
    type,
    $or: [
      { suppressedUntil: { $gt: now } },
      {
        status: NotificationStatus.SENT,
        sentAt: { $gt: new Date(now.getTime() - 60 * 60 * 1000) }, // Within last hour
      },
    ],
  });

  return !recentNotification;
};

NotificationSchema.statics.markAsSent = async function (notificationId: string): Promise<void> {
  await this.findByIdAndUpdate(notificationId, {
    status: NotificationStatus.SENT,
    sentAt: new Date(),
  });
};

NotificationSchema.statics.markAsFailed = async function (
  notificationId: string,
  errorMessage: string
): Promise<void> {
  await this.findByIdAndUpdate(notificationId, {
    status: NotificationStatus.FAILED,
    errorMessage,
  });
};

NotificationSchema.statics.suppressNotifications = async function (
  userId: string,
  sessionId: string,
  type: NotificationType,
  hours: number
): Promise<void> {
  const suppressedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
  
  await this.updateMany(
    {
      userId: new Types.ObjectId(userId),
      sessionId,
      type,
      status: NotificationStatus.PENDING,
    },
    {
      status: NotificationStatus.SUPPRESSED,
      suppressedUntil,
    }
  );
};

NotificationSchema.statics.getPendingNotifications = async function (
  limit: number = 50
): Promise<INotification[]> {
  const now = new Date();
  
  return await this.find({
    status: NotificationStatus.PENDING,
    $or: [
      { suppressedUntil: { $exists: false } },
      { suppressedUntil: { $lt: now } },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(limit);
};

NotificationSchema.statics.cleanupOldNotifications = async function (
  daysOld: number
): Promise<number> {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  
  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    status: { $in: [NotificationStatus.SENT, NotificationStatus.FAILED] },
  });

  return result.deletedCount || 0;
};

export const Notification: INotificationModel = mongoose.model<INotification, INotificationModel>(
  'Notification',
  NotificationSchema
);