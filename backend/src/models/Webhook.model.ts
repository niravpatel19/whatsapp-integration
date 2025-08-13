import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import axios, { AxiosResponse } from 'axios';
import { EventType, VALIDATION_PATTERNS, FIELD_LIMITS } from '../types/database.types';

// Webhook delivery statistics interface
export interface WebhookStats {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;
  averageResponseTime: number;
  lastDeliveryAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
}

// Webhook delivery attempt interface
export interface DeliveryAttempt {
  timestamp: Date;
  success: boolean;
  responseCode?: number;
  responseTime: number;
  error?: string;
  retryCount: number;
}

// Interface for Webhook document
export interface IWebhook extends Document {
  userId: Types.ObjectId;
  url: string;
  description?: string;
  secret: string;
  isActive: boolean;
  eventTypes: EventType[];
  createdAt: Date;
  updatedAt: Date;
  
  // Delivery tracking
  lastResponseCode?: number;
  lastError?: string;
  retryCount: number;
  deliveryAttempts: DeliveryAttempt[];
  
  // Statistics
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  totalResponseTime: number; // Sum for calculating average
  lastDeliveryAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  
  // Instance methods
  generateSignature(payload: string): string;
  validateUrl(): Promise<boolean>;
  recordDelivery(attempt: DeliveryAttempt): Promise<void>;
  getStats(): WebhookStats;
  shouldRetry(): boolean;
  incrementRetryCount(): Promise<void>;
  resetRetryCount(): Promise<void>;
  isHealthy(): boolean;
}

// Interface for Webhook model (static methods)
export interface IWebhookModel extends Model<IWebhook> {
  createWebhook(webhookData: {
    userId: string;
    url: string;
    description?: string;
    eventTypes: EventType[];
  }): Promise<IWebhook>;
  updateWebhook(
    webhookId: string,
    userId: string,
    updates: {
      url?: string;
      description?: string;
      eventTypes?: EventType[];
      isActive?: boolean;
    }
  ): Promise<IWebhook | null>;
  deleteWebhook(webhookId: string, userId: string): Promise<boolean>;
  testWebhook(webhookId: string, userId: string, testPayload?: any): Promise<{
    success: boolean;
    responseCode?: number;
    responseTime: number;
    error?: string;
  }>;
  getUserWebhooks(userId: string, includeInactive?: boolean): Promise<IWebhook[]>;
  getWebhooksForEvent(eventType: EventType, userId?: string): Promise<IWebhook[]>;
  validateWebhookUrl(url: string): Promise<{
    valid: boolean;
    reachable: boolean;
    error?: string;
  }>;
  getWebhookStats(webhookId: string, userId: string): Promise<WebhookStats | null>;
  cleanupFailedWebhooks(maxFailures?: number): Promise<number>;
}
// Delivery attempt sub-schema
const DeliveryAttemptSchema = new Schema<DeliveryAttempt>({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  success: {
    type: Boolean,
    required: true
  },
  responseCode: {
    type: Number,
    min: 100,
    max: 599
  },
  responseTime: {
    type: Number,
    required: true,
    min: 0
  },
  error: {
    type: String,
    maxlength: [500, 'Error message cannot exceed 500 characters']
  },
  retryCount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  }
}, { _id: false });

