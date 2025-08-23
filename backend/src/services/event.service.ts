import { Event, IEvent, EventPayload } from '../models/Event.model';
import { EventType } from '../types/database.types';
import { WebhookService } from './webhook.service';
import { socketIOService } from './socketio.service';
import { logger } from '../utils/logger';

export class EventService {
  /**
   * Record an event and trigger webhooks and real-time notifications
   */
  static async recordEvent(eventData: {
    userId: string;
    sessionId?: string;
    type: EventType;
    payload: EventPayload;
    ipAddress?: string;
    userAgent?: string;
    correlationId?: string;
  }): Promise<IEvent> {
    try {
      logger.info('Recording event', {
        userId: eventData.userId,
        sessionId: eventData.sessionId,
        type: eventData.type,
        correlationId: eventData.correlationId
      });
      
      // Record the event in the database
      const event = await Event.recordEvent(eventData);
      
      // Trigger webhooks asynchronously (don't wait for completion)
      this.triggerWebhooks(eventData.userId, eventData.type, {
        eventId: event.eventId,
        sessionId: eventData.sessionId,
        type: eventData.type,
        payload: eventData.payload,
        timestamp: event.createdAt,
        userId: eventData.userId
      }).catch(error => {
        logger.error('Error triggering webhooks for event', {
          eventId: event.eventId,
          error: error.message,
          stack: error.stack
        });
      });
      
      // Emit real-time event via Socket.IO
      this.emitRealTimeEvent(eventData.userId, eventData.sessionId, {
        eventId: event.eventId,
        type: eventData.type,
        payload: eventData.payload,
        timestamp: event.createdAt
      }).catch(error => {
        logger.error('Error emitting real-time event', {
          eventId: event.eventId,
          error: error.message
        });
      });
      
      logger.info('Event recorded successfully', {
        eventId: event.eventId,
        userId: eventData.userId,
        type: eventData.type
      });
      
      return event;
      
    } catch (error: any) {
      logger.error('Error recording event', {
        error: error.message,
        stack: error.stack,
        eventData
      });
      throw error;
    }
  }
  
  /**
   * Trigger webhooks for an event
   */
  private static async triggerWebhooks(
    userId: string,
    eventType: EventType,
    eventPayload: any
  ): Promise<void> {
    try {
      await WebhookService.deliverWebhooksForEvent(userId, eventType, eventPayload);
    } catch (error: any) {
      logger.error('Failed to trigger webhooks', {
        userId,
        eventType,
        error: error.message
      });
      // Don't throw - webhook failures shouldn't break event recording
    }
  }
  
  /**
   * Emit real-time event via Socket.IO
   */
  private static async emitRealTimeEvent(
    userId: string,
    sessionId: string | undefined,
    eventData: any
  ): Promise<void> {
    try {
      // Emit to user's room
      socketIOService.broadcastToUser(userId, 'event', eventData);
      
      // Also emit session-specific events if sessionId is provided
      if (sessionId) {
        socketIOService.broadcastToUser(userId, `session:${sessionId}:event`, eventData);
        
        // Emit specific event types for backward compatibility
        switch (eventData.type) {
          case EventType.QR_REFRESHED:
            socketIOService.broadcastToUser(userId, 'qr:update', {
              sessionId,
              qrData: eventData.payload.qrData,
              expiresAt: eventData.payload.expiresAt,
              timestamp: eventData.timestamp
            });
            break;
            
          case EventType.SESSION_STATE:
            socketIOService.broadcastToUser(userId, 'session:state', {
              sessionId,
              status: eventData.payload.newStatus,
              deviceInfo: eventData.payload.deviceInfo,
              phone: eventData.payload.phone,
              timestamp: eventData.timestamp
            });
            break;
            
          case EventType.MESSAGE_SENT:
          case EventType.MESSAGE_DELIVERED:
          case EventType.MESSAGE_READ:
            socketIOService.broadcastToUser(userId, 'message:status', {
              messageId: eventData.payload.messageId,
              status: eventData.payload.status || eventData.type.replace('MESSAGE_', '').toLowerCase(),
              timestamp: eventData.timestamp
            });
            break;
            
          case EventType.ERROR:
            socketIOService.broadcastToUser(userId, 'error', {
              sessionId,
              error: eventData.payload.error,
              context: eventData.payload.context,
              timestamp: eventData.timestamp
            });
            break;
        }
      }
      
    } catch (error: any) {
      logger.error('Failed to emit real-time event', {
        userId,
        sessionId,
        eventType: eventData.type,
        error: error.message
      });
      // Don't throw - Socket.IO failures shouldn't break event recording
    }
  }
  
