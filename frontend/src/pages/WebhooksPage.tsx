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
} from '@ant-design/icons';
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
        await api.put(`/webhooks/${editingWebhook.id}`, values);
        message.success('Webhook updated successfully');
      } else {
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
      render: (d: string) => d || <Text type="secondary">No description</Text>,
    },
    {
      title: 'Event Types',
      dataIndex: 'eventTypes',
      key: 'eventTypes',
      render: (types: string[]) => (
        <Space wrap>
          {types.slice(0, 3).map((t) => (
            <Tag key={t}>{t.replace(/_/g, ' ')}</Tag>
          ))}
          {types.length > 3 && <Tag>+{types.length - 3} more</Tag>}
        </Space>
      ),
    },
    { title: 'Status', key: 'status', render: (w: Webhook) => getHealthStatus(w) },
    {
      title: 'Success Rate',
      key: 'successRate',
      render: (w: Webhook) => (
        <Progress
          percent={w.stats.successRate}
          size="small"
          strokeColor={getSuccessRateColor(w.stats.successRate)}
          format={(p) => `${p?.toFixed(1)}%`}
        />
      ),
    },
    {
      title: 'Deliveries',
      key: 'deliveries',
      render: (w: Webhook) => (
        <Space direction="vertical" size="small">
          <Text strong>{w.stats.totalDeliveries}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {w.stats.successfulDeliveries} success, {w.stats.failedDeliveries} failed
          </Text>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (w: Webhook) => (
        <Space>
          <Tooltip title="Test webhook">
            <Button
              size="small"
              loading={testingWebhook === w.id}
              onClick={() => handleTestWebhook(w.id)}
            />
          </Tooltip>
          <Tooltip title="View logs">
            <Button icon={<HistoryOutlined />} size="small" onClick={() => handleViewLogs(w.id)} />
          </Tooltip>
          <Tooltip title="Edit webhook">
            <Button icon={<EditOutlined />} size="small" onClick={() => handleEditWebhook(w)} />
          </Tooltip>
          {w.retryCount > 0 && (
            <Tooltip title="Retry failed deliveries">
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={() => handleRetryWebhook(w.id)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="Are you sure you want to delete this webhook?"
            onConfirm={() => handleDeleteWebhook(w.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const overallStats = webhooks.reduce(
    (acc, w) => {
      acc.totalWebhooks++;
      if (w.isActive) acc.activeWebhooks++;
      if (w.health) acc.healthyWebhooks++;
      acc.totalDeliveries += w.stats.totalDeliveries;
      acc.successfulDeliveries += w.stats.successfulDeliveries;
      acc.failedDeliveries += w.stats.failedDeliveries;
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
      <Content className="py-6">
        <div className="container">
          <div className="page-header">
            <div>
              <Title level={3} className="mb-0">
                Webhook Management
              </Title>
              <Text type="secondary">
                Configure webhooks to receive real-time notifications about WhatsApp events
              </Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateWebhook}>
              Create Webhook
            </Button>
          </div>

          {/* Overview Stats */}
          <Row gutter={16} className="mb-6">
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="Total Webhooks"
                  value={overallStats.totalWebhooks}
                  prefix={<InfoCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="Active Webhooks"
                  value={overallStats.activeWebhooks}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
              <Card>
                <Statistic
                  title="Healthy Webhooks"
                  value={overallStats.healthyWebhooks}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                />
              </Card>
            </Col>
            <Col xs={24} md={6}>
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
          <Card title="Webhooks">
            <Table
              columns={columns}
              dataSource={webhooks}
              rowKey="id"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (t, r) => `${r[0]}-${r[1]} of ${t} webhooks`,
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
                    validator: (_, v) =>
                      v && !v.startsWith('https://')
                        ? Promise.reject('Webhook URL must use HTTPS')
                        : Promise.resolve(),
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
                  {eventTypes.map((et) => (
                    <Option key={et.type} value={et.type} label={et.type.replace(/_/g, ' ')}>
                      <div>
                        <div>{et.type.replace(/_/g, ' ')}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{et.description}</div>
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
              {selectedWebhookLogs.map((log, i) => (
                <Timeline.Item
                  key={i}
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
        </div>
      </Content>
    </Layout>
  );
};

export default WebhooksPage;
