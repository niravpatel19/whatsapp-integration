import { BroadcastService } from '../../services/broadcast.service';

describe('BroadcastService Integration', () => {
  let broadcastService: BroadcastService;

  beforeEach(() => {
    // Reset singleton instance
    (BroadcastService as any).instance = undefined;
    broadcastService = BroadcastService.getInstance();
  });

  afterEach(() => {
    broadcastService.shutdown();
  });

  describe('singleton pattern', () => {
    it('should maintain singleton instance', () => {
      const instance1 = BroadcastService.getInstance();
      const instance2 = BroadcastService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('retry queue statistics', () => {
    it('should provide empty retry queue statistics initially', () => {
      const stats = broadcastService.getRetryQueueStats();
      
      expect(stats).toEqual({
        totalTasks: 0,
        tasksBySession: {},
        oldestTask: undefined
      });
    });
  });

  describe('error handling', () => {
    it('should throw error when broadcasting without initialization', async () => {
      await expect(
        broadcastService.broadcastQRUpdate(
          'user-123',
          'session-123',
          'qr-data',
          new Date(Date.now() + 60000),
          1
        )
      ).rejects.toThrow('BroadcastService not initialized');
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', () => {
      expect(() => {
        broadcastService.shutdown();
      }).not.toThrow();
    });
  });
});