// Webhook schema definition
const WebhookSchema = new Schema<IWebhook>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  url: {
    type: String,
    required: [true, 'Webhook URL is required'],
    maxlength: [FIELD_LIMITS.URL_MAX, `URL cannot exceed ${FIELD_LIMITS.URL_MAX} characters`],
    validate: {
      validator: function(url: string) {
        // Must be HTTPS
        return url.startsWith('https://') && VALIDATION_PATTERNS.URL.test(url);
      },
      message: 'Webhook URL must be a valid HTTPS URL'
    }
  },
  description: {
    type: String,
    maxlength: [FIELD_LIMITS.DESCRIPTION_MAX, `Description cannot exceed ${FIELD_LIMITS.DESCRIPTION_MAX} characters`],
    trim: true
  },
  secret: {
    type: String,
    required: [true, 'Webhook secret is required'],
    minlength: [32, 'Webhook secret must be at least 32 characters'],
    maxlength: [128, 'Webhook secret cannot exceed 128 characters']
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true
  },
  eventTypes: {
    type: [String],
    required: [true, 'At least one event type is required'],
    validate: {
      validator: function(eventTypes: string[]) {
        if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
          return false;
        }
        // Validate all event types are valid
        return eventTypes.every(type => Object.values(EventType).includes(type as EventType));
      },
      message: 'All event types must be valid EventType values'
    }
  },
  
  // Delivery tracking fields
  lastResponseCode: {
    type: Number,
    min: 100,
    max: 599
  },
  lastError: {
    type: String,
    maxlength: [500, 'Error message cannot exceed 500 characters']
  },
  retryCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 10 // Maximum 10 retries
  },
  deliveryAttempts: {
    type: [DeliveryAttemptSchema],
    default: [],
    validate: {
      validator: function(attempts: DeliveryAttempt[]) {
        // Keep only last 100 attempts to prevent unbounded growth
        return attempts.length <= 100;
      },
      message: 'Cannot store more than 100 delivery attempts'
    }
  },
  
  // Statistics fields
  totalDeliveries: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  successfulDeliveries: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  failedDeliveries: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  totalResponseTime: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  lastDeliveryAt: {
    type: Date
  },
  lastSuccessAt: {
    type: Date
  },
  lastFailureAt: {
    type: Date
  }
}, {
  timestamps: true,
  collection: 'webhooks'
});

// Indexes
WebhookSchema.index({ userId: 1, isActive: 1 });
WebhookSchema.index({ userId: 1, createdAt: -1 });
WebhookSchema.index({ eventTypes: 1, isActive: 1 });
WebhookSchema.index({ lastDeliveryAt: -1 });
WebhookSchema.index({ retryCount: 1, isActive: 1 });

// Instance Methods
WebhookSchema.methods.generateSignature = function(payload: string): string {
  return crypto
    .createHmac('sha256', this.secret)
    .update(payload, 'utf8')
    .digest('hex');
};

WebhookSchema.methods.validateUrl = async function(): Promise<boolean> {
  try {
    // Basic URL validation
    if (!this.url.startsWith('https://')) {
      return false;
    }
    
    // Check if URL is reachable with a HEAD request
    const response = await axios.head(this.url, {
      timeout: 5000,
      validateStatus: (status) => status < 500 // Accept any status < 500
    });
    
    return response.status < 400;
  } catch (error) {
    return false;
  }
};

WebhookSchema.methods.recordDelivery = async function(attempt: DeliveryAttempt): Promise<void> {
  // Update statistics
  this.totalDeliveries += 1;
  this.totalResponseTime += attempt.responseTime;
  this.lastDeliveryAt = attempt.timestamp;
  this.lastResponseCode = attempt.responseCode;
  
  if (attempt.success) {
    this.successfulDeliveries += 1;
    this.lastSuccessAt = attempt.timestamp;
    this.retryCount = 0; // Reset retry count on success
    this.lastError = undefined;
  } else {
    this.failedDeliveries += 1;
    this.lastFailureAt = attempt.timestamp;
    this.lastError = attempt.error;
  }
  
  // Add to delivery attempts (keep only last 100)
  this.deliveryAttempts.push(attempt);
  if (this.deliveryAttempts.length > 100) {
    this.deliveryAttempts = this.deliveryAttempts.slice(-100);
  }
  
  await this.save();
};

WebhookSchema.methods.getStats = function(): WebhookStats {
  const averageResponseTime = this.totalDeliveries > 0 
    ? this.totalResponseTime / this.totalDeliveries 
    : 0;
    
  const successRate = this.totalDeliveries > 0 
    ? (this.successfulDeliveries / this.totalDeliveries) * 100 
    : 0;
  
  return {
    totalDeliveries: this.totalDeliveries,
    successfulDeliveries: this.successfulDeliveries,
    failedDeliveries: this.failedDeliveries,
    successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
    averageResponseTime: Math.round(averageResponseTime),
    lastDeliveryAt: this.lastDeliveryAt,
    lastSuccessAt: this.lastSuccessAt,
    lastFailureAt: this.lastFailureAt
  };
};

