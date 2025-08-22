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
import { useSocket, type QRUpdatePayload } from '../hooks/useSocket';
import api, { sessionsApi, type Session } from '../services/api';
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

  const {
    connectionStatus,
    createSession,
    deleteSession,
    refreshQR,
    onQRUpdate,
    onSessionStateChange,
    onSessionDeleted,
    onError,
  } = useSocket();

  // Load sessions
  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await sessionsApi.list();
      if (response.success && response.data) {
        setSessions(response.data.sessions);
      }
    } catch (error: any) {
      message.error('Failed to load sessions: ' + error.message);
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

  // Show QR modal
  const showQRModal = async (session: SessionWithQR) => {
    try {
      // If session is CONNECTED, show connected message
      if (session.status === 'CONNECTED') {
        setSelectedSession(session);
        setQrModalVisible(true);
        return;
      }

      // For DISCONNECTED sessions, try to reconnect first
      if (session.status === 'DISCONNECTED') {
        message.loading('Reconnecting session...', 2);
        try {
          await api.post(`/sessions/${session.sessionId}/reconnect`);
          // Wait a moment for the session to initialize
          setTimeout(() => {
            showQRModal({ ...session, status: 'PENDING' as SessionWithQR['status'] });
          }, 2000);
          return;
        } catch (reconnectError) {
          console.error('Reconnect failed:', reconnectError);
          // Continue with QR fetch if reconnect fails
        }
      }

      // Try to get existing valid QR code
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
      } else {
        // No valid QR found, try to refresh/generate new one
        message.loading('Generating new QR code...', 1);
        try {
          await handleRefreshQR(session.sessionId);
          // The QR will be received via socket and modal will open automatically
        } catch (refreshError) {
          message.error('Failed to generate QR code');
        }
      }
    } catch (error: any) {
      message.error('Failed to get QR code: ' + error.message);
    }
  };

  // Direct Socket.IO connection test (bypass useSocket hook)
  useEffect(() => {
    console.log('🔌 Setting up DIRECT Socket.IO connection test');
    const { token } = useAuthStore.getState();

    if (token) {
      const socketUrl = (import.meta as any).env?.VITE_SOCKET_URL || 'http://localhost:3001';
      const directSocket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      directSocket.on('connect', () => {
        console.log('🟢 Direct Socket.IO connected:', directSocket.id);
      });

      directSocket.on('qr:update', (data: any) => {
        console.log('🔥 DIRECT QR Update received:', data);

        // Update session with new QR data and auto-open modal
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

          // Auto-open QR modal (always try to open for new QR)
          const session = updatedSessions.find((s) => s.sessionId === data.sessionId);
          if (session && session.qrData) {
            console.log('🚀 Auto-opening QR modal for session:', session.sessionId);
            setSelectedSession(session);
            setQrModalVisible(true);
            message.success('QR Code generated! Scan with WhatsApp.');
          }

          return updatedSessions;
        });
      });

      directSocket.on('session:state', (data: any) => {
        console.log('🔄 DIRECT Session state change:', data);
        setSessions((prev) =>
          prev.map((session) =>
            session.sessionId === data.sessionId
              ? { ...session, status: data.status as SessionWithQR['status'], phone: data.phone }
              : session
          )
        );

        // Auto-close QR modal when session becomes CONNECTED
        if (data.status === 'CONNECTED' && selectedSession?.sessionId === data.sessionId) {
          message.success('WhatsApp connected successfully!');
          setQrModalVisible(false);
          setSelectedSession(null);
        }
      });

      directSocket.on('disconnect', () => {
        console.log('🔴 Direct Socket.IO disconnected');
      });

      return () => {
        console.log('🧹 Cleaning up direct Socket.IO connection');
        directSocket.disconnect();
      };
    }
  }, []); // Remove dependencies to prevent re-creation

  // Original Socket event handlers (keep as backup)
  useEffect(() => {
    console.log('🔌 Setting up Socket.IO event listeners, connection status:', connectionStatus);

    const unsubscribeQR = onQRUpdate((data: QRUpdatePayload) => {
      console.log('🔥 QR Update received:', data); // Debug log

      // Update session with new QR data
      setSessions((prev) =>
        prev.map((session) =>
          session.sessionId === data.sessionId
            ? {
                ...session,
                qrData: data.qrData,
                qrExpiresAt: data.expiresAt,
                qrTries: data.tries,
                remainingTime: data.remainingTime,
                status: 'QR' as SessionWithQR['status'], // Ensure status is set to QR
              }
            : session
        )
      );

      // Auto-open QR modal for new QR codes (if no modal is currently open)
      setSessions((prevSessions) => {
        if (!qrModalVisible) {
          const session = prevSessions.find((s) => s.sessionId === data.sessionId);
          if (session) {
            setSelectedSession({
              ...session,
              qrData: data.qrData,
              qrExpiresAt: data.expiresAt,
              qrTries: data.tries,
              remainingTime: data.remainingTime,
            });
            setQrModalVisible(true);
            message.success('QR Code generated! Scan with WhatsApp.');
          }
        }
        return prevSessions; // Return the same sessions array since we already updated it above
      });

      // Update selected session if QR modal is open
      if (selectedSession && selectedSession.sessionId === data.sessionId) {
        setSelectedSession((prev) =>
          prev
            ? {
                ...prev,
                qrData: data.qrData,
                qrExpiresAt: data.expiresAt,
                qrTries: data.tries,
                remainingTime: data.remainingTime,
              }
            : null
        );
      }
    });

    const unsubscribeState = onSessionStateChange((data: any) => {
      // Update session status
      setSessions((prev) =>
        prev.map((session) =>
          session.sessionId === data.sessionId
            ? { ...session, status: data.status as SessionWithQR['status'], phone: data.phone }
            : session
        )
      );

      // Auto-close QR modal when session becomes CONNECTED
      if (data.status === 'CONNECTED' && selectedSession?.sessionId === data.sessionId) {
        message.success('WhatsApp connected successfully!');
        setQrModalVisible(false);
        setSelectedSession(null);
      }
    });

    const unsubscribeDeleted = onSessionDeleted((data: { sessionId: string }) => {
      // Remove deleted session
      setSessions((prev) => prev.filter((session) => session.sessionId !== data.sessionId));
      if (selectedSession && selectedSession.sessionId === data.sessionId) {
        setQrModalVisible(false);
        setSelectedSession(null);
      }
    });

    const unsubscribeError = onError((error: any) => {
      message.error('Socket error: ' + error.message);
    });

    return () => {
      unsubscribeQR();
      unsubscribeState();
      unsubscribeDeleted();
      unsubscribeError();
    };
  }, [onQRUpdate, onSessionStateChange, onSessionDeleted, onError]);

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
              title={record.status === 'DISCONNECTED' ? 'Reconnect & Show QR' : 'Show QR Code'}
            >
              <Button
                type="primary"
                icon={<QrcodeOutlined />}
                size="small"
                onClick={() => showQRModal(record)}
              />
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
      <Header className="bg-white shadow-sm border-b border-gray-200 px-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={3} className="mb-0">
              WhatsApp Sessions
            </Title>
            <Text type="secondary">Manage your WhatsApp device connections</Text>
          </div>
          <Space>
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
          </Space>
        </div>
      </Header>

      <Content className="p-6">
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

        {/* QR Code Modal */}
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
                    console.error('QR Code image failed to load');
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
                <Text>
                  {selectedSession?.status === 'DISCONNECTED'
                    ? 'Reconnecting session...'
                    : 'Generating QR code...'}
                </Text>
              </div>
            </div>
          )}
        </Modal>
      </Content>
    </Layout>
  );
};

export default SessionsPage;
