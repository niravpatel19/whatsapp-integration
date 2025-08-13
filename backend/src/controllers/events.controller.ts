import { Request, Response } from 'express';
import { Event } from '../models/Event.model';
import { EventType } from '../types/database.types';
import { logger } from '../utils/logger';

export class EventsController {
  /**
   * Get events list with filtering and pagination
   */
  static async getEvents(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;

      // Parse query parameters
      const { sessionId, type, dateFrom, dateTo, limit = 10, offset = 0, page = 1 } = req.query;

      // Calculate offset from page if provided
      const calculatedOffset = page
        ? (parseInt(page as string) - 1) * parseInt(limit as string)
        : parseInt(offset as string) || 0;

      // Build filters
      const filters: any = {
        limit: Math.min(parseInt(limit as string) || 10, 100), // Max 100 per request
        offset: calculatedOffset,
      };

      if (sessionId) filters.sessionId = sessionId as string;
      if (type && Object.values(EventType).includes(type as EventType)) {
        filters.type = type as EventType;
      }
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);

      // Get events
      const { events, total } = await Event.getEvents(userId, filters);

      // Calculate pagination info
      const totalPages = Math.ceil(total / filters.limit);
      const currentPage = Math.floor(calculatedOffset / filters.limit) + 1;

      res.json({
        success: true,
        data: {
          events,
          pagination: {
            total,
            page: currentPage,
            limit: filters.limit,
            totalPages,
            hasNext: currentPage < totalPages,
            hasPrev: currentPage > 1,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to get events:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENTS_FETCH_FAILED',
          message: 'Failed to retrieve events',
          details: error.message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get event types and their counts
   */
  static async getEventTypes(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { dateFrom, dateTo } = req.query;

      // Parse date filters
      const filters: any = {};
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);

      // Get analytics data
      const analytics = await Event.getEventAnalytics(userId, filters.dateFrom, filters.dateTo);

      // Format event types with descriptions
      const eventTypesWithInfo = Object.entries(EventType).map(([key, value]) => ({
        type: value,
        name: key
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        count: analytics.eventsByType[value] || 0,
        description: getEventTypeDescription(value),
      }));

      res.json({
        success: true,
        data: {
          eventTypes: eventTypesWithInfo,
          totalEvents: analytics.totalEvents,
          dateRange: {
            from: filters.dateFrom || null,
            to: filters.dateTo || null,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to get event types:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENT_TYPES_FETCH_FAILED',
          message: 'Failed to retrieve event types',
          details: error.message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get event statistics and analytics
   */
  static async getEventStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { dateFrom, dateTo, sessionId } = req.query;

      // Parse date filters
      const filters: any = {};
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);

      // Get comprehensive analytics
      const analytics = await Event.getEventAnalytics(userId, filters.dateFrom, filters.dateTo);

      // Get session-specific stats if requested
      let sessionStats = null;
      if (sessionId) {
        const sessionEvents = await Event.getEventsBySession(userId, sessionId as string, 100);
        sessionStats = {
          sessionId,
          totalEvents: sessionEvents.length,
          eventsByType: sessionEvents.reduce((acc: any, event) => {
            acc[event.type] = (acc[event.type] || 0) + 1;
            return acc;
          }, {}),
          lastActivity: sessionEvents[0]?.createdAt || null,
          firstActivity: sessionEvents[sessionEvents.length - 1]?.createdAt || null,
        };
      }

      // Calculate additional metrics
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [recent24h, recent7d] = await Promise.all([
        Event.getEvents(userId, { dateFrom: last24Hours, limit: 1000 }),
        Event.getEvents(userId, { dateFrom: last7Days, limit: 1000 }),
      ]);

      res.json({
        success: true,
        data: {
          overview: {
            totalEvents: analytics.totalEvents,
            eventsLast24h: recent24h.total,
            eventsLast7d: recent7d.total,
            averageEventsPerDay:
              analytics.eventsByDay.length > 0
                ? Math.round(analytics.totalEvents / analytics.eventsByDay.length)
                : 0,
          },
          eventsByType: analytics.eventsByType,
          eventsByDay: analytics.eventsByDay,
          userActivityPattern: analytics.userActivityPattern,
          sessionStats,
          dateRange: {
            from: filters.dateFrom || null,
            to: filters.dateTo || null,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to get event stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENT_STATS_FETCH_FAILED',
          message: 'Failed to retrieve event statistics',
          details: error.message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get events for a specific session
   */
  static async getSessionEvents(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { sessionId } = req.params;
      const { limit = 50 } = req.query;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SESSION_ID',
            message: 'Session ID is required',
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const events = await Event.getEventsBySession(
        userId,
        sessionId,
        Math.min(parseInt(limit as string) || 50, 100)
      );

      res.json({
        success: true,
        data: {
          sessionId,
          events,
          total: events.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to get session events:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SESSION_EVENTS_FETCH_FAILED',
          message: 'Failed to retrieve session events',
          details: error.message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Get events by type
   */
  static async getEventsByType(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.userId;
      const { type } = req.params;
      const { limit = 50 } = req.query;

      if (!type || !Object.values(EventType).includes(type as EventType)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EVENT_TYPE',
            message: 'Valid event type is required',
            details: `Available types: ${Object.values(EventType).join(', ')}`,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const events = await Event.getEventsByType(
        userId,
        type as EventType,
        Math.min(parseInt(limit as string) || 50, 100)
      );

      res.json({
        success: true,
        data: {
          type,
          events,
          total: events.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to get events by type:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EVENTS_BY_TYPE_FETCH_FAILED',
          message: 'Failed to retrieve events by type',
          details: error.message,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Helper function to get event type descriptions
 */
function getEventTypeDescription(eventType: EventType): string {
  const descriptions: { [key in EventType]: string } = {
    [EventType.SESSION_STATE]:
      'WhatsApp session status changes (connecting, connected, disconnected)',
    [EventType.SESSION_DELETED]: 'WhatsApp session was deleted or removed',
    [EventType.MESSAGE_SENT]: 'Message was sent to WhatsApp',
    [EventType.MESSAGE_DELIVERED]: 'Message was delivered to recipient',
    [EventType.MESSAGE_READ]: 'Message was read by recipient',
    [EventType.QR_REFRESHED]: 'QR code was generated or refreshed for session',
    [EventType.LOGIN]: 'User logged into the system',
    [EventType.LOGOUT]: 'User logged out of the system',
    [EventType.ERROR]: 'System error or exception occurred',
    [EventType.DISCONNECTED]: 'WhatsApp session was disconnected',
    [EventType.RECONNECTED]: 'WhatsApp session was reconnected',
  };

  return descriptions[eventType] || 'Unknown event type';
}