WebhookSchema.methods.shouldRetry = function(): boolean {
  // Don't retry if webhook is inactive
  if (!this.isActive) return false;
  
  // Don't retry if we've exceeded max retries
  if (this.retryCount >= 3) return false;
  
  // Don't retry if last attempt was successful
  if (this.lastResponseCode && this.lastResponseCode >= 200 && this.lastResponseCode < 300) {
    return false;
  }
  
  return true;
};

WebhookSchema.methods.incrementRetryCount = async function(): Promise<void> {
  this.retryCount += 1;
  await this.save();
};

WebhookSchema.methods.resetRetryCount = async function(): Promise<void> {
  this.retryCount = 0;
  await this.save();
};

WebhookSchema.methods.isHealthy = function(): boolean {
  // Consider webhook healthy if:
  // 1. It's active
  // 2. Success rate > 80% (if we have enough data)
  // 3. No recent failures (last 5 attempts)
  
  if (!this.isActive) return false;
  
  if (this.totalDeliveries >= 10) {
    const successRate = (this.successfulDeliveries / this.totalDeliveries) * 100;
    if (successRate < 80) return false;
  }
  
  // Check last 5 attempts
  const recentAttempts = this.deliveryAttempts.slice(-5);
  if (recentAttempts.length >= 3) {
    const recentFailures = recentAttempts.filter(attempt => !attempt.success).length;
    if (recentFailures >= 3) return false;
  }
  
  return true;
};

// Static Methods
WebhookSchema.statics.createWebhook = async function(webhookData: {
  userId: string;
  url: string;
  description?: string;
  eventTypes: EventType[];
}): Promise<IWebhook> {
  // Generate a secure random secret for HMAC signing
  const secret = crypto.randomBytes(32).toString('hex');
  
  // Validate URL before creating
  const urlValidation = await (this as any).validateWebhookUrl(webhookData.url);
  if (!urlValidation.valid) {
    throw new Error(`Invalid webhook URL: ${urlValidation.error || 'URL validation failed'}`);
  }
  
  const webhook = new this({
    userId: new Types.ObjectId(webhookData.userId),
    url: webhookData.url,
    description: webhookData.description,
    secret,
    eventTypes: webhookData.eventTypes,
    isActive: true
  });
  
  return await webhook.save();
};

WebhookSchema.statics.updateWebhook = async function(
  webhookId: string,
  userId: string,
  updates: {
    url?: string;
    description?: string;
    eventTypes?: EventType[];
    isActive?: boolean;
  }
): Promise<IWebhook | null> {
  // If URL is being updated, validate it first
  if (updates.url) {
    const urlValidation = await (this as any).validateWebhookUrl(updates.url);
    if (!urlValidation.valid) {
      throw new Error(`Invalid webhook URL: ${urlValidation.error || 'URL validation failed'}`);
    }
  }
  
  const webhook = await this.findOneAndUpdate(
    { 
      _id: new Types.ObjectId(webhookId),
      userId: new Types.ObjectId(userId)
    },
    { $set: updates },
    { new: true, runValidators: true }
  );
  
  return webhook;
};

WebhookSchema.statics.deleteWebhook = async function(
  webhookId: string,
  userId: string
): Promise<boolean> {
  const result = await this.deleteOne({
    _id: new Types.ObjectId(webhookId),
    userId: new Types.ObjectId(userId)
  });
  
  return result.deletedCount === 1;
};

WebhookSchema.statics.testWebhook = async function(
  webhookId: string,
  userId: string,
  testPayload: any = { test: true, timestamp: new Date().toISOString() }
): Promise<{
  success: boolean;
  responseCode?: number;
  responseTime: number;
  error?: string;
}> {
  const webhook = await this.findOne({
    _id: new Types.ObjectId(webhookId),
    userId: new Types.ObjectId(userId)
  });
  
  if (!webhook) {
    throw new Error('Webhook not found');
  }
  
  const startTime = Date.now();
  
  try {
    const payload = JSON.stringify(testPayload);
    const signature = webhook.generateSignature(payload);
    
    const response: AxiosResponse = await axios.post(webhook.url, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'User-Agent': 'WhatsApp-Integration-Webhook/1.0'
      },
      timeout: 30000, // 30 second timeout
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
    
    const responseTime = Date.now() - startTime;
    
    // Record the test delivery
    await webhook.recordDelivery({
      timestamp: new Date(),
      success: response.status >= 200 && response.status < 300,
      responseCode: response.status,
      responseTime,
      retryCount: 0
    });
    
    return {
      success: response.status >= 200 && response.status < 300,
      responseCode: response.status,
      responseTime
    };
    
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
    
    // Record the failed test delivery
    await webhook.recordDelivery({
      timestamp: new Date(),
      success: false,
      responseCode: error.response?.status,
      responseTime,
      error: errorMessage,
      retryCount: 0
    });
    
    return {
      success: false,
      responseCode: error.response?.status,
      responseTime,
      error: errorMessage
    };
  }
};

