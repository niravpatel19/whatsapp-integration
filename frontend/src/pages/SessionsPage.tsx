import React from 'react';
import { Layout, Typography, Card, Button, Space, Alert } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const SessionsPage: React.FC = () => {
  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200 px-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={3} className="mb-0">
              WhatsApp Sessions
            </Title>
            <Text type="secondary">
              Manage your WhatsApp device connections
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />}>
              New Session
            </Button>
          </Space>
        </div>
      </Header>

      <Content className="p-6">
        <Card>
          <Alert
            message="Sessions Page"
            description="This page will be implemented in later tasks. It will show all WhatsApp sessions with their status, QR codes, and management options."
            type="info"
            showIcon
          />
        </Card>
      </Content>
    </Layout>
  );
};

export default SessionsPage;