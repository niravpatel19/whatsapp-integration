import React from 'react';
import { Layout, Typography, Card, Button, Space, Alert } from 'antd';
import { SendOutlined, HistoryOutlined } from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const MessagesPage: React.FC = () => {
  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200 px-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={3} className="mb-0">
              Messages
            </Title>
            <Text type="secondary">
              Send and track WhatsApp messages
            </Text>
          </div>
          <Space>
            <Button icon={<HistoryOutlined />}>
              Message History
            </Button>
            <Button type="primary" icon={<SendOutlined />}>
              Send Message
            </Button>
          </Space>
        </div>
      </Header>

      <Content className="p-6">
        <Card>
          <Alert
            message="Messages Page"
            description="This page will be implemented in later tasks. It will include a message tester, message history, and real-time delivery tracking."
            type="info"
            showIcon
          />
        </Card>
      </Content>
    </Layout>
  );
};

export default MessagesPage;