  /**
   * Record session state change event
   */
  static async recordSessionStateChange(
    userId: string,
    sessionId: string,
    oldStatus: string | undefined,
    newStatus: string,
    deviceInfo?: any,
    phone?: string,
    error?: string,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      sessionId,
      type: EventType.SESSION_STATE,
      payload: {
        oldStatus,
        newStatus,
        deviceInfo,
        phone,
        error
      },
      correlationId
    });
  }
  
  /**
   * Record QR code refresh event
   */
  static async recordQRRefresh(
    userId: string,
    sessionId: string,
    qrData: string,
    expiresAt: Date,
    tries: number,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      sessionId,
      type: EventType.QR_REFRESHED,
      payload: {
        qrData,
        expiresAt,
        tries
      },
      correlationId
    });
  }
  
  /**
   * Record message sent event
   */
  static async recordMessageSent(
    userId: string,
    sessionId: string,
    messageId: string,
    to: string,
    messageType: string,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      sessionId,
      type: EventType.MESSAGE_SENT,
      payload: {
        messageId,
        to,
        type: messageType,
        status: 'sent'
      },
      correlationId
    });
  }
  
  /**
   * Record message delivery event
   */
  static async recordMessageDelivered(
    userId: string,
    sessionId: string,
    messageId: string,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      sessionId,
      type: EventType.MESSAGE_DELIVERED,
      payload: {
        messageId,
        status: 'delivered'
      },
      correlationId
    });
  }
  
  /**
   * Record message read event
   */
  static async recordMessageRead(
    userId: string,
    sessionId: string,
    messageId: string,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      sessionId,
      type: EventType.MESSAGE_READ,
      payload: {
        messageId,
        status: 'read'
      },
      correlationId
    });
  }
  
  /**
   * Record user login event
   */
  static async recordLogin(
    userId: string,
    method: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
    error?: string,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      type: EventType.LOGIN,
      payload: {
        method,
        success,
        error
      },
      ipAddress,
      userAgent,
      correlationId
    });
  }
  
  /**
   * Record user logout event
   */
  static async recordLogout(
    userId: string,
    method: string,
    ipAddress?: string,
    userAgent?: string,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      type: EventType.LOGOUT,
      payload: {
        method,
        success: true
      },
      ipAddress,
      userAgent,
      correlationId
    });
  }
  
  /**
   * Record error event
   */
  static async recordError(
    userId: string,
    sessionId: string | undefined,
    error: string,
    stack?: string,
    context?: any,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      sessionId,
      type: EventType.ERROR,
      payload: {
        error,
        stack,
        context
      },
      correlationId
    });
  }
  
  /**
   * Record session disconnection event
   */
  static async recordDisconnection(
    userId: string,
    sessionId: string,
    reason?: string,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      sessionId,
      type: EventType.DISCONNECTED,
      payload: {
        reason,
        timestamp: new Date()
      },
      correlationId
    });
  }
  
  /**
   * Record session reconnection event
   */
  static async recordReconnection(
    userId: string,
    sessionId: string,
    correlationId?: string
  ): Promise<IEvent> {
    return await this.recordEvent({
      userId,
      sessionId,
      type: EventType.RECONNECTED,
      payload: {
        timestamp: new Date()
      },
      correlationId
    });
  }
  
  /**
   * Get events with filters
   */
  static async getEvents(
    userId: string,
    filters?: {
      sessionId?: string;
      type?: EventType;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: IEvent[]; total: number }> {
    return await Event.getEvents(userId, filters);
  }
  
  /**
   * Get events by type
   */
  static async getEventsByType(
    userId: string,
    type: EventType,
    limit?: number
  ): Promise<IEvent[]> {
    return await Event.getEventsByType(userId, type, limit);
  }
  
  /**
   * Get events by session
   */
  static async getEventsBySession(
    userId: string,
    sessionId: string,
    limit?: number
  ): Promise<IEvent[]> {
    return await Event.getEventsBySession(userId, sessionId, limit);
  }
  
  /**
   * Get event analytics
   */
  static async getEventAnalytics(
    userId: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<{
    totalEvents: number;
    eventsByType: { [key in EventType]?: number };
    eventsByDay: { date: string; count: number }[];
    userActivityPattern: { hour: number; count: number }[];
  }> {
    return await Event.getEventAnalytics(userId, dateFrom, dateTo);
  }
  
  /**
   * Clean up old events
   */
  static async cleanupOldEvents(retentionDays?: number): Promise<number> {
    return await Event.cleanupOldEvents(retentionDays);
  }
}