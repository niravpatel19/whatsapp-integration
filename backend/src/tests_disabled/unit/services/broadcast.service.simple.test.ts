import { BroadcastService } from '../../../services/broadcast.service';
import { QREvent } from '../../../models/QREvent.model';
import { Event } from '../../../models/Event.model';
import { EventType } from '../../../types/database.types';

// Mock dependencies
jest.mock('../../../models/QREvent.model');
jest.mock('../../../models/Event.model');
jest.mock('../../../utils/logger');

describe('BroadcastService - Core Functionality', () => {
  let broadcastService: BroadcastService;
  let mockIo: any;

  beforeEach(() => {
    // Reset singleton instance
    (BroadcastService as any).instance = undefined;
    broadcastService = BroadcastService.getInstance();

    // Mock Socket.IO server
    mockIo = {
      fetchSockets: jest.fn().mockResolvedValue([]),
      emit: jest.fn(),
      on: jest.fn(),
      use: jest.fn()
    };

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

  describe('broadcastQRUpdate with no connected sockets', () => {
    beforeEach(() => {
      broadcastService.initialize(mockIo);
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

      // Verify event was recorded
      expect(Event.recordEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        sessionId: 'session-123',
        type: EventType.QR_REFRESHED,
        payload: expect.objectContaining({
          sessionId: 'session-123',
          qrData: 'qr-data',
          tries: 1,
          broadcast: expect.objectContaining({
            totalSockets: 0,
            delivered: 0,
            failed: 0,
            errors: 0
          })
        })
      });
    });
  });

  describe('broadcastQRFromEvent', () => {
    beforeEach(() => {
      broadcastService.initialize(mockIo);
    });

    it('should handle non-existent QR events', async () => {
      (QREvent.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        broadcastService.broadcastQRFromEvent('non-existent-id')
      ).rejects.toThrow('QR event not found: non-existent-id');
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
  });

  describe('broadcastLatestQRForSession', () => {
    beforeEach(() => {
      broadcastService.initialize(mockIo);
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

    it('should handle expired QR codes gracefully', async () => {
      const userId = 'user-123';
      const sessionId = 'session-123';
      const qrData = 'mock-qr-data';
      const expiresAt = new Date(Date.now() - 1000); // Already expired
      const tries = 1;

      const result = await broadcastService.broadcastQRUpdate(
        userId,
        sessionId,
        qrData,
        expiresAt,
        tries
      );

      expect(result.success).toBe(true);
      
      // Verify event was recorded with remaining time 0
      expect(Event.recordEvent).toHaveBeenCalledWith({
        userId,
        sessionId,
        type: EventType.QR_REFRESHED,
        payload: expect.objectContaining({
          remainingTime: 0
        })
      });
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

  describe('error handling', () => {
    beforeEach(() => {
      broadcastService.initialize(mockIo);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedService = new (BroadcastService as any)();
      
      await expect(
        uninitializedService.broadcastQRUpdate(
          'user-123',
          'session-123',
          'qr-data',
          new Date(Date.now() + 60000),
          1
        )
      ).rejects.toThrow('BroadcastService not initialized');
    });
  });
});