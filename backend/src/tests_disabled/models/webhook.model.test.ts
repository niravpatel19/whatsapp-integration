import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Webhook, IWebhook } from '../../models/Webhook.model';
import { User } from '../../models/User.model';
import { EventType } from '../../types/database.types';

describe('Webhook Model', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create a test user
    const testUser = new User({
      email: 'test@example.com',
      passwordHash: 'hashedpassword',
      name: 'Test User'
    });
    await testUser.save();
    testUserId = testUser._id as any;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Webhook.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid webhook', async () => {
      const webhookData = {
        userId: testUserId,
        url: 'https://example.com/webhook',
        description: 'Test webhook',
        secret: 'a'.repeat(32), // 32 character secret
        eventTypes: [EventType.MESSAGE_SENT, EventType.SESSION_STATE]
      };

      const webhook = new Webhook(webhookData);
      await expect(webhook.save()).resolves.toBeDefined();
    });

    it('should require HTTPS URL', async () => {
      const webhookData = {
        userId: testUserId,
        url: 'http://example.com/webhook', // HTTP not allowed
        secret: 'a'.repeat(32),
        eventTypes: [EventType.MESSAGE_SENT]
      };

      const webhook = new Webhook(webhookData);
      await expect(webhook.save()).rejects.toThrow('Webhook URL must be a valid HTTPS URL');
    });

    it('should validate event types', async () => {
      const webhookData = {
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'a'.repeat(32),
        eventTypes: ['INVALID_EVENT_TYPE'] // Invalid event type
      };

      const webhook = new Webhook(webhookData);
      await expect(webhook.save()).rejects.toThrow();
    });

    it('should require at least one event type', async () => {
      const webhookData = {
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'a'.repeat(32),
        eventTypes: [] // Empty array
      };

      const webhook = new Webhook(webhookData);
      await expect(webhook.save()).rejects.toThrow();
    });

    it('should require minimum secret length', async () => {
      const webhookData = {
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'short', // Too short
        eventTypes: [EventType.MESSAGE_SENT]
      };

      const webhook = new Webhook(webhookData);
      await expect(webhook.save()).rejects.toThrow();
    });
  });

  describe('Instance Methods', () => {
    let webhook: IWebhook;

    beforeEach(async () => {
      webhook = new Webhook({
        userId: testUserId,
        url: 'https://example.com/webhook',
        description: 'Test webhook',
        secret: 'a'.repeat(32),
        eventTypes: [EventType.MESSAGE_SENT, EventType.SESSION_STATE]
      });
      await webhook.save();
    });

    describe('generateSignature', () => {
      it('should generate HMAC-SHA256 signature', () => {
        const payload = '{"test": "data"}';
        const signature = webhook.generateSignature(payload);
        
        expect(signature).toBeDefined();
        expect(typeof signature).toBe('string');
        expect(signature.length).toBe(64); // SHA256 hex string length
      });

      it('should generate consistent signatures for same payload', () => {
        const payload = '{"test": "data"}';
        const signature1 = webhook.generateSignature(payload);
        const signature2 = webhook.generateSignature(payload);
        
        expect(signature1).toBe(signature2);
      });

      it('should generate different signatures for different payloads', () => {
        const payload1 = '{"test": "data1"}';
        const payload2 = '{"test": "data2"}';
        const signature1 = webhook.generateSignature(payload1);
        const signature2 = webhook.generateSignature(payload2);
        
        expect(signature1).not.toBe(signature2);
      });
    });

    describe('recordDelivery', () => {
      it('should record successful delivery', async () => {
        const attempt = {
          timestamp: new Date(),
          success: true,
          responseCode: 200,
          responseTime: 150,
          retryCount: 0
        };

        await webhook.recordDelivery(attempt);

        expect(webhook.totalDeliveries).toBe(1);
        expect(webhook.successfulDeliveries).toBe(1);
        expect(webhook.failedDeliveries).toBe(0);
        expect(webhook.lastResponseCode).toBe(200);
        expect(webhook.lastSuccessAt).toBeDefined();
        expect(webhook.retryCount).toBe(0);
        expect(webhook.deliveryAttempts).toHaveLength(1);
      });

      it('should record failed delivery', async () => {
        const attempt = {
          timestamp: new Date(),
          success: false,
          responseCode: 500,
          responseTime: 200,
          error: 'Internal server error',
          retryCount: 1
        };

        await webhook.recordDelivery(attempt);

        expect(webhook.totalDeliveries).toBe(1);
        expect(webhook.successfulDeliveries).toBe(0);
        expect(webhook.failedDeliveries).toBe(1);
        expect(webhook.lastResponseCode).toBe(500);
        expect(webhook.lastError).toBe('Internal server error');
        expect(webhook.lastFailureAt).toBeDefined();
        expect(webhook.deliveryAttempts).toHaveLength(1);
      });

      it('should reset retry count on successful delivery', async () => {
        // First, set a retry count
        webhook.retryCount = 2;
        await webhook.save();

        const successfulAttempt = {
          timestamp: new Date(),
          success: true,
          responseCode: 200,
          responseTime: 150,
          retryCount: 2
        };

        await webhook.recordDelivery(successfulAttempt);

        expect(webhook.retryCount).toBe(0);
      });

      it('should limit delivery attempts to 100', async () => {
        // Add 101 attempts
        for (let i = 0; i < 101; i++) {
          const attempt = {
            timestamp: new Date(),
            success: i % 2 === 0,
            responseCode: 200,
            responseTime: 100,
            retryCount: 0
          };
          await webhook.recordDelivery(attempt);
        }

        expect(webhook.deliveryAttempts).toHaveLength(100);
        expect(webhook.totalDeliveries).toBe(101);
      });
    });

    describe('getStats', () => {
      it('should return correct statistics', async () => {
        // Record some deliveries
        await webhook.recordDelivery({
          timestamp: new Date(),
          success: true,
          responseCode: 200,
          responseTime: 100,
          retryCount: 0
        });

        await webhook.recordDelivery({
          timestamp: new Date(),
          success: false,
          responseCode: 500,
          responseTime: 200,
          error: 'Error',
          retryCount: 0
        });

        const stats = webhook.getStats();

        expect(stats.totalDeliveries).toBe(2);
        expect(stats.successfulDeliveries).toBe(1);
        expect(stats.failedDeliveries).toBe(1);
        expect(stats.successRate).toBe(50);
        expect(stats.averageResponseTime).toBe(150);
      });

      it('should handle zero deliveries', () => {
        const stats = webhook.getStats();

        expect(stats.totalDeliveries).toBe(0);
        expect(stats.successfulDeliveries).toBe(0);
        expect(stats.failedDeliveries).toBe(0);
        expect(stats.successRate).toBe(0);
        expect(stats.averageResponseTime).toBe(0);
      });
    });

    describe('shouldRetry', () => {
      it('should allow retry for failed webhook with low retry count', () => {
        webhook.isActive = true;
        webhook.retryCount = 1;
        webhook.lastResponseCode = 500;

        expect(webhook.shouldRetry()).toBe(true);
      });

      it('should not retry inactive webhook', () => {
        webhook.isActive = false;
        webhook.retryCount = 1;
        webhook.lastResponseCode = 500;

        expect(webhook.shouldRetry()).toBe(false);
      });

      it('should not retry after max retries', () => {
        webhook.isActive = true;
        webhook.retryCount = 3;
        webhook.lastResponseCode = 500;

        expect(webhook.shouldRetry()).toBe(false);
      });

      it('should not retry successful webhook', () => {
        webhook.isActive = true;
        webhook.retryCount = 1;
        webhook.lastResponseCode = 200;

        expect(webhook.shouldRetry()).toBe(false);
      });
    });

    describe('isHealthy', () => {
      it('should be healthy for new active webhook', () => {
        webhook.isActive = true;
        expect(webhook.isHealthy()).toBe(true);
      });

      it('should not be healthy if inactive', () => {
        webhook.isActive = false;
        expect(webhook.isHealthy()).toBe(false);
      });

      it('should not be healthy with low success rate', async () => {
        webhook.isActive = true;
        
        // Add 10 failed deliveries
        for (let i = 0; i < 10; i++) {
          await webhook.recordDelivery({
            timestamp: new Date(),
            success: false,
            responseCode: 500,
            responseTime: 100,
            error: 'Error',
            retryCount: 0
          });
        }

        expect(webhook.isHealthy()).toBe(false);
      });

      it('should not be healthy with recent consecutive failures', async () => {
        webhook.isActive = true;
        
        // Add 3 recent failed deliveries
        for (let i = 0; i < 3; i++) {
          await webhook.recordDelivery({
            timestamp: new Date(),
            success: false,
            responseCode: 500,
            responseTime: 100,
            error: 'Error',
            retryCount: 0
          });
        }

        expect(webhook.isHealthy()).toBe(false);
      });
    });
  });

  describe('Static Methods', () => {
    describe('createWebhook', () => {
      it('should create webhook with generated secret', async () => {
        const webhookData = {
          userId: testUserId.toString(),
          url: 'https://example.com/webhook',
          description: 'Test webhook',
          eventTypes: [EventType.MESSAGE_SENT]
        };

        const webhook = await Webhook.createWebhook(webhookData);

        expect(webhook).toBeDefined();
        expect(webhook.secret).toBeDefined();
        expect(webhook.secret.length).toBe(64); // 32 bytes as hex
        expect(webhook.isActive).toBe(true);
      });

      it('should validate URL before creating', async () => {
        const webhookData = {
          userId: testUserId.toString(),
          url: 'https://nonexistent-domain-12345.com/webhook',
          eventTypes: [EventType.MESSAGE_SENT]
        };

        await expect(Webhook.createWebhook(webhookData)).rejects.toThrow('Invalid webhook URL');
      });
    });

    describe('updateWebhook', () => {
      let webhook: IWebhook;

      beforeEach(async () => {
        webhook = await Webhook.createWebhook({
          userId: testUserId.toString(),
          url: 'https://httpbin.org/post',
          eventTypes: [EventType.MESSAGE_SENT]
        });
      });

      it('should update webhook properties', async () => {
        const updates = {
          description: 'Updated description',
          eventTypes: [EventType.MESSAGE_SENT, EventType.SESSION_STATE],
          isActive: false
        };

        const updatedWebhook = await Webhook.updateWebhook(
          webhook._id.toString(),
          testUserId.toString(),
          updates
        );

        expect(updatedWebhook).toBeDefined();
        expect(updatedWebhook!.description).toBe('Updated description');
        expect(updatedWebhook!.eventTypes).toEqual([EventType.MESSAGE_SENT, EventType.SESSION_STATE]);
        expect(updatedWebhook!.isActive).toBe(false);
      });

      it('should validate URL when updating', async () => {
        const updates = {
          url: 'https://nonexistent-domain-12345.com/webhook'
        };

        await expect(Webhook.updateWebhook(
          webhook._id.toString(),
          testUserId.toString(),
          updates
        )).rejects.toThrow('Invalid webhook URL');
      });

      it('should return null for non-existent webhook', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const updates = { description: 'Updated' };

        const result = await Webhook.updateWebhook(
          fakeId.toString(),
          testUserId.toString(),
          updates
        );

        expect(result).toBeNull();
      });
    });

    describe('deleteWebhook', () => {
      let webhook: IWebhook;

      beforeEach(async () => {
        webhook = await Webhook.createWebhook({
          userId: testUserId.toString(),
          url: 'https://httpbin.org/post',
          eventTypes: [EventType.MESSAGE_SENT]
        });
      });

      it('should delete existing webhook', async () => {
        const result = await Webhook.deleteWebhook(
          webhook._id.toString(),
          testUserId.toString()
        );

        expect(result).toBe(true);

        const deletedWebhook = await Webhook.findById(webhook._id);
        expect(deletedWebhook).toBeNull();
      });

      it('should return false for non-existent webhook', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const result = await Webhook.deleteWebhook(
          fakeId.toString(),
          testUserId.toString()
        );

        expect(result).toBe(false);
      });
    });

    describe('getUserWebhooks', () => {
      beforeEach(async () => {
        // Create active webhook
        await Webhook.createWebhook({
          userId: testUserId.toString(),
          url: 'https://httpbin.org/post',
          eventTypes: [EventType.MESSAGE_SENT]
        });

        // Create inactive webhook
        const inactiveWebhook = await Webhook.createWebhook({
          userId: testUserId.toString(),
          url: 'https://httpbin.org/post',
          eventTypes: [EventType.SESSION_STATE]
        });
        inactiveWebhook.isActive = false;
        await inactiveWebhook.save();
      });

      it('should return only active webhooks by default', async () => {
        const webhooks = await Webhook.getUserWebhooks(testUserId.toString());
        expect(webhooks).toHaveLength(1);
        expect(webhooks[0].isActive).toBe(true);
      });

      it('should return all webhooks when includeInactive is true', async () => {
        const webhooks = await Webhook.getUserWebhooks(testUserId.toString(), true);
        expect(webhooks).toHaveLength(2);
      });
    });

    describe('getWebhooksForEvent', () => {
      beforeEach(async () => {
        await Webhook.createWebhook({
          userId: testUserId.toString(),
          url: 'https://httpbin.org/post',
          eventTypes: [EventType.MESSAGE_SENT, EventType.SESSION_STATE]
        });

        await Webhook.createWebhook({
          userId: testUserId.toString(),
          url: 'https://httpbin.org/post',
          eventTypes: [EventType.SESSION_STATE]
        });
      });

      it('should return webhooks configured for specific event type', async () => {
        const webhooks = await Webhook.getWebhooksForEvent(EventType.SESSION_STATE);
        expect(webhooks).toHaveLength(2);

        const messageSentWebhooks = await Webhook.getWebhooksForEvent(EventType.MESSAGE_SENT);
        expect(messageSentWebhooks).toHaveLength(1);
      });

      it('should filter by user when userId provided', async () => {
        const webhooks = await Webhook.getWebhooksForEvent(
          EventType.SESSION_STATE,
          testUserId.toString()
        );
        expect(webhooks).toHaveLength(2);
      });
    });

    describe('validateWebhookUrl', () => {
      it('should reject HTTP URLs', async () => {
        const result = await Webhook.validateWebhookUrl('http://example.com/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Webhook URL must use HTTPS');
      });

      it('should reject invalid URL format', async () => {
        const result = await Webhook.validateWebhookUrl('not-a-url');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid URL format');
      });

      it('should reject localhost URLs', async () => {
        const result = await Webhook.validateWebhookUrl('https://localhost:3000/webhook');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Localhost URLs are not allowed');
      });

      it('should accept valid HTTPS URLs', async () => {
        const result = await Webhook.validateWebhookUrl('https://httpbin.org/post');
        expect(result.valid).toBe(true);
        expect(result.reachable).toBe(true);
      });
    });

    describe('cleanupFailedWebhooks', () => {
      beforeEach(async () => {
        // Create webhook with high retry count
        const webhook = await Webhook.createWebhook({
          userId: testUserId.toString(),
          url: 'https://httpbin.org/post',
          eventTypes: [EventType.MESSAGE_SENT]
        });
        webhook.retryCount = 10;
        await webhook.save();

        // Create normal webhook
        await Webhook.createWebhook({
          userId: testUserId.toString(),
          url: 'https://httpbin.org/post',
          eventTypes: [EventType.SESSION_STATE]
        });
      });

      it('should deactivate webhooks with high failure count', async () => {
        const deactivatedCount = await Webhook.cleanupFailedWebhooks(5);
        expect(deactivatedCount).toBe(1);

        const webhooks = await Webhook.find({ isActive: false });
        expect(webhooks).toHaveLength(1);
        expect(webhooks[0].retryCount).toBe(10);
      });
    });
  });

  describe('Indexes', () => {
    it('should have proper indexes', async () => {
      const indexes = await Webhook.collection.getIndexes();
      
      // Check that required indexes exist
      const indexNames = Object.keys(indexes);
      expect(indexNames).toContain('userId_1_isActive_1');
      expect(indexNames).toContain('userId_1_createdAt_-1');
    });
  });

  describe('Pre-save Middleware', () => {
    it('should remove duplicate event types', async () => {
      const webhook = new Webhook({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'a'.repeat(32),
        eventTypes: [EventType.MESSAGE_SENT, EventType.MESSAGE_SENT, EventType.SESSION_STATE]
      });

      await webhook.save();
      expect(webhook.eventTypes).toHaveLength(2);
      expect(webhook.eventTypes).toContain(EventType.MESSAGE_SENT);
      expect(webhook.eventTypes).toContain(EventType.SESSION_STATE);
    });

    it('should fix statistics inconsistency', async () => {
      const webhook = new Webhook({
        userId: testUserId,
        url: 'https://example.com/webhook',
        secret: 'a'.repeat(32),
        eventTypes: [EventType.MESSAGE_SENT],
        totalDeliveries: 10,
        successfulDeliveries: 3,
        failedDeliveries: 5 // Should be 7 to match total
      });

      await webhook.save();
      expect(webhook.totalDeliveries).toBe(8); // 3 + 5
    });
  });
});