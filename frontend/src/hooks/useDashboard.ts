import { useState, useEffect } from 'react';
import api from '../services/api';

interface DashboardStats {
  totalSessions: number;
  activeSessions: number;
  connectedSessions: number;
  totalMessages: number;
  messagesThisMonth: number;
  deliveryRate: number;
}

interface RecentActivity {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  createdAt: string;
}

interface DashboardData {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
}

export const useDashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch dashboard statistics
      const [sessionsResponse, messagesResponse, eventsResponse] = await Promise.all([
        api.get('/sessions'),
        api.get('/messages/stats'),
        api.get('/events?limit=10'),
      ]);

      // Process sessions data
      const sessions = sessionsResponse.data.data.sessions || [];
      const totalSessions = sessions.length;
      const activeSessions = sessions.filter((s: any) =>
        ['PENDING', 'QR', 'CONNECTED'].includes(s.status)
      ).length;
      const connectedSessions = sessions.filter((s: any) => s.status === 'CONNECTED').length;

      // Process messages data
      const messageStats = messagesResponse.data.data.statistics || {};
      const totalMessages = messageStats.totalMessages || 0;
      const deliveryRate = messageStats.deliveryRate || 0;

      // Calculate messages this month (approximate)
      const messagesThisMonth = Math.floor(totalMessages * 0.3); // Rough estimate

      // Process recent activity
      const events = eventsResponse.data.data.events || [];
      const recentActivity = events.map((event: any) => ({
        id: event._id,
        type: event.type,
        message: formatEventMessage(event),
        timestamp: formatTimestamp(event.createdAt),
        createdAt: event.createdAt,
      }));

      setData({
        stats: {
          totalSessions,
          activeSessions,
          connectedSessions,
          totalMessages,
          messagesThisMonth,
          deliveryRate,
        },
        recentActivity,
      });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const refresh = () => {
    fetchDashboardData();
  };

  return { data, loading, error, refresh };
};

// Helper function to format event messages
const formatEventMessage = (event: any): string => {
  switch (event.type) {
    case 'SESSION_STATE':
      return `Session status changed to ${event.payload?.newStatus || 'unknown'}`;
    case 'SESSION_DELETED':
      return 'Session was deleted';
    case 'MESSAGE_SENT':
      return `Message sent to ${event.payload?.to || 'unknown'}`;
    case 'MESSAGE_DELIVERED':
      return `Message delivered to ${event.payload?.to || 'unknown'}`;
    case 'MESSAGE_READ':
      return `Message read by ${event.payload?.to || 'unknown'}`;
    case 'QR_REFRESHED':
      return 'QR code was refreshed';
    case 'LOGIN':
      return 'User logged in';
    case 'LOGOUT':
      return 'User logged out';
    case 'ERROR':
      return `Error occurred: ${event.payload?.error || 'Unknown error'}`;
    default:
      return `${event.type} event occurred`;
  }
};

// Helper function to format timestamps
const formatTimestamp = (timestamp: string): string => {
  const now = new Date();
  const eventTime = new Date(timestamp);
  const diffMs = now.getTime() - eventTime.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }
};
