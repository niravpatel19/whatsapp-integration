import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api, { authApi, twoFAApi, type User } from '../services/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  refreshToken: string | null;
  error: string | null;
  twoFARequired: boolean;
}

interface AuthActions {
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<{ accessToken: string; refreshToken: string } | void>;
  initializeAuth: () => Promise<void>;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
  clearError: () => void;

  // 2FA Actions
  setup2FA: () => Promise<{ secret: string; qrCode: string; backupCodes: string[] }>;
  verify2FASetup: (totpCode: string) => Promise<void>;
  disable2FA: (password: string, totpCode: string) => Promise<void>;
  get2FAStatus: () => Promise<{ enabled: boolean; backupCodesCount?: number }>;
  recover2FA: (email: string, backupCode: string) => Promise<void>;

  // Profile Actions
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // State
      user: null,
      isAuthenticated: false,
      isLoading: true,
      token: null,
      refreshToken: null,
      error: null,
      twoFARequired: false,

      // Actions
      login: async (email: string, password: string, totpCode?: string) => {
        set({ isLoading: true, error: null, twoFARequired: false });

        try {
          const response = await authApi.login(email, password, totpCode);

          if (response.success && response.data) {
            const { user, tokens } = response.data;

            // Store tokens in localStorage for API interceptor
            localStorage.setItem('auth_token', tokens.accessToken);
            localStorage.setItem('refresh_token', tokens.refreshToken);

            set({
              user,
              token: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
              twoFARequired: false,
            });
          } else {
            throw new Error(response.error?.message || 'Login failed');
          }
        } catch (error: any) {
          // Check if 2FA is required
          if (error.response?.data?.error?.code === '2FA_REQUIRED') {
            set({
              isLoading: false,
              error: null,
              twoFARequired: true,
            });
            return;
          }

          set({
            isLoading: false,
            error: error.response?.data?.error?.message || error.message || 'Login failed',
            twoFARequired: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authApi.register(email, password, name);

          if (response.success && response.data) {
            set({
              isLoading: false,
              error: null,
            });
          } else {
            throw new Error(response.error?.message || 'Registration failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.error?.message || error.message || 'Registration failed',
          });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });

        try {
          await authApi.logout();
        } catch (error) {
          console.error('Logout API call failed:', error);
        } finally {
          // Clear tokens from localStorage
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');

          set({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            twoFARequired: false,
          });
        }
      },

      refreshTokens: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        try {
          const response = await authApi.refreshToken(refreshToken);

          if (response.success && response.data) {
            const { accessToken, refreshToken: newRefreshToken } = response.data;

            // Update tokens in localStorage
            localStorage.setItem('auth_token', accessToken);
            localStorage.setItem('refresh_token', newRefreshToken);

            set({
              token: accessToken,
              refreshToken: newRefreshToken,
            });

            return { accessToken, refreshToken: newRefreshToken };
          } else {
            throw new Error('Token refresh failed');
          }
        } catch (error) {
          // If refresh fails, logout user
          console.error('Token refresh failed:', error);
          get().logout();
          throw error;
        }
      },

      initializeAuth: async () => {
        // Check if user is already authenticated from persisted state
        const { token, refreshToken } = get();

        if (token) {
          try {
            // Validate token by making a simple API call
            const response = await api.get('/auth/me');

            if (response.data.success && response.data.data) {
              set({
                user: response.data.data,
                isAuthenticated: true,
                isLoading: false,
              });
            } else {
              throw new Error('Token validation failed');
            }
          } catch (error) {
            console.log('Token validation failed, attempting refresh...');

            // Token might be expired, try to refresh if we have refresh token
            if (refreshToken) {
              try {
                await get().refreshTokens();
                set({ isLoading: false });
              } catch (refreshError) {
                console.error('Token refresh failed during initialization:', refreshError);
                // Clear invalid tokens and set unauthenticated state
                localStorage.removeItem('auth_token');
                localStorage.removeItem('refresh_token');
                set({
                  user: null,
                  token: null,
                  refreshToken: null,
                  isAuthenticated: false,
                  isLoading: false,
                });
              }
            } else {
              // No refresh token, clear everything
              localStorage.removeItem('auth_token');
              localStorage.removeItem('refresh_token');
              set({
                user: null,
                token: null,
                refreshToken: null,
                isAuthenticated: false,
                isLoading: false,
              });
            }
          }
        } else {
          set({
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setUser: (user: User) => {
        set({ user });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      clearError: () => {
        set({ error: null });
      },

      // 2FA Actions
      setup2FA: async () => {
        set({ isLoading: true, error: null });

        try {
          const response = await twoFAApi.setup();

          if (response.success && response.data) {
            set({ isLoading: false });
            return response.data;
          } else {
            throw new Error(response.error?.message || '2FA setup failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.error?.message || error.message || '2FA setup failed',
          });
          throw error;
        }
      },

      verify2FASetup: async (totpCode: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await twoFAApi.verifySetup(totpCode);

          if (response.success) {
            // Update user to reflect 2FA is now enabled
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: { ...currentUser, twoFAEnabled: true },
                isLoading: false,
              });
            }
          } else {
            throw new Error(response.error?.message || '2FA verification failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error:
              error.response?.data?.error?.message || error.message || '2FA verification failed',
          });
          throw error;
        }
      },

      disable2FA: async (password: string, totpCode: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await twoFAApi.disable(password, totpCode);

          if (response.success) {
            // Update user to reflect 2FA is now disabled
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: { ...currentUser, twoFAEnabled: false },
                isLoading: false,
              });
            }
          } else {
            throw new Error(response.error?.message || '2FA disable failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.error?.message || error.message || '2FA disable failed',
          });
          throw error;
        }
      },

      get2FAStatus: async () => {
        try {
          const response = await twoFAApi.getStatus();

          if (response.success && response.data) {
            return response.data;
          } else {
            throw new Error(response.error?.message || 'Failed to get 2FA status');
          }
        } catch (error: any) {
          set({
            error:
              error.response?.data?.error?.message || error.message || 'Failed to get 2FA status',
          });
          throw error;
        }
      },

      recover2FA: async (email: string, backupCode: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await twoFAApi.recover(email, backupCode);

          if (response.success && response.data) {
            const { user, tokens } = response.data;

            // Store tokens in localStorage
            localStorage.setItem('auth_token', tokens.accessToken);
            localStorage.setItem('refresh_token', tokens.refreshToken);

            set({
              user,
              token: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              isAuthenticated: true,
              isLoading: false,
              error: null,
              twoFARequired: false,
            });
          } else {
            throw new Error(response.error?.message || '2FA recovery failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.error?.message || error.message || '2FA recovery failed',
          });
          throw error;
        }
      },

      // Profile Actions
      updateProfile: async (data: Partial<User>) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authApi.updateProfile(data);

          if (response.success && response.data) {
            set({
              user: response.data,
              isLoading: false,
            });
          } else {
            throw new Error(response.error?.message || 'Profile update failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.error?.message || error.message || 'Profile update failed',
          });
          throw error;
        }
      },

      changePassword: async (currentPassword: string, newPassword: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await authApi.changePassword(currentPassword, newPassword);

          if (response.success) {
            set({ isLoading: false });
          } else {
            throw new Error(response.error?.message || 'Password change failed');
          }
        } catch (error: any) {
          set({
            isLoading: false,
            error:
              error.response?.data?.error?.message || error.message || 'Password change failed',
          });
          throw error;
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
