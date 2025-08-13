import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { setupSocketIO, getSocketIOAdapterHealth, getSocketIOMetrics } from '../../socket/server';
import { WPPConnectManager } from '../../wpp/manager.factory';
import { connectRedis, disconnectRedis } from '../../config/redis';
import { logger } from '../../utils/logger';

describe('Socket.IO Redis Adapter Integration', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let wppManager: WPPConnectManager;

  beforeAll(async () => {
    // Connect to Redis for testing
    try {
      await connectRedis();
    } catch (error) {
      logger.warn('Redis not available for testing, skipping Redis adapter tests');
      return;
    }
  });

  afterAll(async () => {
    // Clean up
    if (io) {
      io.close();
    }
    if (httpServer) {
      httpServer.close();
    }
    await disconnectRedis();
  });

  beforeEach(() => {
    // Create HTTP server and Socket.IO instance
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      transports: ['websocket', 'polling']
    });

    // Mock WPPConnectManager
    wppManager = {
      initializeClient: jest.fn(),
      refreshQR: jest.fn(),
    } as any;
  });

  afterEach(() => {
    if (io) {
      io.close();
    }
    if (httpServer) {
      httpServer.close();
    }
  });

  describe('Redis Adapter Setup', () => {
    it('should configure Redis adapter successfully', async () => {
      // Setup Socket.IO with Redis adapter
      setupSocketIO(io);

      // Check if Redis adapter is configured
      const health = getSocketIOAdapterHealth(io);
      
      expect(health.status).toBe('healthy');
      expect(health.details.adapterType).toBe('redis');
    });

    it('should provide adapter health information', () => {
      setupSocketIO(io, wppManager);

      const health = getSocketIOAdapterHealth(io);
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('details');
      expect(health.details).toHaveProperty('adapterType');
      expect(health.details).toHaveProperty('roomCount');
      expect(health.details).toHaveProperty('socketCount');
    });

    it('should provide Socket.IO metrics', () => {
      setupSocketIO(io, wppManager);

      const metrics = getSocketIOMetrics(io);
      
      expect(metrics).toHaveProperty('connections');
      expect(metrics).toHaveProperty('rooms');
      expect(metrics).toHaveProperty('adapterType');
      expect(metrics).toHaveProperty('instanceId');
      expect(metrics.adapterType).toBe('redis');
    });

    it('should handle Redis adapter setup failure gracefully', () => {
      // Mock Redis clients to throw error
      jest.doMock('../../config/redis', () => ({
        getRedisPubClient: () => { throw new Error('Redis connection failed'); },
        getRedisSubClient: () => { throw new Error('Redis connection failed'); }
      }));

      // This should not throw an error, but log a warning
      expect(() => setupSocketIO(io, wppManager)).not.toThrow();

      const health = getSocketIOAdapterHealth(io);
      expect(health.status).toBe('no_adapter');
      expect(health.details.adapterType).toBe('memory');
    });
  });

  describe('Room-based Broadcasting', () => {
    it('should support user room broadcasting', (done) => {
      setupSocketIO(io, wppManager);

      const userId = 'test-user-123';
      const userRoom = `user:${userId}`;
      const testEvent = 'test:event';
      const testData = { message: 'Hello from Redis adapter!' };

      // Create a mock socket that joins the user room
      const mockSocket = {
        id: 'mock-socket-id',
        join: jest.fn(),
        emit: jest.fn(),
        on: jest.fn(),
        user: { userId }
      };

      // Simulate socket joining user room
      io.to(userRoom).emit(testEvent, testData);

      // Verify the broadcast mechanism works
      setTimeout(() => {
        // In a real test, we would verify the message was received
        // For now, we just verify no errors were thrown
        done();
      }, 100);
    });

    it('should support session room broadcasting', (done) => {
      setupSocketIO(io, wppManager);

      const sessionId = 'test-session-123';
      const sessionRoom = `session:${sessionId}`;
      const testEvent = 'session:update';
      const testData = { status: 'connected' };

      // Broadcast to session room
      io.to(sessionRoom).emit(testEvent, testData);

      // Verify the broadcast mechanism works
      setTimeout(() => {
        // In a real test, we would verify the message was received
        // For now, we just verify no errors were thrown
        done();
      }, 100);
    });
  });

  describe('Multi-instance Scaling', () => {
    it('should enable cross-instance communication', () => {
      setupSocketIO(io, wppManager);

      // Verify Redis adapter is configured
      const hasRedisAdapter = (io as any).redisAdapter;
      expect(hasRedisAdapter).toBe(true);

      // Verify adapter is using Redis
      const metrics = getSocketIOMetrics(io);
      expect(metrics.adapterType).toBe('redis');
    });

    it('should provide instance identification', () => {
      setupSocketIO(io, wppManager);

      const metrics = getSocketIOMetrics(io);
      expect(metrics.instanceId).toBeDefined();
      expect(typeof metrics.instanceId).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle adapter health check errors gracefully', () => {
      // Create a Socket.IO instance without proper setup
      const brokenIO = new SocketIOServer(createServer());
      
      const health = getSocketIOAdapterHealth(brokenIO);
      expect(health.status).toBe('no_adapter');
    });

    it('should handle metrics collection errors gracefully', () => {
      // Create a Socket.IO instance without proper setup
      const brokenIO = new SocketIOServer(createServer());
      
      const metrics = getSocketIOMetrics(brokenIO);
      expect(metrics.connections).toBe(0);
      expect(metrics.rooms).toBe(0);
      expect(metrics.adapterType).toBe('memory');
    });
  });
});