import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { VALIDATION_PATTERNS } from '../types/database.types';

// Interface for QR Event document
export interface IQREvent extends Document {
  userId: Types.ObjectId;
  sessionId: string;
  qrData: string;
  expiresAt: Date;
  tries: number;
  createdAt: Date;

  // Instance methods
  incrementTries(): Promise<void>;
  isExpired(): boolean;
  getRemainingTime(): number;
}

// Interface for QR Event model (static methods)
export interface IQREventModel extends Model<IQREvent> {
  createQREvent(
    userId: string,
    sessionId: string,
    qrData: string,
    expirationMinutes?: number
  ): Promise<IQREvent>;
  getLatestQR(sessionId: string, userId: string): Promise<IQREvent | null>;
  cleanupExpiredQR(): Promise<number>;
  getQRStatistics(
    userId: string,
    sessionId?: string
  ): Promise<{
    totalGenerated: number;
    averageTriesPerQR: number;
    successRate: number;
    lastGenerated?: Date;
  }>;
  incrementTries(qrEventId: string): Promise<IQREvent | null>;
}

// QR Event schema definition
const QREventSchema = new Schema<IQREvent>(
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
    qrData: {
      type: String,
      required: [true, 'QR data is required'],
      validate: {
        validator: function (qrData: string) {
          // Basic QR data validation - should be a non-empty string
          // WhatsApp QR codes are base64 encoded images and can be quite large
          return qrData.length > 0 && qrData.length <= 50000;
        },
        message: 'QR data must be between 1 and 50000 characters',
      },
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      validate: {
        validator: function (expiresAt: Date) {
          // Ensure expiration is in the future and not more than 1 hour from now
          const now = new Date();
          const maxExpiration = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
          return expiresAt > now && expiresAt <= maxExpiration;
        },
        message: 'Expiration must be in the future and within 1 hour',
      },
    },
    tries: {
      type: Number,
      default: 0,
      min: [0, 'Tries cannot be negative'],
      max: [5, 'Maximum 5 tries allowed per QR code'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only track creation time
    collection: 'qrevents',
  }
);

// Indexes
QREventSchema.index({ sessionId: 1, createdAt: -1 });
QREventSchema.index({ userId: 1, sessionId: 1 });
QREventSchema.index({ userId: 1, createdAt: -1 });

// TTL index for automatic cleanup
QREventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Instance Methods
QREventSchema.methods.incrementTries = async function (): Promise<void> {
  if (this.tries >= 5) {
    throw new Error('Maximum tries exceeded for this QR code');
  }

  this.tries += 1;
  await this.save();
};

QREventSchema.methods.isExpired = function (): boolean {
  return new Date() > this.expiresAt;
};

QREventSchema.methods.getRemainingTime = function (): number {
  const now = new Date();
  const remaining = this.expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(remaining / 1000)); // Return seconds
};

// Static Methods
QREventSchema.statics.createQREvent = async function (
  userId: string,
  sessionId: string,
  qrData: string,
  expirationMinutes: number = 20
): Promise<IQREvent> {
  // Validate expiration time limits
  if (expirationMinutes < 1 || expirationMinutes > 60) {
    throw new Error('Expiration must be between 1 and 60 minutes');
  }

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

  // Clean up any existing QR events for this session
  await this.deleteMany({
    userId: new Types.ObjectId(userId),
    sessionId,
  });

  const qrEvent = new this({
    userId: new Types.ObjectId(userId),
    sessionId,
    qrData,
    expiresAt,
  });

  return await qrEvent.save();
};

QREventSchema.statics.getLatestQR = async function (
  sessionId: string,
  userId: string
): Promise<IQREvent | null> {
  return await this.findOne({
    sessionId,
    userId: new Types.ObjectId(userId),
    expiresAt: { $gt: new Date() }, // Only return non-expired QR codes
  }).sort({ createdAt: -1 });
};

QREventSchema.statics.cleanupExpiredQR = async function (): Promise<number> {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
  });

  return result.deletedCount || 0;
};

QREventSchema.statics.getQRStatistics = async function (
  userId: string,
  sessionId?: string
): Promise<{
  totalGenerated: number;
  averageTriesPerQR: number;
  successRate: number;
  lastGenerated?: Date;
}> {
  const matchStage: any = { userId: new Types.ObjectId(userId) };
  if (sessionId) {
    matchStage.sessionId = sessionId;
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalGenerated: { $sum: 1 },
        totalTries: { $sum: '$tries' },
        successfulScans: {
          $sum: {
            $cond: [{ $gt: ['$tries', 0] }, 1, 0],
          },
        },
        lastGenerated: { $max: '$createdAt' },
      },
    },
    {
      $project: {
        totalGenerated: 1,
        averageTriesPerQR: {
          $cond: [
            { $gt: ['$totalGenerated', 0] },
            { $divide: ['$totalTries', '$totalGenerated'] },
            0,
          ],
        },
        successRate: {
          $cond: [
            { $gt: ['$totalGenerated', 0] },
            { $multiply: [{ $divide: ['$successfulScans', '$totalGenerated'] }, 100] },
            0,
          ],
        },
        lastGenerated: 1,
      },
    },
  ];

  const result = await this.aggregate(pipeline);

  return (
    result[0] || {
      totalGenerated: 0,
      averageTriesPerQR: 0,
      successRate: 0,
      lastGenerated: undefined,
    }
  );
};

QREventSchema.statics.incrementTries = async function (
  qrEventId: string
): Promise<IQREvent | null> {
  const qrEvent = await this.findById(qrEventId);

  if (!qrEvent) {
    return null;
  }

  if (qrEvent.isExpired()) {
    throw new Error('Cannot increment tries on expired QR code');
  }

  await qrEvent.incrementTries();
  return qrEvent;
};

// Pre-save middleware
QREventSchema.pre('save', function (next) {
  // Ensure QR data is trimmed
  if (this.isModified('qrData')) {
    this.qrData = this.qrData.trim();
  }

  // Validate expiration time on save
  if (this.isNew && this.expiresAt <= new Date()) {
    return next(new Error('QR code expiration must be in the future'));
  }

  next();
});

// Create and export the model
export const QREvent: IQREventModel = mongoose.model<IQREvent, IQREventModel>(
  'QREvent',
  QREventSchema
);
