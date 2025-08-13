import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  twoFAEnabled: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  initializeAuth: () => void;
  setUser: (user: User) => void;
  setLoading: (loading: boolean) => void;
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

      // Actions
      login: async (email: string, password: string) => {
        set({ isLoading: true });
        
        try {
          // Placeholder login logic - will be implemented in later tasks
          console.log('Login attempt:', { email, password });
          
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // For now, just set a mock user
          const mockUser: User = {
            id: '1',
            email,
            name: 'Test User',
            twoFAEnabled: false,
          };
          
          set({
            user: mockUser,
            isAuthenticated: true,
            token: 'mock-jwt-token',
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        set({
          user: null,
          isAuthenticated: false,
          token: null,
          isLoading: false,
        });
      },

      initializeAuth: () => {
        // Check if user is already authenticated from persisted state
        const { token } = get();
        
        if (token) {
          // In a real app, you would validate the token with the server
          set({ isLoading: false });
        } else {
          set({ 
            isAuthenticated: false,
            isLoading: false 
          });
        }
      },

      setUser: (user: User) => {
        set({ user });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);