WebhookSchema.statics.getUserWebhooks = async function(
  userId: string,
  includeInactive: boolean = false
): Promise<IWebhook[]> {
  const query: any = { userId: new Types.ObjectId(userId) };
  
  if (!includeInactive) {
    query.isActive = true;
  }
  
  return await this.find(query)
    .sort({ createdAt: -1 })
    .lean();
};

WebhookSchema.statics.getWebhooksForEvent = async function(
  eventType: EventType,
  userId?: string
): Promise<IWebhook[]> {
  const query: any = {
    eventTypes: eventType,
    isActive: true
  };
  
  if (userId) {
    query.userId = new Types.ObjectId(userId);
  }
  
  return await this.find(query).lean();
};

WebhookSchema.statics.validateWebhookUrl = async function(url: string): Promise<{
  valid: boolean;
  reachable: boolean;
  error?: string;
}> {
  // Basic URL validation
  if (!url.startsWith('https://')) {
    return {
      valid: false,
      reachable: false,
      error: 'Webhook URL must use HTTPS'
    };
  }
  
  if (!VALIDATION_PATTERNS.URL.test(url)) {
    return {
      valid: false,
      reachable: false,
      error: 'Invalid URL format'
    };
  }
  
  // Domain whitelist check (optional - can be configured)
  const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  const urlObj = new URL(url);
  
  if (blockedDomains.some(domain => urlObj.hostname.includes(domain))) {
    return {
      valid: false,
      reachable: false,
      error: 'Localhost URLs are not allowed'
    };
  }
  
  // Check reachability
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: (status) => status < 500
    });
    
    return {
      valid: true,
      reachable: response.status < 400
    };
  } catch (error: any) {
    return {
      valid: true,
      reachable: false,
      error: error.message || 'URL not reachable'
    };
  }
};

WebhookSchema.statics.getWebhookStats = async function(
  webhookId: string,
  userId: string
): Promise<WebhookStats | null> {
  const webhook = await this.findOne({
    _id: new Types.ObjectId(webhookId),
    userId: new Types.ObjectId(userId)
  });
  
  if (!webhook) {
    return null;
  }
  
  return webhook.getStats();
};

WebhookSchema.statics.cleanupFailedWebhooks = async function(maxFailures: number = 10): Promise<number> {
  // Deactivate webhooks that have failed too many times consecutively
  const result = await this.updateMany(
    {
      isActive: true,
      retryCount: { $gte: maxFailures }
    },
    {
      $set: { isActive: false }
    }
  );
  
  return result.modifiedCount || 0;
};

// Pre-save middleware
WebhookSchema.pre('save', function(next) {
  // Ensure eventTypes array doesn't have duplicates
  if (this.isModified('eventTypes')) {
    const uniqueTypes = new Set(this.eventTypes);
    this.eventTypes = Array.from(uniqueTypes);
  }
  
  // Validate statistics consistency
  if (this.totalDeliveries !== (this.successfulDeliveries + this.failedDeliveries)) {
    // Fix inconsistency
    this.totalDeliveries = this.successfulDeliveries + this.failedDeliveries;
  }
  
  next();
});

// Pre-remove middleware
WebhookSchema.pre('deleteOne', { document: false, query: true }, async function(next) {
  // Could add cleanup logic here if needed (e.g., cancel pending deliveries)
  next();
});

// Create and export the model
export const Webhook: IWebhookModel = mongoose.model<IWebhook, IWebhookModel>('Webhook', WebhookSchema);