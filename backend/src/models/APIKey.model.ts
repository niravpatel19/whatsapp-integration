import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import crypto from 'crypto';
import { APIKeyPermission, FIELD_LIMITS } from '../types/database.types';

// Encryption utilities for API keys
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

function encryptAPIKey(key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decryptAPIKey(encryptedKey: string): string {
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Interface for API Key document
export interface IAPIKey extends Document {
  userId: Types.ObjectId;
  keyHash: string;
  keyPrefix: string;
  encryptedKey: string; // Store encrypted version for reveal functionality
  label?: string;
  permissions: APIKeyPermission[];
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date;
  usageCount: number;
  lastUsedIP?: string;

  // Instance methods
  maskAPIKey(): string;
  updateLastUsed(ipAddress?: string): Promise<void>;
  isRevoked(): boolean;
  hasPermission(permission: APIKeyPermission): boolean;
}

// Interface for API Key model (static methods)
export interface IAPIKeyModel extends Model<IAPIKey> {
  generateAPIKey(
    userId: string,
    options?: {
      label?: string;
      permissions?: APIKeyPermission[];
    }
  ): Promise<{ apiKey: IAPIKey; rawKey: string }>;
  validateAPIKey(key: string): Promise<IAPIKey | null>;
  revokeAPIKey(keyId: string, userId: string): Promise<IAPIKey | null>;
  rotateAPIKey(
    keyId: string,
    userId: string,
    gracePeriodHours?: number
  ): Promise<{
    newKey: IAPIKey;
    rawKey: string;
    oldKey: IAPIKey;
  }>;
  getUserAPIKeys(userId: string, includeRevoked?: boolean): Promise<IAPIKey[]>;
  getUsageStatistics(
    keyId: string,
    userId: string
  ): Promise<{
    totalRequests: number;
    lastUsed?: Date;
    createdAt: Date;
    isActive: boolean;
  }>;
  updateLastUsed(keyId: string): Promise<void>;
}

// API Key schema definition
const APIKeySchema = new Schema<IAPIKey>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    keyHash: {
      type: String,
      required: [true, 'Key hash is required'],
    },
    keyPrefix: {
      type: String,
      required: [true, 'Key prefix is required'],
      length: [8, 'Key prefix must be exactly 8 characters'],
    },
    encryptedKey: {
      type: String,
      required: [true, 'Encrypted key is required'],
    },
    label: {
      type: String,
      trim: true,
      maxlength: [FIELD_LIMITS.LABEL_MAX, 'Label cannot exceed 50 characters'],
    },
    permissions: [
      {
        type: String,
        enum: Object.values(APIKeyPermission),
        required: true,
      },
    ],
    lastUsedAt: {
      type: Date,
    },
    revokedAt: {
      type: Date,
    },
    usageCount: {
      type: Number,
      default: 0,
      min: [0, 'Usage count cannot be negative'],
    },
    lastUsedIP: {
      type: String,
      validate: {
        validator: function (ip: string) {
          if (!ip) return true;
          // Basic IP validation (IPv4 and IPv6)
          const ipv4Regex =
            /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
          const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
          return ipv4Regex.test(ip) || ipv6Regex.test(ip);
        },
        message: 'Invalid IP address format',
      },
    },
  },
  {
    timestamps: true,
    collection: 'apikeys',
  }
);

// Indexes
APIKeySchema.index({ userId: 1, createdAt: -1 });
APIKeySchema.index({ keyHash: 1 }, { unique: true });
APIKeySchema.index({ userId: 1, revokedAt: 1 });
APIKeySchema.index({ lastUsedAt: -1 });

// Instance Methods
APIKeySchema.methods.maskAPIKey = function (): string {
  return `${this.keyPrefix}...****`;
};

APIKeySchema.methods.updateLastUsed = async function (ipAddress?: string): Promise<void> {
  this.lastUsedAt = new Date();
  this.usageCount += 1;
  if (ipAddress) {
    this.lastUsedIP = ipAddress;
  }
  await this.save();
};

APIKeySchema.methods.isRevoked = function (): boolean {
  return !!this.revokedAt;
};

APIKeySchema.methods.hasPermission = function (permission: APIKeyPermission): boolean {
  return this.permissions.includes(permission) || this.permissions.includes(APIKeyPermission.ADMIN);
};

