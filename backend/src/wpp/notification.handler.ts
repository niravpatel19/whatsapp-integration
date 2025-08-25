import { Session } from '../models/Session.model';
import { notificationService } from '../services/notification.service';
import { SessionStatus } from '../types/database.types';
import { logger } from '../utils/logger';

export class WPPNotificationHandler {
  /**
   * Handle session disconnection
   */
  static async handleSessionDisconnected(sessionId: string, reason?: string): Promise<void> {
    try {
      const session = await Session.findOne({ sessionId });
      if (!session) {
        logger.warn(`Session not found for disconnection notification: ${sessionId}`);
        return;
      }

      // Update session status
      await session.updateStatus(SessionStatus.DISCONNECTED, reason);

      // Send notification
      await notificationService.sendSessionDisconnectedNotification({
        sessionId,
        userId: session.userId.toString(),
        deviceName: session.deviceInfo?.name,
        phone: session.phone,
        disconnectedAt: new Date(),
        lastSeenAt: session.lastSeenAt,
        errorMessage: reason,
      });

      logger.info(`Disconnection notification triggered for session: ${sessionId}`);
    } catch (error) {
      logger.error('Failed to handle session disconnection notification:', error, {
        sessionId,
        reason,
      });
    }
  }

  /**
   * Handle session reconnection
   */
  static async handleSessionReconnected(sessionId: string): Promise<void> {
    try {
      const session = await Session.findOne({ sessionId });
      if (!session) {
        logger.warn(`Session not found for reconnection notification: ${sessionId}`);
        return;
      }

      // Update session status
      await session.updateStatus(SessionStatus.CONNECTED);

      // Send notification only if session was previously disconnected
      if (session.status === SessionStatus.DISCONNECTED || session.status === SessionStatus.RECONNECTING) {
        await notificationService.sendSessionReconnectedNotification({
          sessionId,
          userId: session.userId.toString(),
          deviceName: session.deviceInfo?.name,
          phone: session.phone,
          reconnectedAt: new Date(),
        });

        logger.info(`Reconnection notification triggered for session: ${sessionId}`);
      }
    } catch (error) {
      logger.error('Failed to handle session reconnection notification:', error, {
        sessionId,
      });
    }
  }

  /**
   * Handle session error
   */
  static async handleSessionError(sessionId: string, errorMessage: string): Promise<void> {
    try {
      const session = await Session.findOne({ sessionId });
      if (!session) {
        logger.warn(`Session not found for error notification: ${sessionId}`);
        return;
      }

      // Update session status
      await session.updateStatus(SessionStatus.ERROR, errorMessage);

      // Send notification
      await notificationService.sendSessionErrorNotification({
        sessionId,
        userId: session.userId.toString(),
        deviceName: session.deviceInfo?.name,
        phone: session.phone,
        errorMessage,
      });

      logger.info(`Error notification triggered for session: ${sessionId}`);
    } catch (error) {
      logger.error('Failed to handle session error notification:', error, {
        sessionId,
        errorMessage,
      });
    }
  }

  /**
   * Handle session state change
   */
  static async handleSessionStateChange(
    sessionId: string,
    oldStatus: SessionStatus,
    newStatus: SessionStatus,
    reason?: string
  ): Promise<void> {
    try {
      // Only send notifications for specific state transitions
      if (oldStatus === SessionStatus.CONNECTED && newStatus === SessionStatus.DISCONNECTED) {
        await this.handleSessionDisconnected(sessionId, reason);
      } else if (
        (oldStatus === SessionStatus.DISCONNECTED || oldStatus === SessionStatus.RECONNECTING) &&
        newStatus === SessionStatus.CONNECTED
      ) {
        await this.handleSessionReconnected(sessionId);
      } else if (newStatus === SessionStatus.ERROR) {
        await this.handleSessionError(sessionId, reason || 'Unknown error');
      }
    } catch (error) {
      logger.error('Failed to handle session state change notification:', error, {
        sessionId,
        oldStatus,
        newStatus,
        reason,
      });
    }
  }
}