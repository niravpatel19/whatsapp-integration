import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Layout, Spin, Alert, Menu, Dropdown, Avatar } from 'antd';
import { useAuthStore } from '@/stores/authStore';
import { useSocket } from '@/hooks/useSocket';

// Placeholder components - will be implemented in later tasks
const LoginPage = React.lazy(() => import('@/pages/LoginPage'));
const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'));
const SessionsPage = React.lazy(() => import('@/pages/SessionsPage'));
const MessagesPage = React.lazy(() => import('@/pages/MessagesPage'));
const ProfilePage = React.lazy(() => import('@/pages/ProfilePage'));
const WebhooksPage = React.lazy(() => import('@/pages/WebhooksPage'));
const SimpleWhatsAppTest = React.lazy(() => import('@/pages/SimpleWhatsAppTest'));
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'));

const { Header, Content } = Layout;

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
  const { initializeAuth, user, logout } = useAuthStore();
  const { connectionStatus } = useSocket();
  const location = useLocation();

  // Initialize authentication on app start
  React.useEffect(() => {
    const initAuth = async () => {
      try {
        await initializeAuth();
      } catch (error) {
        // Authentication initialization failed
      }
    };

    initAuth();
  }, [initializeAuth]);

  const selectedKey = React.useMemo(() => {
    if (location.pathname.startsWith('/sessions')) return 'sessions';
    if (location.pathname.startsWith('/messages')) return 'messages';
    if (location.pathname.startsWith('/webhooks')) return 'webhooks';
    if (location.pathname.startsWith('/profile')) return 'profile';
    if (location.pathname.startsWith('/simple-test')) return 'simple-test';
    return 'dashboard';
  }, [location.pathname]);

  const userMenu = (
    <Menu
      items={[
        { key: 'profile', label: <Link to="/profile">Profile</Link> },
        { type: 'divider' as any },
        { key: 'logout', label: <span onClick={() => logout()}>Logout</span> },
      ]}
    />
  );

  return (
    <Layout className="min-h-screen">
      {!location.pathname.startsWith('/login') && (
        <Header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
          <div className="container py-3 flex items-center justify-between">
            <Link to="/dashboard" className="text-lg font-semibold text-gray-900">
              WhatsApp Integration
            </Link>
            <div className="flex-1 mx-6">
              <Menu
                mode="horizontal"
                selectedKeys={[selectedKey]}
                style={{ borderBottom: 'none' }}
                items={[
                  { key: 'dashboard', label: <Link to="/dashboard">Dashboard</Link> },
                  { key: 'sessions', label: <Link to="/sessions">Sessions</Link> },
                  { key: 'messages', label: <Link to="/messages">Messages</Link> },
                  { key: 'webhooks', label: <Link to="/webhooks">Webhooks</Link> },
                  { key: 'profile', label: <Link to="/profile">Settings</Link> },
                  { key: 'simple-test', label: <Link to="/simple-test">Simple Test</Link> },
                ]}
              />
            </div>
            <Dropdown overlay={userMenu} trigger={['click']} placement="bottomRight">
              <div className="flex items-center gap-2 cursor-pointer">
                <Avatar size={28} style={{ backgroundColor: '#25D366' }}>
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                </Avatar>
                <span className="text-sm text-gray-700">{user?.name || user?.email || 'User'}</span>
              </div>
            </Dropdown>
          </div>
        </Header>
      )}
      <Content>
        {/* Connection Status Alert */}
        {connectionStatus === 'disconnected' && !location.pathname.startsWith('/login') && (
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
            <Route
              path="/webhooks"
              element={
                <ProtectedRoute>
                  <WebhooksPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/simple-test"
              element={
                <ProtectedRoute>
                  <SimpleWhatsAppTest />
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
