import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Webhook } from '../../models/Webhook.model';
import { EventType } from '../../types/database.types';

describe('Webhook Model - Simple Tests', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    testUserId = new mongoose.Types.ObjectId();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
      await Webhook.deleteMany({});
    }
  });

  it('should create a webhook with valid data', async () => {
    const webhookData = {
      userId: testUserId,
      url: 'https://example.com/webhook',
      description: 'Test webhook',
      secret: 'a'.repeat(32),
      eventTypes: [EventType.MESSAGE_SENT]
    };

    const webhook = new Webhook(webhookData);
    const savedWebhook = await webhook.save();

    expect(savedWebhook).toBeDefined();
    expect(savedWebhook.url).toBe('https://example.com/webhook');
    expect(savedWebhook.eventTypes).toContain(EventType.MESSAGE_SENT);
    expect(savedWebhook.isActive).toBe(true);
  });

  it('should generate HMAC signature correctly', async () => {
    const webhook = new Webhook({
      userId: testUserId,
      url: 'https://example.com/webhook',
      secret: 'test-secret-key-32-characters-long',
      eventTypes: [EventType.MESSAGE_SENT]
    });

    const payload = '{"test": "data"}';
    const signature = webhook.generateSignature(payload);

    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBe(64); // SHA256 hex string
  });

  it('should record delivery attempts correctly', async () => {
    const webhook = new Webhook({
      userId: testUserId,
      url: 'https://example.com/webhook',
      secret: 'a'.repeat(32),
      eventTypes: [EventType.MESSAGE_SENT]
    });
    await webhook.save();

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
    expect(webhook.deliveryAttempts).toHaveLength(1);
  });

  it('should validate webhook URL format', async () => {
    const webhookData = {
      userId: testUserId,
      url: 'http://example.com/webhook', // HTTP not allowed
      secret: 'a'.repeat(32),
      eventTypes: [EventType.MESSAGE_SENT]
    };

    const webhook = new Webhook(webhookData);
    await expect(webhook.save()).rejects.toThrow();
  });

  it('should validate event types', async () => {
    const webhookData = {
      userId: testUserId,
      url: 'https://example.com/webhook',
      secret: 'a'.repeat(32),
      eventTypes: ['INVALID_EVENT'] as any
    };

    const webhook = new Webhook(webhookData);
    await expect(webhook.save()).rejects.toThrow();
  });
});