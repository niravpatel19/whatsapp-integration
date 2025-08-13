// MongoDB initialization script
db = db.getSiblingDB('whatsapp-integration');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'passwordHash', 'name'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        passwordHash: {
          bsonType: 'string'
        },
        name: {
          bsonType: 'string',
          minLength: 1,
          maxLength: 100
        },
        twoFAEnabled: {
          bsonType: 'bool'
        },
        twoFASecret: {
          bsonType: 'string'
        }
      }
    }
  }
});

db.createCollection('sessions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'sessionId', 'status'],
      properties: {
        userId: {
          bsonType: 'objectId'
        },
        sessionId: {
          bsonType: 'string'
        },
        status: {
          bsonType: 'string',
          enum: ['PENDING', 'QR', 'CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR']
        }
      }
    }
  }
});

db.createCollection('messages', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'sessionId', 'messageId', 'to', 'type', 'status'],
      properties: {
        userId: {
          bsonType: 'objectId'
        },
        sessionId: {
          bsonType: 'string'
        },
        messageId: {
          bsonType: 'string'
        },
        to: {
          bsonType: 'string'
        },
        type: {
          bsonType: 'string',
          enum: ['text', 'image', 'document', 'audio', 'video', 'sticker', 'location']
        },
        status: {
          bsonType: 'string',
          enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED']
        }
      }
    }
  }
});

// Create indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ createdAt: 1 });

db.sessions.createIndex({ userId: 1, sessionId: 1 }, { unique: true });
db.sessions.createIndex({ userId: 1, status: 1 });
db.sessions.createIndex({ userId: 1, createdAt: 1 });

db.messages.createIndex({ userId: 1, sessionId: 1, createdAt: 1 });
db.messages.createIndex({ messageId: 1 }, { unique: true });
db.messages.createIndex({ userId: 1, status: 1 });

db.events.createIndex({ userId: 1, createdAt: 1 });
db.events.createIndex({ sessionId: 1, type: 1, createdAt: 1 });
db.events.createIndex({ type: 1, createdAt: 1 });

db.webhooks.createIndex({ userId: 1, isActive: 1 });
db.webhooks.createIndex({ userId: 1, createdAt: 1 });

db.apiKeys.createIndex({ userId: 1, createdAt: 1 });
db.apiKeys.createIndex({ keyHash: 1 }, { unique: true });
db.apiKeys.createIndex({ userId: 1, revokedAt: 1 });

db.auditLogs.createIndex({ userId: 1, createdAt: 1 });
db.auditLogs.createIndex({ action: 1, createdAt: 1 });
db.auditLogs.createIndex({ targetType: 1, targetId: 1 });

// TTL indexes
db.qrEvents.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.events.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

print('MongoDB initialization completed successfully');
print('Collections created with validation rules');
print('Indexes created for optimal performance');