import { emailService } from './email.service';
import { Notification } from '../models/Notification.model';
import { User } from '../models/User.model';
import { Session } from '../models/Session.model';
import { NotificationType, SessionStatus } from '../types/database.types';
import { logger } from '../utils/logger';

export interface SessionNotificationData {
  sessionId: string;
  userId: string;
  deviceName?: string;
  phone?: string;
  disconnectedAt?: Date;
  reconnectedAt?: Date;
  errorMessage?: string;
  lastSeenAt?: Date;
}

export class NotificationService {
  /**
   * Send session disconnection notification
   */
  async sendSessionDisconnectedNotification(data: SessionNotificationData): Promise<void> {
    try {
      // Check if we should send this notification (avoid spam)
      const shouldSend = await Notification.shouldSendNotification(
        data.userId,
        data.sessionId,
        NotificationType.SESSION_DISCONNECTED
      );

      if (!shouldSend) {
        logger.info(`Notification suppressed for session ${data.sessionId} - recent notification exists`);
        return;
      }

      // Get user email
      const user = await User.findById(data.userId);
      if (!user || !user.email) {
        logger.warn(`Cannot send notification - user ${data.userId} not found or no email`);
        return;
      }

      const subject = `WhatsApp Session Disconnected - ${data.deviceName || data.sessionId}`;
      const content = this.generateDisconnectionEmailContent(data);

      // Create notification record
      const notification = await Notification.createNotification(
        data.userId,
        data.sessionId,
        NotificationType.SESSION_DISCONNECTED,
        user.email,
        subject,
        content,
        {
          deviceName: data.deviceName,
          phone: data.phone,
          disconnectedAt: data.disconnectedAt,
        }
      );

      // Send email
      const emailSent = await emailService.sendEmail({
        to: user.email,
        subject,
        html: content,
      });

      if (emailSent) {
        await Notification.markAsSent(notification._id.toString());
        logger.info(`Session disconnection notification sent to ${user.email}`, {
          sessionId: data.sessionId,
          userId: data.userId,
        });
      } else {
        await Notification.markAsFailed(notification._id.toString(), 'Failed to send email');
      }
    } catch (error) {
      logger.error('Failed to send session disconnection notification:', error, {
        sessionId: data.sessionId,
        userId: data.userId,
      });
    }
  }

  /**
   * Send session reconnection notification
   */
  async sendSessionReconnectedNotification(data: SessionNotificationData): Promise<void> {
    try {
      // Check if we should send this notification
      const shouldSend = await Notification.shouldSendNotification(
        data.userId,
        data.sessionId,
        NotificationType.SESSION_RECONNECTED
      );

      if (!shouldSend) {
        logger.info(`Reconnection notification suppressed for session ${data.sessionId}`);
        return;
      }

      // Get user email
      const user = await User.findById(data.userId);
      if (!user || !user.email) {
        logger.warn(`Cannot send notification - user ${data.userId} not found or no email`);
        return;
      }

      const subject = `WhatsApp Session Reconnected - ${data.deviceName || data.sessionId}`;
      const content = this.generateReconnectionEmailContent(data);

      // Create notification record
      const notification = await Notification.createNotification(
        data.userId,
        data.sessionId,
        NotificationType.SESSION_RECONNECTED,
        user.email,
        subject,
        content,
        {
          deviceName: data.deviceName,
          phone: data.phone,
          reconnectedAt: data.reconnectedAt,
        }
      );

      // Send email
      const emailSent = await emailService.sendEmail({
        to: user.email,
        subject,
        html: content,
      });

      if (emailSent) {
        await Notification.markAsSent(notification._id.toString());
        logger.info(`Session reconnection notification sent to ${user.email}`, {
          sessionId: data.sessionId,
          userId: data.userId,
        });
      } else {
        await Notification.markAsFailed(notification._id.toString(), 'Failed to send email');
      }
    } catch (error) {
      logger.error('Failed to send session reconnection notification:', error, {
        sessionId: data.sessionId,
        userId: data.userId,
      });
    }
  }

  /**
   * Send session error notification
   */
  async sendSessionErrorNotification(data: SessionNotificationData): Promise<void> {
    try {
      // Check if we should send this notification
      const shouldSend = await Notification.shouldSendNotification(
        data.userId,
        data.sessionId,
        NotificationType.SESSION_ERROR
      );

      if (!shouldSend) {
        logger.info(`Error notification suppressed for session ${data.sessionId}`);
        return;
      }

      // Get user email
      const user = await User.findById(data.userId);
      if (!user || !user.email) {
        logger.warn(`Cannot send notification - user ${data.userId} not found or no email`);
        return;
      }

      const subject = `WhatsApp Session Error - ${data.deviceName || data.sessionId}`;
      const content = this.generateErrorEmailContent(data);

      // Create notification record
      const notification = await Notification.createNotification(
        data.userId,
        data.sessionId,
        NotificationType.SESSION_ERROR,
        user.email,
        subject,
        content,
        {
          deviceName: data.deviceName,
          phone: data.phone,
          errorMessage: data.errorMessage,
        }
      );

      // Send email
      const emailSent = await emailService.sendEmail({
        to: user.email,
        subject,
        html: content,
      });

      if (emailSent) {
        await Notification.markAsSent(notification._id.toString());
        logger.info(`Session error notification sent to ${user.email}`, {
          sessionId: data.sessionId,
          userId: data.userId,
        });
      } else {
        await Notification.markAsFailed(notification._id.toString(), 'Failed to send email');
      }
    } catch (error) {
      logger.error('Failed to send session error notification:', error, {
        sessionId: data.sessionId,
        userId: data.userId,
      });
    }
  }

