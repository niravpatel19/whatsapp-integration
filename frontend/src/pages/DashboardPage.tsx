import React from 'react';
import { Layout, Card, Row, Col, Statistic, Typography, Button, Space, Spin, Alert } from 'antd';
import { 
  MessageOutlined, 
  PhoneOutlined, 
  CheckCircleOutlined, 
  ClockCircleOutlined,
  PlusOutlined,
  SettingOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useDashboard();

  // Use real data from API or fallback to defaults
  const stats = data?.stats || {
    totalSessions: 0,
    activeSessions: 0,
    totalMessages: 0,
    messagesThisMonth: 0,
  };

  const recentActivity = data?.recentActivity || [];

  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200 px-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={3} className="mb-0">
              Dashboard
            </Title>
            <Text type="secondary">
              Welcome back! Here's what's happening with your WhatsApp integration.
            </Text>
          </div>
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => navigate('/sessions')}
            >
              New Session
            </Button>
            <Button 
              icon={<SettingOutlined />}
              onClick={() => navigate('/profile')}
            >
              Settings
            </Button>
          </Space>
        </div>
      </Header>

      <Content className="p-6">
        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <Spin size="large" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <Alert
            message="Failed to load dashboard data"
            description={error}
            type="error"
            showIcon
            className="mb-6"
            action={
              <Button size="small" onClick={refresh} icon={<ReloadOutlined />}>
                Retry
              </Button>
            }
          />
        )}

        {/* Dashboard Content */}
        {!loading && !error && (
          <>
        {/* Statistics Cards */}
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Sessions"
                value={stats.totalSessions}
                prefix={<PhoneOutlined className="text-blue-500" />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Active Sessions"
                value={stats.activeSessions}
                prefix={<CheckCircleOutlined className="text-green-500" />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Total Messages"
                value={stats.totalMessages}
                prefix={<MessageOutlined className="text-purple-500" />}
                valueStyle={{ color: '#722ed1' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="This Month"
                value={stats.messagesThisMonth}
                prefix={<ClockCircleOutlined className="text-orange-500" />}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          {/* Quick Actions */}
          <Col xs={24} lg={8}>
            <Card title="Quick Actions" className="h-full">
              <Space direction="vertical" className="w-full" size="middle">
                <Button 
                  type="primary" 
                  block 
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/sessions')}
                >
                  Create New Session
                </Button>
                <Button 
                  block 
                  icon={<MessageOutlined />}
                  onClick={() => navigate('/messages')}
                >
                  Send Test Message
                </Button>
                <Button 
                  block 
                  icon={<SettingOutlined />}
                  onClick={() => navigate('/profile')}
                >
                  Manage API Keys
                </Button>
              </Space>
            </Card>
          </Col>

          {/* Recent Activity */}
          <Col xs={24} lg={16}>
            <Card title="Recent Activity" className="h-full">
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">
                      {activity.type === 'session_connected' && (
                        <CheckCircleOutlined className="text-green-500 text-lg" />
                      )}
                      {activity.type === 'message_sent' && (
                        <MessageOutlined className="text-blue-500 text-lg" />
                      )}
                      {activity.type === 'session_created' && (
                        <PhoneOutlined className="text-purple-500 text-lg" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Text className="block">{activity.message}</Text>
                      <Text type="secondary" className="text-sm">
                        {activity.timestamp}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
              
              {recentActivity.length === 0 && (
                <div className="text-center py-8">
                  <Text type="secondary">No recent activity</Text>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Getting Started Guide */}
        <Card title="Getting Started" className="mt-6">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <div className="text-center p-4">
                <PhoneOutlined className="text-4xl text-blue-500 mb-3" />
                <Title level={4}>1. Create a Session</Title>
                <Text type="secondary">
                  Start by creating a new WhatsApp session to connect your device.
                </Text>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div className="text-center p-4">
                <CheckCircleOutlined className="text-4xl text-green-500 mb-3" />
                <Title level={4}>2. Scan QR Code</Title>
                <Text type="secondary">
                  Use your WhatsApp mobile app to scan the QR code and connect.
                </Text>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div className="text-center p-4">
                <MessageOutlined className="text-4xl text-purple-500 mb-3" />
                <Title level={4}>3. Send Messages</Title>
                <Text type="secondary">
                  Start sending messages through the API or test interface.
                </Text>
              </div>
            </Col>
          </Row>
        </Card>
          </>
        )}
      </Content>
    </Layout>
  );
};

export default DashboardPage;