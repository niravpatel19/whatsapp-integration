import React, { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Table,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Tag,
  Tabs,
  Switch,
  Divider,
  Alert,
  Spin,
} from 'antd';
import {
  KeyOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  SettingOutlined,
  UserOutlined,
  SecurityScanOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface APIKey {
  _id: string;
  keyPrefix: string;
  label: string;
  permissions: string[];
  lastUsedAt?: string;
  createdAt: string;
}

const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Fetch API keys
  const fetchApiKeys = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api-keys');
      setApiKeys(response.data.data.apiKeys || []);
    } catch (error: any) {
      message.error('Failed to load API keys');
      console.error('Failed to fetch API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  // Create new API key
  const handleCreateApiKey = async (values: any) => {
    try {
      const response = await api.post('/api-keys', {
        label: values.label,
        permissions: ['sessions:read', 'sessions:write', 'messages:send', 'messages:read'],
      });

      setNewApiKey(response.data.data.apiKey.key);
      setCreateModalVisible(false);
      form.resetFields();
      fetchApiKeys();
      message.success('API key created successfully');
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || 'Failed to create API key');
    }
  };

  // Delete API key
  const handleDeleteApiKey = async (keyId: string) => {
    try {
      await api.delete(`/api-keys/${keyId}`);
      fetchApiKeys();
      message.success('API key deleted successfully');
    } catch (error: any) {
      message.error('Failed to delete API key');
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard');
  };

  const apiKeyColumns = [
    {
      title: 'Label',
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: 'Key Preview',
      dataIndex: 'keyPrefix',
      key: 'keyPrefix',
      render: (prefix: string) => <Text code>{prefix}...****</Text>,
    },
    {
      title: 'Permissions',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (permissions: string[]) => (
        <Space wrap>
          {permissions.map((permission) => (
            <Tag key={permission} color="blue">
              {permission}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Last Used',
      dataIndex: 'lastUsedAt',
      key: 'lastUsedAt',
      render: (date: string) => (date ? new Date(date).toLocaleDateString() : 'Never'),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: APIKey) => (
        <Space>
          <Popconfirm
            title="Are you sure you want to delete this API key?"
            onConfirm={() => handleDeleteApiKey(record._id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small">
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200 px-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={3} className="mb-0">
              Profile & Settings
            </Title>
            <Text type="secondary">Manage your account, API keys, and application settings.</Text>
          </div>
        </div>
      </Header>

      <Content className="p-6">
        <Tabs defaultActiveKey="profile" size="large">
          {/* Profile Tab */}
          <TabPane
            tab={
              <span>
                <UserOutlined />
                Profile
              </span>
            }
            key="profile"
          >
            <Card>
              <Row gutter={[24, 24]}>
                <Col xs={24} md={12}>
                  <div className="space-y-4">
                    <div>
                      <Text strong>Name</Text>
                      <div className="mt-1">
                        <Text>{user?.name || 'Not set'}</Text>
                      </div>
                    </div>
                    <div>
                      <Text strong>Email</Text>
                      <div className="mt-1">
                        <Text>{user?.email}</Text>
                      </div>
                    </div>
                    <div>
                      <Text strong>Account Status</Text>
                      <div className="mt-1">
                        <Tag color="green">Active</Tag>
                      </div>
                    </div>
                    <div>
                      <Text strong>Member Since</Text>
                      <div className="mt-1">
                        <Text>
                          {user?.createdAt
                            ? new Date(user.createdAt).toLocaleDateString()
                            : 'Unknown'}
                        </Text>
                      </div>
                    </div>
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div className="space-y-4">
                    <Button type="primary" icon={<SettingOutlined />}>
                      Edit Profile
                    </Button>
                    <br />
                    <Button icon={<SecurityScanOutlined />}>Change Password</Button>
                  </div>
                </Col>
              </Row>
            </Card>
          </TabPane>

          {/* API Keys Tab */}
          <TabPane
            tab={
              <span>
                <KeyOutlined />
                API Keys
              </span>
            }
            key="apikeys"
          >
            <Card>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <Title level={4} className="mb-1">
                    API Keys
                  </Title>
                  <Text type="secondary">
                    Create and manage API keys for programmatic access to your WhatsApp integration.
                  </Text>
                </div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateModalVisible(true)}
                >
                  Create API Key
                </Button>
              </div>

              <Alert
                message="Keep your API keys secure"
                description="API keys provide full access to your account. Never share them publicly or store them in client-side code."
                type="warning"
                showIcon
                className="mb-4"
              />

              {loading ? (
                <div className="text-center py-8">
                  <Spin size="large" />
                </div>
              ) : (
                <Table
                  columns={apiKeyColumns}
                  dataSource={apiKeys}
                  rowKey="_id"
                  pagination={false}
                  locale={{
                    emptyText: 'No API keys created yet',
                  }}
                />
              )}
            </Card>
          </TabPane>

          {/* Settings Tab */}
          <TabPane
            tab={
              <span>
                <SettingOutlined />
                Settings
              </span>
            }
            key="settings"
          >
            <Card>
              <Title level={4}>Application Settings</Title>
              <Divider />

              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <Text strong>Email Notifications</Text>
                    <br />
                    <Text type="secondary">Receive email notifications for important events</Text>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <Text strong>Two-Factor Authentication</Text>
                    <br />
                    <Text type="secondary">Add an extra layer of security to your account</Text>
                  </div>
                  <Button type="primary" ghost>
                    Setup 2FA
                  </Button>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <Text strong>Webhook Notifications</Text>
                    <br />
                    <Text type="secondary">
                      Send real-time notifications to your webhook endpoints
                    </Text>
                  </div>
                  <Switch />
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <Text strong>Session Auto-cleanup</Text>
                    <br />
                    <Text type="secondary">
                      Automatically remove inactive sessions after 7 days
                    </Text>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </Card>
          </TabPane>
        </Tabs>

        {/* Create API Key Modal */}
        <Modal
          title="Create New API Key"
          open={createModalVisible}
          onCancel={() => {
            setCreateModalVisible(false);
            form.resetFields();
          }}
          footer={null}
        >
          <Form form={form} layout="vertical" onFinish={handleCreateApiKey}>
            <Form.Item
              name="label"
              label="Label"
              rules={[
                { required: true, message: 'Please enter a label for this API key' },
                { max: 50, message: 'Label cannot exceed 50 characters' },
              ]}
            >
              <Input placeholder="e.g., Production API, Development, Mobile App" />
            </Form.Item>

            <Alert
              message="Default Permissions"
              description="This API key will have permissions to read/write sessions and send/read messages. You can modify permissions later."
              type="info"
              showIcon
              className="mb-4"
            />

            <div className="flex justify-end space-x-2">
              <Button onClick={() => setCreateModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                Create API Key
              </Button>
            </div>
          </Form>
        </Modal>

        {/* New API Key Modal */}
        <Modal
          title="API Key Created Successfully"
          open={!!newApiKey}
          onCancel={() => setNewApiKey(null)}
          footer={[
            <Button key="copy" icon={<CopyOutlined />} onClick={() => copyToClipboard(newApiKey!)}>
              Copy to Clipboard
            </Button>,
            <Button key="close" type="primary" onClick={() => setNewApiKey(null)}>
              Close
            </Button>,
          ]}
        >
          <Alert
            message="Save this API key now"
            description="This is the only time you'll be able to see the full API key. Make sure to copy and store it securely."
            type="warning"
            showIcon
            className="mb-4"
          />

          <div className="bg-gray-50 p-4 rounded border">
            <Text code copyable={{ text: newApiKey! }}>
              {newApiKey}
            </Text>
          </div>
        </Modal>
      </Content>
    </Layout>
  );
};

export default ProfilePage;
