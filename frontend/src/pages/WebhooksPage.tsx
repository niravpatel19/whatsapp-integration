import React, { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Tag,
  Space,
  Tooltip,
  message,
  Popconfirm,
  Typography,
  Statistic,
  Row,
  Col,
  Badge,
  Timeline,
  Progress,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  HistoryOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

interface Webhook {
  id: string;
  url: string;
  description?: string;
  isActive: boolean;
  eventTypes: string[];
  createdAt: string;
  updatedAt: string;
  stats: {
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    successRate: number;
    averageResponseTime: number;
    lastDeliveryAt?: string;
    lastSuccessAt?: string;
    lastFailureAt?: string;
  };
  health: boolean;
  lastResponseCode?: number;
  lastError?: string;
  retryCount: number;
}

interface EventType {
  type: string;
  description: string;
}

interface DeliveryLog {
  timestamp: string;
  success: boolean;
  responseCode?: number;
  responseTime: number;
  error?: string;
  retryCount: number;
}

const WebhooksPage: React.FC = () => {
  const navigate = useNavigate();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [logsModalVisible, setLogsModalVisible] = useState(false);
  const [selectedWebhookLogs, setSelectedWebhookLogs] = useState<DeliveryLog[]>([]);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  const [form] = Form.useForm();

  // Load webhooks and event types
  useEffect(() => {
    loadWebhooks();
    loadEventTypes();
  }, []);

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      const response = await api.get('/webhooks');
      setWebhooks(response.data.webhooks || []);
    } catch (error: any) {
      message.error(
        'Failed to load webhooks: ' + (error.response?.data?.error?.message || error.message)
      );
    } finally {
      setLoading(false);
    }
  };

  const loadEventTypes = async () => {
    try {
      const response = await api.get('/webhooks/event-types');
      setEventTypes(response.data.eventTypes || []);
    } catch (error: any) {
      console.error('Failed to load event types:', error);
    }
  };

  const handleCreateWebhook = () => {
    setEditingWebhook(null);
    form.resetFields();
    form.setFieldsValue({
      isActive: true,
      eventTypes: [],
    });
    setModalVisible(true);
  };

  const handleEditWebhook = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    form.setFieldsValue({
      url: webhook.url,
      description: webhook.description,
      isActive: webhook.isActive,
      eventTypes: webhook.eventTypes,
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingWebhook) {
        // Update existing webhook
        await api.put(`/webhooks/${editingWebhook.id}`, values);
        message.success('Webhook updated successfully');
      } else {
        // Create new webhook
        await api.post('/webhooks', values);
        message.success('Webhook created successfully');
      }

      setModalVisible(false);
      loadWebhooks();
    } catch (error: any) {
      message.error(
        'Failed to save webhook: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    try {
      await api.delete(`/webhooks/${webhookId}`);
      message.success('Webhook deleted successfully');
      loadWebhooks();
    } catch (error: any) {
      message.error(
        'Failed to delete webhook: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    try {
      setTestingWebhook(webhookId);
      const response = await api.post(`/webhooks/${webhookId}/test`, {
        payload: {
          test: true,
          timestamp: new Date().toISOString(),
          message: 'This is a test webhook delivery from WhatsApp Integration',
        },
      });

      const testResult = response.data.test;
      if (testResult.success) {
        message.success(
          `Webhook test successful! Response: ${testResult.responseCode} (${testResult.responseTime}ms)`
        );
      } else {
        message.error(`Webhook test failed: ${testResult.error || 'Unknown error'}`);
      }

      // Refresh webhooks to show updated stats
      loadWebhooks();
    } catch (error: any) {
      message.error(
        'Failed to test webhook: ' + (error.response?.data?.error?.message || error.message)
      );
    } finally {
      setTestingWebhook(null);
    }
  };

  const handleViewLogs = async (webhookId: string) => {
    try {
      const response = await api.get(`/webhooks/${webhookId}/logs?limit=50`);
      setSelectedWebhookLogs(response.data.logs || []);
      setLogsModalVisible(true);
    } catch (error: any) {
      message.error(
        'Failed to load webhook logs: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  };

  const handleRetryWebhook = async (webhookId: string) => {
    try {
      await api.post(`/webhooks/${webhookId}/retry`);
      message.success('Webhook retry initiated');
      loadWebhooks();
    } catch (error: any) {
      message.error(
        'Failed to retry webhook: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  };

  const getHealthStatus = (webhook: Webhook) => {
    if (!webhook.isActive) {
      return <Badge status="default" text="Inactive" />;
    }

    if (webhook.health) {
      return <Badge status="success" text="Healthy" />;
    }

    if (webhook.retryCount > 0) {
      return <Badge status="warning" text="Retrying" />;
    }

    return <Badge status="error" text="Unhealthy" />;
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 95) return '#52c41a';
    if (rate >= 80) return '#faad14';
    return '#ff4d4f';
  };

  const columns = [
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url: string) => (
        <Tooltip title={url}>
          <Text ellipsis style={{ maxWidth: 200 }}>
            {url}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (description: string) => description || <Text type="secondary">No description</Text>,
    },
    {
      title: 'Event Types',
      dataIndex: 'eventTypes',
      key: 'eventTypes',
      render: (eventTypes: string[]) => (
        <Space wrap>
          {eventTypes.slice(0, 3).map((type) => (
            <Tag key={type}>{type.replace(/_/g, ' ')}</Tag>
          ))}
          {eventTypes.length > 3 && <Tag>+{eventTypes.length - 3} more</Tag>}
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (webhook: Webhook) => getHealthStatus(webhook),
    },
    {
      title: 'Success Rate',
      key: 'successRate',
      render: (webhook: Webhook) => {
        const rate = webhook.stats.successRate;
        return (
          <Progress
            percent={rate}
            size="small"
            strokeColor={getSuccessRateColor(rate)}
            format={(percent) => `${percent?.toFixed(1)}%`}
          />
        );
      },
    },
    {
      title: 'Deliveries',
      key: 'deliveries',
      render: (webhook: Webhook) => (
        <Space direction="vertical" size="small">
          <Text strong>{webhook.stats.totalDeliveries}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {webhook.stats.successfulDeliveries} success, {webhook.stats.failedDeliveries} failed
          </Text>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (webhook: Webhook) => (
        <Space>
          <Tooltip title="Test webhook">
            <Button
              size="small"
              loading={testingWebhook === webhook.id}
              onClick={() => handleTestWebhook(webhook.id)}
            />
          </Tooltip>
          <Tooltip title="View logs">
            <Button
              icon={<HistoryOutlined />}
              size="small"
              onClick={() => handleViewLogs(webhook.id)}
            />
          </Tooltip>
          <Tooltip title="Edit webhook">
            <Button
              icon={<EditOutlined />}
              size="small"
              onClick={() => handleEditWebhook(webhook)}
            />
          </Tooltip>
          {webhook.retryCount > 0 && (
            <Tooltip title="Retry failed deliveries">
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={() => handleRetryWebhook(webhook.id)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="Are you sure you want to delete this webhook?"
            onConfirm={() => handleDeleteWebhook(webhook.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Calculate overall stats
  const overallStats = webhooks.reduce(
    (acc, webhook) => {
      acc.totalWebhooks++;
      if (webhook.isActive) acc.activeWebhooks++;
      if (webhook.health) acc.healthyWebhooks++;
      acc.totalDeliveries += webhook.stats.totalDeliveries;
      acc.successfulDeliveries += webhook.stats.successfulDeliveries;
      acc.failedDeliveries += webhook.stats.failedDeliveries;
      return acc;
    },
    {
      totalWebhooks: 0,
      activeWebhooks: 0,
      healthyWebhooks: 0,
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
    }
  );

  const overallSuccessRate =
    overallStats.totalDeliveries > 0
      ? (overallStats.successfulDeliveries / overallStats.totalDeliveries) * 100
      : 0;

  return (
    <Layout>
      <Layout.Header className="bg-white shadow-sm border-b border-gray-200 px-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={3} className="mb-0">
              Webhook Management
            </Title>
            <Text type="secondary">
              Configure webhooks to receive real-time notifications about WhatsApp events
            </Text>
          </div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </Button>
            <Button onClick={() => navigate('/sessions')}>Sessions</Button>
            <Button onClick={() => navigate('/messages')}>Messages</Button>
          </Space>
        </div>
      </Layout.Header>
      <Content style={{ padding: '24px' }}>
        {/* Overview Stats */}
        <Row gutter={16} style={{ marginBottom: '24px' }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Webhooks"
                value={overallStats.totalWebhooks}
                prefix={<InfoCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Active Webhooks"
                value={overallStats.activeWebhooks}
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Healthy Webhooks"
                value={overallStats.healthyWebhooks}
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Success Rate"
                value={overallSuccessRate}
                precision={1}
                suffix="%"
                valueStyle={{ color: getSuccessRateColor(overallSuccessRate) }}
              />
            </Card>
          </Col>
        </Row>

        {/* Webhooks Table */}
        <Card
          title="Webhooks"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateWebhook}>
              Create Webhook
            </Button>
          }
        >
          <Table
            columns={columns}
            dataSource={webhooks}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} webhooks`,
            }}
          />
        </Card>

        {/* Create/Edit Webhook Modal */}
        <Modal
          title={editingWebhook ? 'Edit Webhook' : 'Create Webhook'}
          open={modalVisible}
          onCancel={() => setModalVisible(false)}
          footer={null}
          width={600}
        >
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              name="url"
              label="Webhook URL"
              rules={[
                { required: true, message: 'Please enter webhook URL' },
                { type: 'url', message: 'Please enter a valid URL' },
                {
                  validator: (_, value) => {
                    if (value && !value.startsWith('https://')) {
                      return Promise.reject('Webhook URL must use HTTPS');
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <Input placeholder="https://your-domain.com/webhook" />
            </Form.Item>

            <Form.Item name="description" label="Description">
              <Input.TextArea placeholder="Optional description for this webhook" rows={3} />
            </Form.Item>

            <Form.Item
              name="eventTypes"
              label="Event Types"
              rules={[{ required: true, message: 'Please select at least one event type' }]}
            >
              <Select
                mode="multiple"
                placeholder="Select event types to subscribe to"
                optionLabelProp="label"
              >
                {eventTypes.map((eventType) => (
                  <Option
                    key={eventType.type}
                    value={eventType.type}
                    label={eventType.type.replace(/_/g, ' ')}
                  >
                    <div>
                      <div>{eventType.type.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{eventType.description}</div>
                    </div>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item name="isActive" label="Status" valuePropName="checked">
              <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  {editingWebhook ? 'Update' : 'Create'} Webhook
                </Button>
                <Button onClick={() => setModalVisible(false)}>Cancel</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        {/* Webhook Logs Modal */}
        <Modal
          title="Webhook Delivery Logs"
          open={logsModalVisible}
          onCancel={() => setLogsModalVisible(false)}
          footer={null}
          width={800}
        >
          <Timeline>
            {selectedWebhookLogs.map((log, index) => (
              <Timeline.Item
                key={index}
                color={log.success ? 'green' : 'red'}
                dot={
                  log.success ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  )
                }
              >
                <div>
                  <div style={{ marginBottom: '8px' }}>
                    <Text strong>{new Date(log.timestamp).toLocaleString()}</Text>
                    <Tag color={log.success ? 'success' : 'error'} style={{ marginLeft: '8px' }}>
                      {log.success ? 'Success' : 'Failed'}
                    </Tag>
                    {log.responseCode && (
                      <Tag style={{ marginLeft: '4px' }}>{log.responseCode}</Tag>
                    )}
                  </div>
                  <div>
                    <Text type="secondary">Response time: {log.responseTime}ms</Text>
                    {log.retryCount > 0 && (
                      <Text type="secondary" style={{ marginLeft: '16px' }}>
                        Retry #{log.retryCount}
                      </Text>
                    )}
                  </div>
                  {log.error && (
                    <div style={{ marginTop: '4px' }}>
                      <Text type="danger">{log.error}</Text>
                    </div>
                  )}
                </div>
              </Timeline.Item>
            ))}
          </Timeline>
        </Modal>
      </Content>
    </Layout>
  );
};

export default WebhooksPage;
