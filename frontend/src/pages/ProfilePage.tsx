import React from 'react';
import { Layout, Typography, Card, Button, Space, Alert } from 'antd';
import { UserOutlined, KeyOutlined, SettingOutlined } from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const ProfilePage: React.FC = () => {
  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200 px-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={3} className="mb-0">
              Profile & Settings
            </Title>
            <Text type="secondary">
              Manage your account and API settings
            </Text>
          </div>
          <Space>
            <Button icon={<KeyOutlined />}>
              API Keys
            </Button>
            <Button type="primary" icon={<SettingOutlined />}>
              Settings
            </Button>
          </Space>
        </div>
      </Header>

      <Content className="p-6">
        <Card>
          <Alert
            message="Profile Page"
            description="This page will be implemented in later tasks. It will include user profile management, API key management, 2FA settings, and account preferences."
            type="info"
            showIcon
          />
        </Card>
      </Content>
    </Layout>
  );
};

export default ProfilePage;