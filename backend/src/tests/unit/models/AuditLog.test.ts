import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuditLog } from '../../../models/AuditLog.model';
import { User } from '../../../models/User.model';
import { AuditAction } from '../../../types/database.types';

describe('AuditLog Model', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create a test user
    const testUser = await User.createUser({
      email: 'test@example.com',
      password: 'TestPassword123!',
      name: 'Test User'
    });
    testUserId = testUser._id as mongoose.Types.ObjectId;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await AuditLog.deleteMany({});
  });

  describe('Schema Validation', () => {
    it('should create a valid audit log', async () => {
      const auditData = {
        userId: testUserId,
        actor: 'test@example.com',
        action: AuditAction.LOGIN,
        targetType: 'User',
        targetId: testUserId.toString(),
        metadata: { success: true },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0 Test Browser',
        hash: 'test-hash-value-64-chars-long-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      };

      const auditLog = new AuditLog(auditData);
      const savedLog = await auditLog.save();

      expect(savedLog.userId).toEqual(testUserId);
      expect(savedLog.actor).toBe('test@example.com');
      expect(savedLog.action).toBe(AuditAction.LOGIN);
      expect(savedLog.targetType).toBe('User');
      expect(savedLog.targetId).toBe(testUserId.toString());
      expect(savedLog.metadata).toEqual({ success: true });
      expect(savedLog.ipAddress).toBe('192.168.1.1');
      expect(savedLog.userAgent).toBe('Mozilla/5.0 Test Browser');
      expect(savedLog.createdAt).toBeDefined();
    });

    it('should require userId, actor, action, targetType, and hash', async () => {
      const auditLog = new AuditLog({});

      await expect(auditLog.save()).rejects.toThrow();
    });

    it('should validate action enum', async () => {
      const auditLog = new AuditLog({
        userId: testUserId,
        actor: 'test@example.com',
        action: 'INVALID_ACTION' as any,
        targetType: 'User',
        hash: 'test-hash-value-64-chars-long-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      });

      await expect(auditLog.save()).rejects.toThrow();
    });
  });

  describe('Static Methods', () => {
    describe('logAction', () => {
      it('should create audit log with hash chaining', async () => {
        const auditData = {
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.LOGIN,
          targetType: 'User',
          targetId: testUserId.toString(),
          metadata: { success: true },
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Test Browser'
        };

        const auditLog = await AuditLog.logAction(auditData);

        expect(auditLog.userId).toEqual(testUserId);
        expect(auditLog.actor).toBe('test@example.com');
        expect(auditLog.action).toBe(AuditAction.LOGIN);
        expect(auditLog.hash).toBeDefined();
        expect(auditLog.hash).toHaveLength(64); // SHA-256 hex length
        expect(auditLog.previousHash).toBeUndefined(); // First log has no previous hash
      });

      it('should chain hashes correctly', async () => {
        // Create first audit log
        const firstLog = await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.LOGIN,
          targetType: 'User'
        });

        // Create second audit log
        const secondLog = await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.LOGOUT,
          targetType: 'User'
        });

        expect(secondLog.previousHash).toBe(firstLog.hash);
        expect(secondLog.hash).not.toBe(firstLog.hash);
      });
    });

    describe('getAuditTrail', () => {
      beforeEach(async () => {
        // Create test audit logs
        await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.LOGIN,
          targetType: 'User'
        });

        await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.SESSION_CREATED,
          targetType: 'Session',
          targetId: 'session-123'
        });

        await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.MESSAGE_SENT,
          targetType: 'Message',
          targetId: 'message-456'
        });
      });

      it('should return all logs for user', async () => {
        const result = await AuditLog.getAuditTrail({
          userId: testUserId.toString()
        });

        expect(result.logs).toHaveLength(3);
        expect(result.total).toBe(3);
      });

      it('should filter by action', async () => {
        const result = await AuditLog.getAuditTrail({
          userId: testUserId.toString(),
          action: AuditAction.LOGIN
        });

        expect(result.logs).toHaveLength(1);
        expect(result.logs[0]?.action).toBe(AuditAction.LOGIN);
      });

      it('should filter by target type', async () => {
        const result = await AuditLog.getAuditTrail({
          userId: testUserId.toString(),
          targetType: 'Session'
        });

        expect(result.logs).toHaveLength(1);
        expect(result.logs[0]?.targetType).toBe('Session');
      });

      it('should support pagination', async () => {
        const result = await AuditLog.getAuditTrail({
          userId: testUserId.toString(),
          limit: 2,
          skip: 1
        });

        expect(result.logs).toHaveLength(2);
        expect(result.total).toBe(3);
      });
    });

    describe('getUserActivityPatterns', () => {
      beforeEach(async () => {
        // Create test logs with different actions
        const actions = [
          AuditAction.LOGIN,
          AuditAction.LOGIN,
          AuditAction.SESSION_CREATED,
          AuditAction.MESSAGE_SENT,
          AuditAction.MESSAGE_SENT,
          AuditAction.MESSAGE_SENT,
          AuditAction.LOGOUT
        ];

        for (const action of actions) {
          await AuditLog.logAction({
            userId: testUserId.toString(),
            actor: 'test@example.com',
            action,
            targetType: action === AuditAction.LOGIN || action === AuditAction.LOGOUT ? 'User' : 
                        action === AuditAction.SESSION_CREATED ? 'Session' : 'Message'
          });
        }
      });

      it('should return activity patterns', async () => {
        const patterns = await AuditLog.getUserActivityPatterns(testUserId.toString(), 30);

        expect(patterns.totalActions).toBe(7);
        expect(patterns.actionsByType[AuditAction.LOGIN]).toBe(2);
        expect(patterns.actionsByType[AuditAction.MESSAGE_SENT]).toBe(3);
        expect(patterns.actionsByType[AuditAction.SESSION_CREATED]).toBe(1);
        expect(patterns.actionsByType[AuditAction.LOGOUT]).toBe(1);
        expect(patterns.dailyActivity).toBeDefined();
        expect(patterns.suspiciousPatterns).toBeDefined();
      });
    });

    describe('detectSecurityEvents', () => {
      it('should detect multiple failed logins', async () => {
        // Create multiple failed login attempts
        for (let i = 0; i < 6; i++) {
          await AuditLog.logAction({
            userId: testUserId.toString(),
            actor: 'test@example.com',
            action: AuditAction.LOGIN,
            targetType: 'User',
            metadata: { success: false }
          });
        }

        const securityEvents = await AuditLog.detectSecurityEvents(24);

        expect(securityEvents).toHaveLength(1);
        expect(securityEvents[0]?.type).toBe('MULTIPLE_FAILED_LOGINS');
        expect(securityEvents[0]?.severity).toBe('high');
        expect(securityEvents[0]?.count).toBe(6);
      });

      it('should detect excessive API key generation', async () => {
        // Create multiple API key generation events
        for (let i = 0; i < 6; i++) {
          await AuditLog.logAction({
            userId: testUserId.toString(),
            actor: 'test@example.com',
            action: AuditAction.API_KEY_GENERATED,
            targetType: 'APIKey',
            targetId: `key-${i}`
          });
        }

        const securityEvents = await AuditLog.detectSecurityEvents(24);

        expect(securityEvents).toHaveLength(1);
        expect(securityEvents[0]?.type).toBe('EXCESSIVE_API_KEY_GENERATION');
        expect(securityEvents[0]?.severity).toBe('medium');
      });
    });

    describe('verifyIntegrity', () => {
      it('should verify integrity of valid logs', async () => {
        // Create a chain of logs
        await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.LOGIN,
          targetType: 'User'
        });

        await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.LOGOUT,
          targetType: 'User'
        });

        const result = await AuditLog.verifyIntegrity();

        expect(result.isValid).toBe(true);
        expect(result.corruptedLogs).toHaveLength(0);
        expect(result.totalChecked).toBe(2);
      });
    });

    describe('exportAuditData', () => {
      beforeEach(async () => {
        await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.LOGIN,
          targetType: 'User',
          ipAddress: '192.168.1.1',
          userAgent: 'Test Browser'
        });
      });

      it('should export data as JSON', async () => {
        const exportData = await AuditLog.exportAuditData({
          userId: testUserId.toString(),
          format: 'json'
        });

        const parsedData = JSON.parse(exportData);
        expect(Array.isArray(parsedData)).toBe(true);
        expect(parsedData).toHaveLength(1);
        expect(parsedData[0].action).toBe(AuditAction.LOGIN);
      });

      it('should export data as CSV', async () => {
        const exportData = await AuditLog.exportAuditData({
          userId: testUserId.toString(),
          format: 'csv'
        });

        expect(typeof exportData).toBe('string');
        expect(exportData).toContain('Date,User,Actor,Action,Target Type');
        expect(exportData).toContain('LOGIN');
      });
    });

    describe('cleanupOldLogs', () => {
      it('should delete old logs', async () => {
        // Create an old log by manually setting createdAt
        const oldDate = new Date();
        oldDate.setFullYear(oldDate.getFullYear() - 8); // 8 years ago

        const oldLog = new AuditLog({
          userId: testUserId,
          actor: 'test@example.com',
          action: AuditAction.LOGIN,
          targetType: 'User',
          hash: 'test-hash-value-64-chars-long-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          createdAt: oldDate
        });
        await oldLog.save();

        // Create a recent log
        await AuditLog.logAction({
          userId: testUserId.toString(),
          actor: 'test@example.com',
          action: AuditAction.LOGOUT,
          targetType: 'User'
        });

        const result = await AuditLog.cleanupOldLogs(7);

        expect(result.deletedCount).toBe(1);

        // Verify recent log still exists
        const remainingLogs = await AuditLog.find({});
        expect(remainingLogs).toHaveLength(1);
        expect(remainingLogs[0]?.action).toBe(AuditAction.LOGOUT);
      });
    });
  });
});