// Static Methods
APIKeySchema.statics.generateAPIKey = async function (
  userId: string,
  options: {
    label?: string;
    permissions?: APIKeyPermission[];
  } = {}
): Promise<{ apiKey: IAPIKey; rawKey: string }> {
  // Generate secure random key
  const randomBytes = crypto.randomBytes(32);
  const rawKey = `ak_${randomBytes.toString('base64').replace(/[+/=]/g, '').substring(0, 40)}`;

  // Create SHA-256 hash of the key
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  // Extract prefix (first 8 characters after 'ak_')
  const keyPrefix = rawKey.substring(0, 11); // 'ak_' + 8 chars

  // Default permissions
  const defaultPermissions = [
    APIKeyPermission.SESSIONS_READ,
    APIKeyPermission.SESSIONS_WRITE,
    APIKeyPermission.MESSAGES_SEND,
    APIKeyPermission.MESSAGES_READ,
    APIKeyPermission.EVENTS_READ,
  ];

  // Encrypt the raw key for storage
  const encryptedKey = encryptAPIKey(rawKey);

  const apiKey = new this({
    userId: new Types.ObjectId(userId),
    keyHash,
    keyPrefix,
    encryptedKey,
    label: options.label,
    permissions: options.permissions || defaultPermissions,
  });

  await apiKey.save();

  return { apiKey, rawKey };
};

APIKeySchema.statics.validateAPIKey = async function (key: string): Promise<IAPIKey | null> {
  if (!key || !key.startsWith('ak_')) {
    return null;
  }

  try {
    // Hash the provided key
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    // Find the API key
    const apiKey = await this.findOne({
      keyHash,
      revokedAt: { $exists: false }, // Not revoked
    }).populate('userId');

    return apiKey;
  } catch (error) {
    return null;
  }
};

APIKeySchema.statics.revokeAPIKey = async function (
  keyId: string,
  userId: string
): Promise<IAPIKey | null> {
  return await this.findOneAndUpdate(
    {
      _id: keyId,
      userId: new Types.ObjectId(userId),
      revokedAt: { $exists: false },
    },
    {
      $set: { revokedAt: new Date() },
    },
    { new: true }
  );
};

APIKeySchema.statics.rotateAPIKey = async function (
  keyId: string,
  userId: string,
  gracePeriodHours: number = 24
): Promise<{
  newKey: IAPIKey;
  rawKey: string;
  oldKey: IAPIKey;
}> {
  // Find the existing key
  const oldKey = await this.findOne({
    _id: keyId,
    userId: new Types.ObjectId(userId),
    revokedAt: { $exists: false },
  });

  if (!oldKey) {
    throw new Error('API key not found or already revoked');
  }

  // Generate new key with same permissions and label
  const { apiKey: newKey, rawKey } = await (this as any).generateAPIKey(userId, {
    label: oldKey.label,
    permissions: oldKey.permissions,
  });

  // Schedule old key revocation after grace period
  const revokeAt = new Date();
  revokeAt.setHours(revokeAt.getHours() + gracePeriodHours);

  // Update old key with future revocation time
  oldKey.revokedAt = revokeAt;
  await oldKey.save();

  return { newKey, rawKey, oldKey };
};

APIKeySchema.statics.getUserAPIKeys = async function (
  userId: string,
  includeRevoked: boolean = false
): Promise<IAPIKey[]> {
  const query: any = { userId: new Types.ObjectId(userId) };

  if (!includeRevoked) {
    query.revokedAt = { $exists: false };
  }

  return await this.find(query).sort({ createdAt: -1 }).select('-keyHash'); // Don't return the hash for security
};

APIKeySchema.statics.getUsageStatistics = async function (
  keyId: string,
  userId: string
): Promise<{
  totalRequests: number;
  lastUsed?: Date;
  createdAt: Date;
  isActive: boolean;
}> {
  const apiKey = await this.findOne({
    _id: keyId,
    userId: new Types.ObjectId(userId),
  });

  if (!apiKey) {
    throw new Error('API key not found');
  }

  return {
    totalRequests: apiKey.usageCount,
    lastUsed: apiKey.lastUsedAt,
    createdAt: apiKey.createdAt,
    isActive: !apiKey.revokedAt,
  };
};

APIKeySchema.statics.updateLastUsed = async function (keyId: string): Promise<void> {
  await this.findByIdAndUpdate(keyId, {
    $set: { lastUsedAt: new Date() },
    $inc: { usageCount: 1 },
  });
};

// Pre-save middleware
APIKeySchema.pre('save', function (next) {
  // Ensure permissions array has no duplicates
  if (this.isModified('permissions')) {
    this.permissions = [...new Set(this.permissions)];
  }

  next();
});

// Create and export the model
export const APIKey: IAPIKeyModel = mongoose.model<IAPIKey, IAPIKeyModel>('APIKey', APIKeySchema);

// Export encryption utilities for use in controllers
export { encryptAPIKey, decryptAPIKey };
