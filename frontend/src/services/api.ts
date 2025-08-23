import axios, { AxiosInstance, AxiosResponse } from 'axios';

// API Configuration
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });

  failedQueue = [];
};

// Response interceptor for error handling with token refresh
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If we're already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          // Try to refresh the token
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken: refreshToken,
          });

          if (response.data.success && response.data.data) {
            const { accessToken, refreshToken: newRefreshToken } = response.data.data;

            // Update tokens in localStorage
            localStorage.setItem('auth_token', accessToken);
            localStorage.setItem('refresh_token', newRefreshToken);

            // Update the original request with new token
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;

            // Process the queue with the new token
            processQueue(null, accessToken);

            isRefreshing = false;

            // Retry the original request
            return api(originalRequest);
          } else {
            throw new Error('Token refresh failed');
          }
        } catch (refreshError) {
          // Token refresh failed - logout user
          processQueue(refreshError, null);
          isRefreshing = false;

          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');

          // Only redirect if not already on login page
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }

          return Promise.reject(refreshError);
        }
      } else {
        // No refresh token - logout user
        isRefreshing = false;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');

        // Only redirect if not already on login page
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

// API Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  twoFAEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  sessionId: string;
  status: 'PENDING' | 'QR' | 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'ERROR';
  deviceInfo: {
    name: string;
    platform?: string;
    version?: string;
    browser?: string;
    os?: string;
  };
  phone?: string;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  messageId: string;
  sessionId: string;
  to: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location';
  content?: string;
  mediaUrl?: string;
  caption?: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  error?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface QREvent {
  sessionId: string;
  qrData: string;
  expiresAt: string;
  tries: number;
  remainingTime: number;
}

// Auth API
export const authApi = {
  login: async (
    email: string,
    password: string,
    totpCode?: string
  ): Promise<
    ApiResponse<{ user: User; tokens: { accessToken: string; refreshToken: string } }>
  > => {
    const response = await api.post('/auth/login', { email, password, totpCode });
    return response.data;
  },

  register: async (
    email: string,
    password: string,
    name: string
  ): Promise<ApiResponse<{ user: User }>> => {
    const response = await api.post('/auth/register', { email, password, name });
    return response.data;
  },

  logout: async (): Promise<ApiResponse> => {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  refreshToken: async (
    refreshToken: string
  ): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> => {
    const response = await api.post('/auth/refresh', { refreshToken });
    return response.data;
  },

  getProfile: async (): Promise<ApiResponse<User>> => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  updateProfile: async (data: Partial<User>): Promise<ApiResponse<User>> => {
    const response = await api.put('/auth/profile', data);
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/change-password', { currentPassword, newPassword });
    return response.data;
  },
};

// 2FA API
export const twoFAApi = {
  getStatus: async (): Promise<ApiResponse<{ enabled: boolean; backupCodesCount?: number }>> => {
    const response = await api.get('/auth/2fa/status');
    return response.data;
  },

  setup: async (): Promise<
    ApiResponse<{ secret: string; qrCode: string; backupCodes: string[] }>
  > => {
    const response = await api.post('/auth/2fa/setup');
    return response.data;
  },

  verifySetup: async (totpCode: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/2fa/verify-setup', { totpCode });
    return response.data;
  },

  disable: async (password: string, totpCode: string): Promise<ApiResponse> => {
    const response = await api.post('/auth/2fa/disable', { password, totpCode });
    return response.data;
  },

  getBackupCodes: async (): Promise<ApiResponse<{ backupCodes: string[] }>> => {
    const response = await api.get('/auth/2fa/backup-codes');
    return response.data;
  },

  recover: async (
    email: string,
    backupCode: string
  ): Promise<
    ApiResponse<{ user: User; tokens: { accessToken: string; refreshToken: string } }>
  > => {
    const response = await api.post('/auth/2fa/recover', { email, backupCode });
    return response.data;
  },
};

// Sessions API
export const sessionsApi = {
  list: async (
    page = 1,
    limit = 10
  ): Promise<ApiResponse<{ sessions: Session[]; total: number; page: number; limit: number }>> => {
    const response = await api.get(`/sessions?page=${page}&limit=${limit}`);
    return response.data;
  },

  create: async (
    deviceName?: string,
    webhookUrl?: string
  ): Promise<ApiResponse<{ session: Session }>> => {
    const response = await api.post('/sessions', { deviceName, webhookUrl });
    return response.data;
  },

  get: async (sessionId: string): Promise<ApiResponse<Session>> => {
    const response = await api.get(`/sessions/${sessionId}`);
    return response.data;
  },

  update: async (
    sessionId: string,
    data: { deviceName?: string; webhookUrl?: string }
  ): Promise<ApiResponse<Session>> => {
    const response = await api.put(`/sessions/${sessionId}`, data);
    return response.data;
  },

  delete: async (sessionId: string): Promise<ApiResponse> => {
    const response = await api.delete(`/sessions/${sessionId}`);
    return response.data;
  },

  refreshQR: async (sessionId: string): Promise<ApiResponse> => {
    const response = await api.post(`/sessions/${sessionId}/refresh-qr`);
    return response.data;
  },

  getQR: async (sessionId: string): Promise<ApiResponse<QREvent>> => {
    const response = await api.get(`/sessions/${sessionId}/qr`);
    return response.data;
  },

  reconnect: async (sessionId: string): Promise<ApiResponse> => {
    const response = await api.post(`/sessions/${sessionId}/reconnect`);
    return response.data;
  },

  getStats: async (sessionId: string): Promise<ApiResponse<any>> => {
    const response = await api.get(`/sessions/${sessionId}/stats`);
    return response.data;
  },
};

// Messages API
export const messagesApi = {
  list: async (
    sessionId?: string,
    page = 1,
    limit = 20
  ): Promise<ApiResponse<{ messages: Message[]; total: number; page: number; limit: number }>> => {
    const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
    if (sessionId) params.append('sessionId', sessionId);
    const response = await api.get(`/messages?${params}`);
    return response.data;
  },

  send: async (data: {
    sessionId: string;
    to: string;
    type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location';
    content?: string;
    mediaUrl?: string;
    caption?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  }): Promise<ApiResponse<{ message: Message }>> => {
    const response = await api.post('/messages/send', data);
    return response.data;
  },

  get: async (messageId: string): Promise<ApiResponse<Message>> => {
    const response = await api.get(`/messages/${messageId}`);
    return response.data;
  },

  getStats: async (sessionId?: string): Promise<ApiResponse<any>> => {
    const params = sessionId ? `?sessionId=${sessionId}` : '';
    const response = await api.get(`/messages/stats${params}`);
    return response.data;
  },
};

// API Keys API
export const apiKeysApi = {
  list: async (): Promise<ApiResponse<{ apiKeys: any[] }>> => {
    const response = await api.get('/api-keys');
    return response.data;
  },

  create: async (
    label: string,
    permissions: string[]
  ): Promise<ApiResponse<{ apiKey: any; key: string }>> => {
    const response = await api.post('/api-keys', { label, permissions });
    return response.data;
  },

  update: async (
    keyId: string,
    data: { label?: string; permissions?: string[] }
  ): Promise<ApiResponse<any>> => {
    const response = await api.put(`/api-keys/${keyId}`, data);
    return response.data;
  },

  delete: async (keyId: string): Promise<ApiResponse> => {
    const response = await api.delete(`/api-keys/${keyId}`);
    return response.data;
  },

  rotate: async (keyId: string): Promise<ApiResponse<{ apiKey: any; key: string }>> => {
    const response = await api.post(`/api-keys/${keyId}/rotate`);
    return response.data;
  },

  getUsage: async (keyId: string): Promise<ApiResponse<any>> => {
    const response = await api.get(`/api-keys/${keyId}/usage`);
    return response.data;
  },
};

// Webhooks API
export const webhooksApi = {
  list: async (): Promise<ApiResponse<{ webhooks: any[] }>> => {
    const response = await api.get('/webhooks');
    return response.data;
  },

  create: async (data: {
    url: string;
    description?: string;
    eventTypes: string[];
  }): Promise<ApiResponse<any>> => {
    const response = await api.post('/webhooks', data);
    return response.data;
  },

  get: async (webhookId: string): Promise<ApiResponse<any>> => {
    const response = await api.get(`/webhooks/${webhookId}`);
    return response.data;
  },

  update: async (webhookId: string, data: any): Promise<ApiResponse<any>> => {
    const response = await api.put(`/webhooks/${webhookId}`, data);
    return response.data;
  },

  delete: async (webhookId: string): Promise<ApiResponse> => {
    const response = await api.delete(`/webhooks/${webhookId}`);
    return response.data;
  },

  test: async (webhookId: string): Promise<ApiResponse> => {
    const response = await api.post(`/webhooks/${webhookId}/test`);
    return response.data;
  },

  getLogs: async (webhookId: string): Promise<ApiResponse<any>> => {
    const response = await api.get(`/webhooks/${webhookId}/logs`);
    return response.data;
  },

  retry: async (webhookId: string): Promise<ApiResponse> => {
    const response = await api.post(`/webhooks/${webhookId}/retry`);
    return response.data;
  },
};

// Export the api instance
export { api };

export default api;
