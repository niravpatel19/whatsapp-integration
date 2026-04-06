import React from 'react';
import {
  Layout,
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Button,
  Space,
  Spin,
  Alert,
  Timeline,
} from 'antd';
import {
  MessageOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  SettingOutlined,
  ReloadOutlined,
  ApiOutlined,
  FileTextOutlined,
  CloudDownloadOutlined,
  InfoCircleOutlined,
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

  // Build documentation links based on API base URL
  const API_BASE_URL =
    (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:7811/api/v1';
  const SERVER_BASE_URL = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const docsLinks = {
    swagger: `${SERVER_BASE_URL}/api/docs`,
    openapi: `${SERVER_BASE_URL}/api/docs.json`,
    postman: `${SERVER_BASE_URL}/api/postman`,
    info: `${SERVER_BASE_URL}/api/info`,
  };

  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container page-header">
          <div>
            <Title level={3} className="mb-0">
              Dashboard
            </Title>
            <Text type="secondary">
              Welcome back! Here's what's happening with your WhatsApp integration.
            </Text>
          </div>
          <div className="page-actions">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/sessions')}>
              New Session
            </Button>
            <Button onClick={() => navigate('/webhooks')}>Webhooks</Button>
            <Button
              type="default"
              className="bg-green-500 border-green-500 text-white"
              onClick={() => navigate('/simple-test')}
            >
              🧪 Simple Test
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => navigate('/profile')}>
              Settings
            </Button>
          </div>
        </div>
      </Header>

      <Content className="py-6">
        <div className="container">
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

              <Row gutter={[16, 16]} align="top">
                {/* Quick Actions */}
                <Col xs={24} lg={8}>
                  <Card title="Quick Actions">
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
                      <Button block icon={<SettingOutlined />} onClick={() => navigate('/profile')}>
                        Manage API Keys
                      </Button>
                    </Space>
                  </Card>
                </Col>

                {/* Recent Activity */}
                <Col xs={24} lg={16}>
                  <Card title="Recent Activity">
                    {recentActivity.length > 0 ? (
                      <Timeline
                        mode="left"
                        items={recentActivity.map((activity) => ({
                          dot: (
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary-500" />
                          ),
                          color: undefined,
                          label: (
                            <Text type="secondary" className="text-[11px]">
                              {activity.timestamp}
                            </Text>
                          ),
                          children: (
                            <div className="text-[13px] leading-5">
                              <Text>{activity.message}</Text>
                            </div>
                          ),
                        }))}
                        style={{ paddingLeft: 6 }}
                      />
                    ) : (
                      <div className="text-center py-8">
                        <Text type="secondary">No recent activity</Text>
                      </div>
                    )}
                  </Card>
                </Col>
              </Row>

              {/* API Documentation Links - full width */}
              <Row gutter={[16, 16]} className="mt-4">
                <Col xs={24}>
                  <Card title="API Documentation">
                    <Space direction="horizontal" className="w-full flex-wrap" size="middle">
                      <Button
                        icon={<ApiOutlined />}
                        href={docsLinks.swagger}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Swagger UI
                      </Button>
                      <Button
                        icon={<FileTextOutlined />}
                        href={docsLinks.openapi}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        OpenAPI JSON
                      </Button>
                      <Button
                        icon={<CloudDownloadOutlined />}
                        href={docsLinks.postman}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Postman Collection
                      </Button>
                      <Button
                        icon={<InfoCircleOutlined />}
                        href={docsLinks.info}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        API Info
                      </Button>
                    </Space>
                  </Card>
                </Col>
              </Row>

              {/* Getting Started Guide */}
              <Card title="Getting Started" className="mt-6">
                <Row gutter={[16, 16]}>
                  <Col xs={24} md={8}>
                    <div className="text-center p-4">
                      <PhoneOutlined className="text-4xl" style={{ color: '#128C7E' }} />
                      <Title level={4}>1. Create a Session</Title>
                      <Text type="secondary">
                        Start by creating a new WhatsApp session to connect your device.
                      </Text>
                    </div>
                  </Col>
                  <Col xs={24} md={8}>
                    <div className="text-center p-4">
                      <CheckCircleOutlined className="text-4xl" style={{ color: '#25D366' }} />
                      <Title level={4}>2. Scan QR Code</Title>
                      <Text type="secondary">
                        Use your WhatsApp mobile app to scan the QR code and connect.
                      </Text>
                    </div>
                  </Col>
                  <Col xs={24} md={8}>
                    <div className="text-center p-4">
                      <MessageOutlined className="text-4xl" style={{ color: '#128C7E' }} />
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
        </div>
      </Content>
    </Layout>
  );
};

export default DashboardPage;
