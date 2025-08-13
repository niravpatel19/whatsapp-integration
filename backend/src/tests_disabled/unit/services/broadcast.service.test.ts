import { BroadcastService } from '../../../services/broadcast.service';
import { Server as SocketIOServer } from 'socket.io';
import { QREvent } from '../../../models/QREvent.model';
import { Event } from '../../../models/Event.model';
import { EventType } from '../../../types/database.types';
import { AuthenticatedSocket } from '../../../socket/auth';

// Mock dependencies
jest.mock('../../../models/QREvent.model');
jest.mock('../../../models/Event.model');
jest.mock('../../../utils/logger');

describe('BroadcastService', () => {
  let broadcastService: BroadcastService;
  let mockIo: jest.Mocked<SocketIOServer>;
  let mockSocket: jest.Mocked<AuthenticatedSocket>;

  beforeEach(() => {
    // Reset singleton instance
    (BroadcastService as any).instance = undefined;
    broadcastService = BroadcastService.getInstance();

    // Mock Socket.IO server
    mockSocket = {
      id: 'socket-123',
      user: {
        userId: 'user-123',
        email: 'test@example.com',
        permissions: ['api']
      },
      emit: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      disconnect: jest.fn()
    } as any;

    mockIo = {
      fetchSockets: jest.fn().mockResolvedValue([mockSocket]),
      emit: jest.fn(),
      on: jest.fn(),
      use: jest.fn()
    } as any;

    // Mock Event.recordEvent
    (Event.recordEvent as jest.Mock).mockResolvedValue({
      _id: 'event-123',
      userId: 'user-123',
      sessionId: 'session-123',
      type: EventType.QR_REFRESHED,
      payload: {}
    });
  });

  afterEach(() => {
    broadcastService.shutdown();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with Socket.IO server', () => {
      broadcastService.initialize(mockIo);
      expect(mockIo).toBeDefined();
    });

    it('should be a singleton', () => {
      const instance1 = BroadcastService.getInstance();
      const instance2 = BroadcastService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('broadcastQRUpdate', () => {
    beforeEach(() => {
      broadcastService.initialize(mockIo);
    });

    it('should broadcast QR update to user sockets with session-specific delivery', async () => {
      const userId = 'user-123';
      const sessionId = 'session-123';
      const qrData = 'mock-qr-data';
      const expiresAt = new Date(Date.now() + 60000); // 1 minute from now
      const tries = 1;

      // Mock socket emit with acknowledgment
      mockSocket.emit.mockImplementation((event: string, payload: any, callback?: any) => {
        if (event === 'qr:update' && typeof callback === 'function') {
          callback({ success: true });
        }
        return true;
      });

      const result = await broadcastService.broadcastQRUpdate(
        userId,
        sessionId,
        qrData,
        expiresAt,
        tries,
        {
          retryAttempts: 2,
          retryDelay: 1000,
          timeout: 3000
        }
      );

      expect(result.success).toBe(true);
      expect(result.deliveredTo).toContain('socket-123');
      expect(result.failedTo).toHaveLength(0);
      expect(result.errors).toHaveLength(0);

      // Verify socket.emit was called with correct payload
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'qr:update',
        expect.objectContaining({
          sessionId,
          qrData,
          expiresAt,
          tries,
          remainingTime: expect.any(Number)
        }),
        expect.any(Function)
      );

      // Verify event was recorded
      expect(Event.recordEvent).toHaveBeenCalledWith({
        userId,
        sessionId,
        type: EventType.QR_REFRESHED,
        payload: expect.objectContaining({
          sessionId,
          qrData,
          expiresAt,
          tries,
          broadcast: expect.objectContaining({
            totalSockets: 1,
            delivered: 1,
            failed: 0,
            errors: 0
          })
        })
      });
    });

    it('should handle failed socket deliveries and implement retry logic', async () => {
      const userId = 'user-123';
      const sessionId = 'session-123';
      const qrData = 'mock-qr-data';
      const expiresAt = new Date(Date.now() + 60000);
      const tries = 1;

      // Mock socket emit to fail
      mockSocket.emit.mockImplementation((event: string, payload: any, callback?: any) => {
        if (event === 'qr:update' && typeof callback === 'function') {
          callback({ success: false, error: 'Connection timeout' });
        }
        return true;
      });

      const result = await broadcastService.broadcastQRUpdate(
        userId,
        sessionId,
        qrData,
        expiresAt,
        tries,
        {
          retryAttempts: 2,
          retryDelay: 100,
          timeout: 1000
        }
      );

      expect(result.success).toBe(false);
      expect(result.deliveredTo).toHaveLength(0);
      expect(result.failedTo).toContain('socket-123');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        socketId: 'socket-123',
        error: 'Connection timeout'
      });
    });

    it('should handle timeout for socket deliveries', async () => {
      const userId = 'user-123';
      const sessionId = 'session-123';
      const qrData = 'mock-qr-data';
      const expiresAt = new Date(Date.now() + 60000);
      const tries = 1;

      // Mock socket emit to never call callback (timeout scenario)
      mockSocket.emit.mockImplementation((_event: string, _payload: any, _callback?: any) => {
        // Don't call callback to simulate timeout
        return true;
      });

      const result = await broadcastService.broadcastQRUpdate(
        userId,
        sessionId,
        qrData,
        expiresAt,
        tries,
        {
          retryAttempts: 0,
          timeout: 100 // Very short timeout
        }
      );

      expect(result.success).toBe(false);
      expect(result.failedTo).toContain('socket-123');
      expect(result.errors[0]?.error).toBe('Broadcast timeout');
    });

    it('should handle no connected sockets gracefully', async () => {
      // Mock no connected sockets
      mockIo.fetchSockets.mockResolvedValue([]);

      const result = await broadcastService.broadcastQRUpdate(
        'user-123',
        'session-123',
        'qr-data',
        new Date(Date.now() + 60000),
        1
      );

      expect(result.success).toBe(true);
      expect(result.deliveredTo).toHaveLength(0);
      expect(result.failedTo).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should filter sockets by user ID for session-specific delivery', async () => {
      const otherUserSocket = {
        ...mockSocket,
        id: 'socket-456',
        user: {
          userId: 'user-456',
          email: 'other@example.com',
          permissions: ['api']
        }
      } as any;

      mockIo.fetchSockets.mockResolvedValue([mockSocket, otherUserSocket]);

      mockSocket.emit.mockImplementation((event, payload, callback) => {
        if (typeof callback === 'function') {
          callback({ success: true });
        }
        return true;
      });

      const result = await broadcastService.broadcastQRUpdate(
        'user-123', // Only broadcast to user-123
        'session-123',
        'qr-data',
        new Date(Date.now() + 60000),
        1
      );

      expect(result.deliveredTo).toEqual(['socket-123']);
      expect(result.deliveredTo).not.toContain('socket-456');
      expect(mockSocket.emit).toHaveBeenCalled();
      expect(otherUserSocket.emit).not.toHaveBeenCalled();
    });
  });

  describe('broadcastQRFromEvent', () => {
    beforeEach(() => {
      broadcastService.initialize(mockIo);
    });

    it('should broadcast QR update from QREvent model', async () => {
      const mockQREvent = {
        _id: 'qr-event-123',
        userId: { toString: () => 'user-123' },
        sessionId: 'session-123',
        qrData: 'mock-qr-data',
        expiresAt: new Date(Date.now() + 60000),
        tries: 1,
        isExpired: jest.fn().mockReturnValue(false)
      };

      (QREvent.findById as jest.Mock).mockResolvedValue(mockQREvent);

      mockSocket.emit.mockImplementation((event, payload, callback) => {
        if (typeof callback === 'function') {
          callback({ success: true });
        }
        return true;
      });

      const result = await broadcastService.broadcastQRFromEvent('qr-event-123');

      expect(result.success).toBe(true);
      expect(QREvent.findById).toHaveBeenCalledWith('qr-event-123');
      expect(mockQREvent.isExpired).toHaveBeenCalled();
    });

    it('should reject expired QR events', async () => {
      const mockQREvent = {
        _id: 'qr-event-123',
        userId: { toString: () => 'user-123' },
        sessionId: 'session-123',
        qrData: 'mock-qr-data',
        expiresAt: new Date(Date.now() - 60000), // Expired
        tries: 1,
        isExpired: jest.fn().mockReturnValue(true)
      };

      (QREvent.findById as jest.Mock).mockResolvedValue(mockQREvent);

      await expect(
        broadcastService.broadcastQRFromEvent('qr-event-123')
      ).rejects.toThrow('Cannot broadcast expired QR code');
    });

    it('should handle non-existent QR events', async () => {
      (QREvent.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        broadcastService.broadcastQRFromEvent('non-existent-id')
      ).rejects.toThrow('QR event not found: non-existent-id');
    });
  });

  describe('broadcastLatestQRForSession', () => {
    beforeEach(() => {
      broadcastService.initialize(mockIo);
    });

    it('should broadcast latest QR for session', async () => {
      const mockQREvent = {
        _id: 'qr-event-123',
        userId: { toString: () => 'user-123' },
        sessionId: 'session-123',
        qrData: 'mock-qr-data',
        expiresAt: new Date(Date.now() + 60000),
        tries: 1,
        isExpired: jest.fn().mockReturnValue(false)
      };

      (QREvent.getLatestQR as jest.Mock).mockResolvedValue(mockQREvent);

      mockSocket.emit.mockImplementation((event, payload, callback) => {
        if (typeof callback === 'function') {
          callback({ success: true });
        }
        return true;
      });

      const result = await broadcastService.broadcastLatestQRForSession(
        'user-123',
        'session-123'
      );

      expect(result.success).toBe(true);
      expect(QREvent.getLatestQR).toHaveBeenCalledWith('session-123', 'user-123');
    });

    it('should handle no active QR events for session', async () => {
      (QREvent.getLatestQR as jest.Mock).mockResolvedValue(null);

      await expect(
        broadcastService.broadcastLatestQRForSession('user-123', 'session-123')
      ).rejects.toThrow('No active QR event found for session: session-123');
    });
  });

  describe('expiration tracking', () => {
    beforeEach(() => {
      broadcastService.initialize(mockIo);
    });

    it('should calculate remaining time correctly', async () => {
      const userId = 'user-123';
      const sessionId = 'session-123';
      const qrData = 'mock-qr-data';
      const expiresAt = new Date(Date.now() + 30000); // 30 seconds from now
      const tries = 1;

      mockSocket.emit.mockImplementation((event, payload, callback) => {
        if (event === 'qr:update' && typeof callback === 'function') {
          // Verify remaining time is approximately 30 seconds (allow for small timing differences)
          expect(payload.remainingTime).toBeGreaterThan(25);
          expect(payload.remainingTime).toBeLessThanOrEqual(30);
          callback({ success: true });
        }
      });

      await broadcastService.broadcastQRUpdate(
        userId,
        sessionId,
        qrData,
        expiresAt,
        tries
      );
    });

    it('should handle expired QR codes gracefully', async () => {
      const userId = 'user-123';
      const sessionId = 'session-123';
      const qrData = 'mock-qr-data';
      const expiresAt = new Date(Date.now() - 1000); // Already expired
      const tries = 1;

      mockSocket.emit.mockImplementation((event, payload, callback) => {
        if (event === 'qr:update' && typeof callback === 'function') {
          expect(payload.remainingTime).toBe(0);
          callback({ success: true });
        }
      });

      const result = await broadcastService.broadcastQRUpdate(
        userId,
        sessionId,
        qrData,
        expiresAt,
        tries
      );

      expect(result.success).toBe(true);
    });
  });

  describe('retry queue statistics', () => {
    it('should provide retry queue statistics', () => {
      const stats = broadcastService.getRetryQueueStats();
      
      expect(stats).toEqual({
        totalTasks: 0,
        tasksBySession: {},
        oldestTask: undefined
      });
    });
  });
});