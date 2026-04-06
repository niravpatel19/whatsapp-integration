import { Document } from 'mongoose';

// Common database interfaces and types
export interface BaseDocument extends Document {
  createdAt: Date;
  updatedAt: Date;
}

// User related types
export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted'
}

// Session related types
export enum SessionStatus {
  PENDING = 'PENDING',
  QR = 'QR',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING', // New: Attempting to reconnect
  EXPIRED = 'EXPIRED',
  ERROR = 'ERROR'
}

// Notification related types
export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SUPPRESSED = 'SUPPRESSED' // Suppressed to avoid spam
}

export enum NotificationType {
  SESSION_DISCONNECTED = 'SESSION_DISCONNECTED',
  SESSION_RECONNECTED = 'SESSION_RECONNECTED',
  SESSION_ERROR = 'SESSION_ERROR',
  SESSION_EXPIRED = 'SESSION_EXPIRED'
}

export interface DeviceInfo {
  name: string;
  platform: string;
  version: string;
  browser?: string;
  os?: string;
}

// Message related types
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  DOCUMENT = 'document',
  AUDIO = 'audio',
  VIDEO = 'video',
  STICKER = 'sticker',
  LOCATION = 'location',
  BUTTONS = 'buttons'
}

export enum MessageStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED'
}

// Event related types
export enum EventType {
  SESSION_STATE = 'SESSION_STATE',
  SESSION_DELETED = 'SESSION_DELETED',
  MESSAGE_SENT = 'MESSAGE_SENT',
  MESSAGE_DELIVERED = 'MESSAGE_DELIVERED',
  MESSAGE_READ = 'MESSAGE_READ',
  QR_REFRESHED = 'QR_REFRESHED',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  ERROR = 'ERROR',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTED = 'RECONNECTED'
}

// Audit log related types
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  API_KEY_GENERATED = 'API_KEY_GENERATED',
  SESSION_CREATED = 'SESSION_CREATED',
  MESSAGE_SENT = 'MESSAGE_SENT'
}

// API Key permissions
export enum APIKeyPermission {
  SESSIONS_READ = 'sessions:read',
  SESSIONS_WRITE = 'sessions:write',
  MESSAGES_SEND = 'messages:send',
  MESSAGES_READ = 'messages:read',
  EVENTS_READ = 'events:read',
  WEBHOOKS_MANAGE = 'webhooks:manage',
  ADMIN = 'admin'
}

// Common validation patterns
export const VALIDATION_PATTERNS = {
  EMAIL: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  PHONE_E164: /^\+[1-9]\d{1,14}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/
};

// Common field length limits
export const FIELD_LIMITS = {
  EMAIL_MAX: 254,
  NAME_MAX: 100,
  LABEL_MAX: 50,
  DESCRIPTION_MAX: 500,
  CONTENT_MAX: 4096,
  URL_MAX: 2048,
  PHONE_MAX: 20
};