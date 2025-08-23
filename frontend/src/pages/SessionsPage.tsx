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
  message,
  Popconfirm,
  Tooltip,
  Typography,
  Spin,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  QrcodeOutlined,
  PhoneOutlined,
  WifiOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useSocket } from '../hooks/useSocket';
import { sessionsApi, type Session } from '../services/api';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface SessionWithQR extends Session {
  qrData?: string;
  qrExpiresAt?: string;
  qrTries?: number;
  remainingTime?: number;
}

const SessionsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionWithQR[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithQR | null>(null);
  const [qrCountdown, setQrCountdown] = useState<number>(0);
  const [form] = Form.useForm();

  const { connectionStatus, createSession, deleteSession, refreshQR } = useSocket();

  // Load sessions with better error handling
  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await sessionsApi.list();
      if (response.success && response.data) {
        setSessions(response.data.sessions || []);
      } else {
        message.error('Failed to load sessions: ' + (response.error?.message || 'Unknown error'));
        setSessions([]);
      }
    } catch (error: any) {
      message.error('Failed to load sessions: ' + (error.message || 'Network error'));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle create session
  const [createLoading, setCreateLoading] = useState(false);

  const handleCreateSession = async (values: { deviceName?: string; webhookUrl?: string }) => {
    try {
      setCreateLoading(true);
      const response = await createSession(values.deviceName, values.webhookUrl);
      if (response.success) {
        message.success('Session created successfully');
        setCreateModalVisible(false);
        form.resetFields();
        loadSessions();
      } else {
        message.error(response.error?.message || 'Failed to create session');
      }
    } catch (error: any) {
      message.error('Failed to create session: ' + error.message);
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle delete session
  const handleDeleteSession = async (sessionId: string) => {
    try {
      const response = await deleteSession(sessionId);
      if (response.success) {
        message.success('Session deleted successfully');
        loadSessions();
      } else {
        message.error(response.error?.message || 'Failed to delete session');
      }
    } catch (error: any) {
      message.error('Failed to delete session: ' + error.message);
    }
  };

  // Handle refresh QR
  const handleRefreshQR = async (sessionId: string) => {
    try {
      const response = await refreshQR(sessionId);
      if (response.success) {
        message.success('QR refresh initiated');
      } else {
        message.error(response.error?.message || 'Failed to refresh QR');
      }
    } catch (error: any) {
      message.error('Failed to refresh QR: ' + error.message);
    }
  };

  // Show QR modal - SIMPLIFIED like working demo with DISCONNECTED handling
  const showQRModal = async (session: SessionWithQR) => {
    try {
      if (session.status === 'CONNECTED') {
        setSelectedSession(session);
        setQrModalVisible(true);
        return;
      }

      // Handle DISCONNECTED sessions - need to reconnect first
      if (session.status === 'DISCONNECTED') {
        message.loading('Reconnecting session...', 1);

        try {
          // Use refreshQR to initiate reconnection
          await handleRefreshQR(session.sessionId);
          message.info('Reconnection started! QR code will appear soon.');
          // Socket.IO will handle the QR update
          return;
        } catch (reconnectError: any) {
          message.error('Failed to reconnect: ' + reconnectError.message);
          return;
        }
      }

      // Try to get existing QR from API first
      message.loading('Getting QR code...', 0.5);
      try {
        const response = await sessionsApi.getQR(session.sessionId);
        if (response.success && response.data) {
          setSelectedSession({
            ...session,
            qrData: response.data.qrData,
            qrExpiresAt: response.data.expiresAt,
            qrTries: response.data.tries,
            remainingTime: response.data.remainingTime,
          });
          setQrModalVisible(true);
          return;
        }
      } catch (getQRError) {
        // No existing QR found, will generate new one
      }

      // No QR found, request refresh and wait for Socket.IO event
      await handleRefreshQR(session.sessionId);
      message.info('Generating QR code... Please wait.');
    } catch (error: any) {
      message.error('Failed to get QR code: ' + error.message);
    }
  };

  // IMPROVED Socket.IO connection - based on working demo pattern
  useEffect(() => {
    const { token } = useAuthStore.getState();

    if (!token) {
      return;
    }

    const socketUrl = (import.meta as any).env?.VITE_SOCKET_URL || 'http://localhost:3001';
    let directSocket: any = null;
    let notificationShown = new Set<string>(); // Track shown notifications

    try {
      directSocket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 10000,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      });

      directSocket.on('connect', () => {
        notificationShown.clear(); // Reset notification tracking on new connection
      });

      directSocket.on('connect_error', () => {
        // Connection error handled by reconnection logic
      });

      directSocket.on('qr:update', (data: any) => {
        if (!data || !data.sessionId) {
          return;
        }

        // Update sessions immediately
        setSessions((prevSessions) => {
          const updatedSessions = prevSessions.map((session) =>
            session.sessionId === data.sessionId
              ? {
                  ...session,
                  qrData: data.qrData,
                  qrExpiresAt: data.expiresAt,
                  qrTries: data.tries,
                  remainingTime: data.remainingTime,
                  status: 'QR' as SessionWithQR['status'],
                }
              : session
          );

          // Check if this is a NEW session that we just created but isn't in the list yet
          const existingSession = prevSessions.find((s) => s.sessionId === data.sessionId);
          if (!existingSession) {
            // Refresh the sessions list to get the new session, then auto-open QR
            setTimeout(() => {
              loadSessions().then(() => {
                // Find the session after refresh
                setSessions((currentSessions) => {
                  const newSession = currentSessions.find((s) => s.sessionId === data.sessionId);
                  if (newSession && !qrModalVisible) {
                    setSelectedSession({
                      ...newSession,
                      qrData: data.qrData,
                      qrExpiresAt: data.expiresAt,
                      qrTries: data.tries,
                      remainingTime: data.remainingTime,
                    });
                    setQrModalVisible(true);
                    message.success('QR Code generated! Scan with WhatsApp.');
                  }
                  return currentSessions;
                });
              });
            }, 500);
          } else {
            // Existing session - auto-open QR modal if not already open
            const session = updatedSessions.find((s) => s.sessionId === data.sessionId);
            if (session && session.qrData && !qrModalVisible) {
              // Use setTimeout to avoid state updates during render
              setTimeout(() => {
                setSelectedSession(session);
                setQrModalVisible(true);
                message.success('QR Code generated! Scan with WhatsApp.');
              }, 100);
            }
          }

          return updatedSessions;
        });
      });

      directSocket.on('session:state', (data: any) => {
        if (!data || !data.sessionId) {
          return;
        }

        setSessions((prev) =>
          prev.map((session) =>
            session.sessionId === data.sessionId
              ? {
                  ...session,
                  status: data.status as SessionWithQR['status'],
                  phone: data.phone,
                  deviceInfo: data.deviceInfo || session.deviceInfo,
                }
              : session
          )
        );

        // Auto-close QR modal when session becomes CONNECTED (prevent duplicate notifications)
        if (data.status === 'CONNECTED') {
          const notificationKey = `connected-${data.sessionId}`;
          if (!notificationShown.has(notificationKey)) {
            notificationShown.add(notificationKey);

            if (selectedSession?.sessionId === data.sessionId && qrModalVisible) {
              setTimeout(() => {
                message.success('WhatsApp connected successfully!');
                setQrModalVisible(false);
                setSelectedSession(null);
              }, 500); // Reduced delay for faster response
            } else {
              // Session connected but modal not open - just show notification
              message.success(`Session ${data.sessionId.slice(0, 8)}... connected successfully!`);
            }
          }
        }
      });

      directSocket.on('disconnect', () => {
        notificationShown.clear();
      });

      directSocket.on('error', () => {
        // Error handled by reconnection logic
      });
    } catch (socketError) {
      // Socket connection failed, handled by reconnection logic
    }

    return () => {
      if (directSocket) {
        try {
          directSocket.disconnect();
        } catch (cleanupError) {
          // Cleanup error ignored
        }
      }
    };
  }, []); // Removed dependencies to prevent re-creation

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // QR countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (qrModalVisible && selectedSession?.remainingTime && selectedSession.remainingTime > 0) {
      setQrCountdown(selectedSession.remainingTime);

      interval = setInterval(() => {
        setQrCountdown((prev) => {
          if (prev <= 1) {
            message.warning('QR code expired. Please refresh to get a new one.');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [qrModalVisible, selectedSession?.remainingTime]);

  // Status color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return 'green';
      case 'QR':
        return 'orange';
      case 'PENDING':
        return 'blue';
      case 'DISCONNECTED':
        return 'red';
      case 'ERROR':
        return 'red';
      case 'EXPIRED':
        return 'gray';
      default:
        return 'default';
    }
  };

  // Status icon mapping
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONNECTED':
        return <WifiOutlined />;
      case 'QR':
        return <QrcodeOutlined />;
      case 'PENDING':
        return <Spin size="small" />;
      case 'DISCONNECTED':
        return <DisconnectOutlined />;
      case 'ERROR':
        return <ExclamationCircleOutlined />;
      default:
        return null;
    }
  };

  const columns = [
    {
      title: 'Device Name',
      dataIndex: ['deviceInfo', 'name'],
      key: 'deviceName',
      render: (name: string) => name || 'Unknown Device',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)} icon={getStatusIcon(status)}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string) =>
        phone ? (
          <Text>
            <PhoneOutlined /> {phone}
          </Text>
        ) : (
          <Text type="secondary">Not connected</Text>
        ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Last Seen',
      dataIndex: 'lastSeenAt',
      key: 'lastSeenAt',
      render: (date: string) => (date ? new Date(date).toLocaleString() : 'Never'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: SessionWithQR) => (
        <Space>
          <Tooltip title="Copy Session ID">
            <Button
              type="text"
              icon={<CopyOutlined />}
              size="small"
              onClick={() => {
                navigator.clipboard.writeText(record.sessionId);
                message.success('Session ID copied to clipboard!');
              }}
            />
          </Tooltip>
          {record.status === 'CONNECTED' ? (
            <Tooltip title="View Session Status">
              <Button
                type="default"
                icon={<WifiOutlined />}
                size="small"
                onClick={() => showQRModal(record)}
              />
            </Tooltip>
          ) : (
            <Tooltip
              title={record.status === 'DISCONNECTED' ? 'Reconnect Session' : 'Show QR Code'}
            >
              <Button
                type="primary"
                icon={<QrcodeOutlined />}
                size="small"
                onClick={() => showQRModal(record)}
              >
                {record.status === 'DISCONNECTED' ? 'Reconnect' : ''}
              </Button>
            </Tooltip>
          )}
          {record.status === 'QR' && (
            <Tooltip title="Refresh QR Code">
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={() => handleRefreshQR(record.sessionId)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title="Delete Session"
            description="Are you sure you want to delete this session?"
            onConfirm={() => handleDeleteSession(record.sessionId)}
            okText="Yes"
            cancelText="No"
          >
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container page-header">
          <div>
            <Title level={3} className="mb-0">
              WhatsApp Sessions
            </Title>
            <Text type="secondary">Manage your WhatsApp device connections</Text>
          </div>
          <div className="page-actions">
            <Button icon={<ReloadOutlined />} onClick={loadSessions} loading={loading}>
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
              disabled={connectionStatus !== 'connected'}
            >
              New Session
            </Button>
          </div>
        </div>
      </Header>

      <Content className="py-6">
        <div className="container">
          {connectionStatus !== 'connected' && (
            <Alert
              message="Socket.IO Connection Required"
              description="Real-time features require an active Socket.IO connection. Please check your connection."
              type="warning"
              showIcon
              className="mb-4"
            />
          )}

          <Card>
            <Table
              columns={columns}
              dataSource={sessions}
              rowKey="sessionId"
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `Total ${total} sessions`,
              }}
            />
          </Card>

          {/* Create Session Modal */}
          <Modal
            title="Create New Session"
            open={createModalVisible}
            onCancel={() => {
              setCreateModalVisible(false);
              form.resetFields();
            }}
            footer={null}
          >
            <Form form={form} layout="vertical" onFinish={handleCreateSession}>
              <Form.Item
                name="deviceName"
                label="Device Name"
                rules={[{ max: 50, message: 'Device name must be less than 50 characters' }]}
              >
                <Input placeholder="e.g., My WhatsApp Bot" />
              </Form.Item>

              <Form.Item
                name="webhookUrl"
                label="Webhook URL (Optional)"
                rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
              >
                <Input placeholder="https://your-webhook-url.com/webhook" />
              </Form.Item>

              <Form.Item className="mb-0">
                <Space className="w-full justify-end">
                  <Button
                    onClick={() => {
                      setCreateModalVisible(false);
                      form.resetFields();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="primary" htmlType="submit" loading={createLoading}>
                    Create Session
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Modal>

          {/* QR Code Modal - SIMPLIFIED like working demo */}
          <Modal
            title={`${selectedSession?.status === 'CONNECTED' ? 'Session Status' : 'QR Code'} - ${selectedSession?.deviceInfo?.name || 'Session'}`}
            open={qrModalVisible}
            onCancel={() => {
              setQrModalVisible(false);
              setSelectedSession(null);
            }}
            footer={[
              selectedSession?.status !== 'CONNECTED' && (
                <Button
                  key="refresh"
                  onClick={() => selectedSession && handleRefreshQR(selectedSession.sessionId)}
                >
                  Refresh QR
                </Button>
              ),
              <Button
                key="close"
                type={selectedSession?.status === 'CONNECTED' ? 'primary' : 'default'}
                onClick={() => {
                  setQrModalVisible(false);
                  setSelectedSession(null);
                }}
              >
                {selectedSession?.status === 'CONNECTED' ? 'OK' : 'Close'}
              </Button>,
            ].filter(Boolean)}
            width={400}
          >
            {selectedSession?.status === 'CONNECTED' ? (
              <div className="text-center py-8">
                <div className="mb-4">
                  <WifiOutlined style={{ fontSize: '48px', color: '#52c41a' }} />
                </div>
                <div className="space-y-2">
                  <Title level={4} style={{ color: '#52c41a', margin: 0 }}>
                    WhatsApp Connected!
                  </Title>
                  <Text type="secondary">
                    Your WhatsApp session is active and ready to send messages.
                  </Text>
                  {selectedSession.phone && (
                    <div className="mt-4">
                      <Text strong>
                        <PhoneOutlined /> Connected Phone: {selectedSession.phone}
                      </Text>
                    </div>
                  )}
                  <div className="mt-4">
                    <Text type="secondary">Session ID: {selectedSession.sessionId}</Text>
                  </div>
                </div>
              </div>
            ) : selectedSession?.qrData ? (
              <div className="text-center">
                <div className="mb-4">
                  <img
                    src={selectedSession.qrData}
                    width={256}
                    height={256}
                    alt="WhatsApp QR Code"
                    style={{
                      border: '1px solid #d9d9d9',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Text type="secondary">Scan this QR code with WhatsApp on your phone</Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Open WhatsApp → Settings → Linked Devices → Link a Device
                    </Text>
                  </div>
                  {qrCountdown > 0 && (
                    <div>
                      <Text type={qrCountdown < 60 ? 'danger' : 'warning'}>
                        Expires in: {Math.floor(qrCountdown / 60)}m {qrCountdown % 60}s
                      </Text>
                    </div>
                  )}
                  {selectedSession.qrTries && selectedSession.qrTries > 0 && (
                    <div>
                      <Text type="secondary">Attempt: {selectedSession.qrTries}</Text>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Spin size="large" />
                <div className="mt-4">
                  <Text>Generating QR code...</Text>
                </div>
              </div>
            )}
          </Modal>
        </div>
      </Content>
    </Layout>
  );
};

export default SessionsPage;