  /**
   * Process pending notifications (for background job)
   */
  async processPendingNotifications(): Promise<void> {
    try {
      const pendingNotifications = await Notification.getPendingNotifications(10);
      
      for (const notification of pendingNotifications) {
        try {
          const emailSent = await emailService.sendEmail({
            to: notification.recipient,
            subject: notification.subject,
            html: notification.content,
          });

          if (emailSent) {
            await Notification.markAsSent(notification._id.toString());
          } else {
            await Notification.markAsFailed(notification._id.toString(), 'Failed to send email');
          }
        } catch (error) {
          await Notification.markAsFailed(
            notification._id.toString(),
            `Send error: ${(error as Error).message}`
          );
        }
      }

      if (pendingNotifications.length > 0) {
        logger.info(`Processed ${pendingNotifications.length} pending notifications`);
      }
    } catch (error) {
      logger.error('Failed to process pending notifications:', error);
    }
  }

  private generateDisconnectionEmailContent(data: SessionNotificationData): string {
    const deviceName = data.deviceName || 'Unknown Device';
    const phone = data.phone || 'Not connected';
    const disconnectedAt = data.disconnectedAt || new Date();
    const lastSeenAt = data.lastSeenAt || 'Unknown';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>WhatsApp Session Disconnected</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .info-table th, .info-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .info-table th { background-color: #e9ecef; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          .alert { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ WhatsApp Session Disconnected</h1>
          </div>
          
          <div class="content">
            <p>Your WhatsApp session has been disconnected and requires attention.</p>
            
            <table class="info-table">
              <tr>
                <th>Session ID</th>
                <td>${data.sessionId}</td>
              </tr>
              <tr>
                <th>Device Name</th>
                <td>${deviceName}</td>
              </tr>
              <tr>
                <th>Phone Number</th>
                <td>${phone}</td>
              </tr>
              <tr>
                <th>Disconnected At</th>
                <td>${disconnectedAt.toLocaleString()}</td>
              </tr>
              <tr>
                <th>Last Seen</th>
                <td>${typeof lastSeenAt === 'string' ? lastSeenAt : lastSeenAt.toLocaleString()}</td>
              </tr>
            </table>

            <div class="alert">
              <strong>Action Required:</strong> Please log into your WhatsApp Integration dashboard to reconnect this session. You may need to scan a new QR code.
            </div>

            <p>If you continue to experience connection issues, please contact support.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from your WhatsApp Integration system.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateReconnectionEmailContent(data: SessionNotificationData): string {
    const deviceName = data.deviceName || 'Unknown Device';
    const phone = data.phone || 'Connected';
    const reconnectedAt = data.reconnectedAt || new Date();

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>WhatsApp Session Reconnected</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .info-table th, .info-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .info-table th { background-color: #e9ecef; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          .success { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ WhatsApp Session Reconnected</h1>
          </div>
          
          <div class="content">
            <div class="success">
              <strong>Good News!</strong> Your WhatsApp session has been successfully reconnected.
            </div>
            
            <table class="info-table">
              <tr>
                <th>Session ID</th>
                <td>${data.sessionId}</td>
              </tr>
              <tr>
                <th>Device Name</th>
                <td>${deviceName}</td>
              </tr>
              <tr>
                <th>Phone Number</th>
                <td>${phone}</td>
              </tr>
              <tr>
                <th>Reconnected At</th>
                <td>${reconnectedAt.toLocaleString()}</td>
              </tr>
            </table>

            <p>Your WhatsApp integration is now fully operational and ready to send/receive messages.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from your WhatsApp Integration system.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateErrorEmailContent(data: SessionNotificationData): string {
    const deviceName = data.deviceName || 'Unknown Device';
    const errorMessage = data.errorMessage || 'Unknown error occurred';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>WhatsApp Session Error</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8f9fa; }
          .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .info-table th, .info-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          .info-table th { background-color: #e9ecef; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          .error { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .error-message { font-family: monospace; background-color: #f1f1f1; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ WhatsApp Session Error</h1>
          </div>
          
          <div class="content">
            <div class="error">
              <strong>Error Detected:</strong> Your WhatsApp session has encountered an error.
            </div>
            
            <table class="info-table">
              <tr>
                <th>Session ID</th>
                <td>${data.sessionId}</td>
              </tr>
              <tr>
                <th>Device Name</th>
                <td>${deviceName}</td>
              </tr>
              <tr>
                <th>Error Time</th>
                <td>${new Date().toLocaleString()}</td>
              </tr>
            </table>

            <h3>Error Details:</h3>
            <div class="error-message">${errorMessage}</div>

            <p>Please check your WhatsApp Integration dashboard and consider restarting the session if the error persists.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated notification from your WhatsApp Integration system.</p>
            <p>Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

// Singleton instance
export const notificationService = new NotificationService();