import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Spin, Alert } from 'antd';
import { useAuthStore } from '@/stores/authStore';
import { useSocket } from '@/hooks/useSocket';

// Placeholder components - will be implemented in later tasks
const LoginPage = React.lazy(() => import('@/pages/LoginPage'));
const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'));
const SessionsPage = React.lazy(() => import('@/pages/SessionsPage'));
const MessagesPage = React.lazy(() => import('@/pages/MessagesPage'));
const ProfilePage = React.lazy(() => import('@/pages/ProfilePage'));
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'));

const { Content } = Layout;

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Public Route Component (redirect if authenticated)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  const { initializeAuth } = useAuthStore();
  const { connectionStatus } = useSocket();

  // Initialize authentication on app start
  React.useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <Layout className="min-h-screen">
      <Content>
        {/* Connection Status Alert */}
        {connectionStatus === 'disconnected' && (
          <Alert
            message="Connection Lost"
            description="Attempting to reconnect to the server..."
            type="warning"
            showIcon
            closable
            className="mb-4"
          />
        )}

        <React.Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen">
              <Spin size="large" tip="Loading..." />
            </div>
          }
        >
          <Routes>
            {/* Public Routes */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sessions"
              element={
                <ProtectedRoute>
                  <SessionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/messages"
              element={
                <ProtectedRoute>
                  <MessagesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            {/* Default Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </React.Suspense>
      </Content>
    </Layout>
  );
};

export default App;