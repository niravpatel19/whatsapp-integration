import React, { useState, useEffect } from 'react';
import {
  Layout,
  Button,
  Card,
  Table,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Typography,
  Alert,
  InputNumber,
  Divider,
} from 'antd';
import {
  ReloadOutlined,
  SendOutlined,
  FileOutlined,
  PictureOutlined,
  AudioOutlined,
  VideoCameraOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import { useSocket } from '../hooks/useSocket';
import { messagesApi, sessionsApi, type Message, type Session } from '../services/api';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const MessagesPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [form] = Form.useForm();

  const { connectionStatus, sendMessage, onMessageStatus, onError } = useSocket();

  // Load messages
  const loadMessages = async (sessionId?: string) => {
    try {
      setLoading(true);
      const response = await messagesApi.list(sessionId);
      if (response.success && response.data) {
        setMessages(response.data.messages);
      }
    } catch (error: any) {
      message.error('Failed to load messages: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load sessions
  const loadSessions = async () => {
    try {
      const response = await sessionsApi.list();
      if (response.success && response.data) {
        setSessions(response.data.sessions.filter((s) => s.status === 'CONNECTED'));
      }
    } catch (error: any) {
      message.error('Failed to load sessions: ' + error.message);
    }
  };

  // Handle send message
  const handleSendMessage = async (values: any) => {
    try {
      const messageData = {
        sessionId: values.sessionId,
        to: values.to,
        type: values.type,
        content: values.content,
        mediaUrl: values.mediaUrl,
        caption: values.caption,
        latitude: values.latitude,
        longitude: values.longitude,
        address: values.address,
      };

      const response = await sendMessage(messageData);
      if (response.success) {
        message.success('Message sent successfully');
        setSendModalVisible(false);
        form.resetFields();
        loadMessages(selectedSessionId);
      } else {
        message.error(response.error?.message || 'Failed to send message');
      }
    } catch (error: any) {
      message.error('Failed to send message: ' + error.message);
    }
  };

  // Socket event handlers
  useEffect(() => {
    const unsubscribeStatus = onMessageStatus((data: any) => {
      // Update message status
      setMessages((prev) =>
        prev.map((msg) =>
          msg.messageId === data.messageId ? { ...msg, status: data.status } : msg
        )
      );
    });

    const unsubscribeError = onError((error: any) => {
      message.error('Socket error: ' + error.message);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeError();
    };
  }, [onMessageStatus, onError]);

  // Load data on mount
  useEffect(() => {
    loadSessions();
    loadMessages();
  }, []);

  // Handle session filter change
  const handleSessionFilterChange = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    loadMessages(sessionId || undefined);
  };

  // Status color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SENT':
        return 'blue';
      case 'DELIVERED':
        return 'green';
      case 'READ':
        return 'cyan';
      case 'FAILED':
        return 'red';
      case 'QUEUED':
        return 'orange';
      default:
        return 'default';
    }
  };

  // Message type icon mapping
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text':
        return null;
      case 'image':
        return <PictureOutlined />;
      case 'document':
        return <FileOutlined />;
      case 'audio':
        return <AudioOutlined />;
      case 'video':
        return <VideoCameraOutlined />;
      case 'location':
        return <EnvironmentOutlined />;
      default:
        return null;
    }
  };

  const columns = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => <Tag icon={getTypeIcon(type)}>{type.toUpperCase()}</Tag>,
    },
    {
      title: 'To',
      dataIndex: 'to',
      key: 'to',
      width: 150,
      render: (to: string) => (
        <Text>
          <PhoneOutlined /> {to}
        </Text>
      ),
    },
    {
      title: 'Content',
      key: 'content',
      render: (_: any, record: Message) => {
        if (record.type === 'text') {
          return <Text ellipsis={{ tooltip: record.content }}>{record.content}</Text>;
        } else if (record.mediaUrl) {
          return (
            <div>
              <Text type="secondary">{record.mediaUrl}</Text>
              {record.caption && (
                <div>
                  <Text ellipsis={{ tooltip: record.caption }}>{record.caption}</Text>
                </div>
              )}
            </div>
          );
        } else if (record.type === 'location') {
          return (
            <Text type="secondary">
              {record.metadata?.latitude}, {record.metadata?.longitude}
              {record.metadata?.address && ` - ${record.metadata.address}`}
            </Text>
          );
        }
        return <Text type="secondary">-</Text>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <Tag color={getStatusColor(status)}>{status}</Tag>,
    },
    {
      title: 'Sent',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 150,
      render: (date: string) => new Date(date).toLocaleString(),
    },
  ];

  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container page-header">
          <div>
            <Title level={3} className="mb-0">
              Messages
            </Title>
            <Text type="secondary">Send and track WhatsApp messages</Text>
          </div>
          <div className="page-actions">
            <Select
              placeholder="Filter by session"
              style={{ width: 220 }}
              allowClear
              value={selectedSessionId || undefined}
              onChange={handleSessionFilterChange}
            >
              {sessions.map((session) => (
                <Option key={session.sessionId} value={session.sessionId}>
                  {session.deviceInfo?.name || 'Unknown Device'}
                  {session.phone && ` (${session.phone})`}
                </Option>
              ))}
            </Select>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => loadMessages(selectedSessionId)}
              loading={loading}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => setSendModalVisible(true)}
              disabled={connectionStatus !== 'connected' || sessions.length === 0}
            >
              Send Message
            </Button>
          </div>
        </div>
      </Header>

      <Content className="py-6">
        <div className="container">
          {connectionStatus !== 'connected' && (
            <Alert
              message="Socket.IO Connection Required"
              description="Real-time messaging requires an active Socket.IO connection."
              type="warning"
              showIcon
              className="mb-4"
            />
          )}

          {sessions.length === 0 && (
            <Alert
              message="No Connected Sessions"
              description="You need at least one connected WhatsApp session to send messages."
              type="info"
              showIcon
              className="mb-4"
            />
          )}

          <Card>
            <Table
              columns={columns}
              dataSource={messages}
              rowKey="messageId"
              loading={loading}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `Total ${total} messages`,
              }}
            />
          </Card>

          {/* Send Message Modal */}
          <Modal
            title="Send Message"
            open={sendModalVisible}
            onCancel={() => {
              setSendModalVisible(false);
              form.resetFields();
            }}
            footer={null}
            width={600}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSendMessage}
              initialValues={{ type: 'text' }}
            >
              <Form.Item
                name="sessionId"
                label="Session"
                rules={[{ required: true, message: 'Please select a session' }]}
              >
                <Select placeholder="Select a connected session">
                  {sessions.map((session) => (
                    <Option key={session.sessionId} value={session.sessionId}>
                      {session.deviceInfo?.name || 'Unknown Device'}
                      {session.phone && ` (${session.phone})`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="to"
                label="Recipient Phone Number"
                rules={[
                  { required: true, message: 'Please enter recipient phone number' },
                  { pattern: /^\+?[1-9]\d{1,14}$/, message: 'Please enter a valid phone number' },
                ]}
              >
                <Input placeholder="+1234567890" />
              </Form.Item>

              <Form.Item
                name="type"
                label="Message Type"
                rules={[{ required: true, message: 'Please select message type' }]}
              >
                <Select
                  onChange={() => {
                    // Reset form fields when type changes
                    form.setFieldsValue({
                      content: undefined,
                      mediaUrl: undefined,
                      caption: undefined,
                      latitude: undefined,
                      longitude: undefined,
                      address: undefined,
                    });
                  }}
                >
                  <Option value="text">Text</Option>
                  <Option value="image">Image</Option>
                  <Option value="document">Document</Option>
                  <Option value="audio">Audio</Option>
                  <Option value="video">Video</Option>
                  <Option value="location">Location</Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
              >
                {({ getFieldValue }) => {
                  const messageType = getFieldValue('type');

                  if (messageType === 'text') {
                    return (
                      <Form.Item
                        name="content"
                        label="Message Content"
                        rules={[{ required: true, message: 'Please enter message content' }]}
                      >
                        <TextArea
                          rows={4}
                          placeholder="Enter your message here..."
                          maxLength={4096}
                          showCount
                        />
                      </Form.Item>
                    );
                  } else if (['image', 'document', 'audio', 'video'].includes(messageType)) {
                    return (
                      <>
                        <Form.Item
                          name="mediaUrl"
                          label="Media URL"
                          rules={[
                            { required: true, message: 'Please enter media URL' },
                            { type: 'url', message: 'Please enter a valid URL' },
                          ]}
                        >
                          <Input placeholder="https://example.com/media.jpg" />
                        </Form.Item>
                        {['image', 'video', 'document'].includes(messageType) && (
                          <Form.Item name="caption" label="Caption (Optional)">
                            <TextArea
                              rows={2}
                              placeholder="Optional caption..."
                              maxLength={1024}
                              showCount
                            />
                          </Form.Item>
                        )}
                      </>
                    );
                  } else if (messageType === 'location') {
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <Form.Item
                            name="latitude"
                            label="Latitude"
                            rules={[{ required: true, message: 'Please enter latitude' }]}
                          >
                            <InputNumber
                              placeholder="37.7749"
                              min={-90}
                              max={90}
                              step={0.000001}
                              precision={6}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                          <Form.Item
                            name="longitude"
                            label="Longitude"
                            rules={[{ required: true, message: 'Please enter longitude' }]}
                          >
                            <InputNumber
                              placeholder="-122.4194"
                              min={-180}
                              max={180}
                              step={0.000001}
                              precision={6}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>
                        </div>
                        <Form.Item name="address" label="Address (Optional)">
                          <Input placeholder="San Francisco, CA, USA" />
                        </Form.Item>
                      </>
                    );
                  }
                  return null;
                }}
              </Form.Item>

              <Divider />

              <Form.Item className="mb-0">
                <Space className="w-full justify-end">
                  <Button
                    onClick={() => {
                      setSendModalVisible(false);
                      form.resetFields();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="primary" htmlType="submit" icon={<SendOutlined />}>
                    Send Message
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>
        </div>
      </Content>
    </Layout>
  );
};

export default MessagesPage;
