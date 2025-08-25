import React, { useState, useEffect } from 'react';
import {
  Layout,
  Button,
  Card,
  Input,
  message,
  Typography,
  Spin,
  Space,
  Divider,
  Form,
  Row,
  Col,
} from 'antd';
import { QrcodeOutlined, SendOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useSocket } from '../hooks/useSocket';
import { api } from '../services/api';

const { Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

interface SimpleSession {
  id: string;
  sessionId: string;
  status: string;
  phone?: string;
  deviceInfo?: { name: string; platform: string; version: string };
  metadata?: any;
  config?: any;
  createdAt: string;
  updatedAt: string;
}

interface QRData {
  qrData: string;
  expiresAt: string;
  attempts: number;
}

const SimpleWhatsAppTest: React.FC = () => {
  const [session, setSession] = useState<SimpleSession | null>(null);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [form] = Form.useForm();
  const [orgConfig, setOrgConfig] = useState({
    deviceName: 'Simple WhatsApp Test',
    metadata: { organizationId: '', department: '', contactPerson: '' },
    config: { autoReply: false, businessHours: '9-17', timezone: 'UTC' },
  });
  const { socket, connectionStatus } = useSocket();

  const startSession = async () => {
    setLoading(true);
    try {
      const response = await api.post('/sessions', {
        deviceName: orgConfig.deviceName,
        metadata: orgConfig.metadata,
        config: orgConfig.config,
      });
      const newSession = response.data.data.session;
      setSession(newSession);
      message.success('Session created! Generating QR code...');
      await getQRCode(newSession.sessionId);
    } catch (error: any) {
      message.error(
        'Failed to start session: ' + (error.response?.data?.error?.message || error.message)
      );
      setLoading(false);
    }
  };

  const getQRCode = async (sessionId: string) => {
    try {
      const response = await api.get(`/sessions/${sessionId}/qr`);
      setQrData(response.data);
      setLoading(false);
    } catch (error: any) {
      message.error(
        'Failed to get QR code: ' + (error.response?.data?.error?.message || error.message)
      );
      setLoading(false);
    }
  };

  const checkSessionStatus = async (sessionId: string) => {
    try {
      const response = await api.get(`/sessions/${sessionId}`);
      const updated = response.data.data.session;
      setSession(updated);
      if (updated.status === 'CONNECTED' && updated.phone) {
        message.success(`WhatsApp connected! Phone: ${updated.phone}`);
        setQrData(null);
      }
    } catch {}
  };

  const sendMessage = async () => {
    if (!session || !messageText.trim() || !phoneNumber.trim()) {
      message.error('Please fill all fields and ensure WhatsApp is connected');
      return;
    }
    if (session.status !== 'CONNECTED') {
      message.error('WhatsApp is not connected. Please scan the QR code first.');
      return;
    }
    setSendingMessage(true);
    try {
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;
      await api.post('/messages/send', {
        sessionId: session.sessionId,
        to: formattedPhone,
        type: 'text',
        content: messageText,
      });
      message.success('Message sent successfully!');
      setMessageText('');
    } catch (error: any) {
      message.error(
        'Failed to send message: ' + (error.response?.data?.error?.message || error.message)
      );
    } finally {
      setSendingMessage(false);
    }
  };

  const refreshQR = async () => {
    if (!session) return;
    setLoading(true);
    try {
      await api.post(`/sessions/${session.sessionId}/refresh-qr`);
      message.success('QR code refresh requested');
      setTimeout(() => {
        getQRCode(session.sessionId);
      }, 2000);
    } catch (error: any) {
      message.error(
        'Failed to refresh QR: ' + (error.response?.data?.error?.message || error.message)
      );
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!socket || !session) return;
    const handleQRUpdate = (data: any) => {
      if (data.sessionId === session.sessionId) {
        setQrData({
          qrData: data.qrData,
          expiresAt: data.expiresAt,
          attempts: data.tries || data.attempts || 1,
        });
        setLoading(false);
      }
    };
    const handleSessionState = (data: any) => {
      if (data.sessionId === session.sessionId) {
        setSession((prev) => (prev ? { ...prev, status: data.status, phone: data.phone } : null));
        if (data.status === 'CONNECTED') {
          message.success(`WhatsApp connected! Phone: ${data.phone || 'Unknown'}`);
          setQrData(null);
        }
      }
    };
    socket.on('qr:update', handleQRUpdate);
    socket.on('session:state', handleSessionState);
    return () => {
      socket.off('qr:update', handleQRUpdate);
      socket.off('session:state', handleSessionState);
    };
  }, [socket, session]);

  useEffect(() => {
    if (!session || session.status === 'CONNECTED') return;
    const i = setInterval(() => {
      checkSessionStatus(session.sessionId);
    }, 5000);
    return () => clearInterval(i);
  }, [session]);

  return (
    <Layout>
      <Content className="py-6">
        <div className="container">
          <div className="page-header">
            <div>
              <Title level={3} className="mb-0">
                Simple WhatsApp Test
              </Title>
              <Text type="secondary">
                Test WhatsApp integration with live API and organization config
              </Text>
            </div>
            <Text>Socket: {connectionStatus}</Text>
          </div>

          <div className="max-w-2xl mx-auto">
            {!session && (
              <Card>
                <div className="text-center mb-6">
                  <Title level={4}>Start WhatsApp Session</Title>
                  <Text type="secondary" className="block mb-4">
                    Configure your session and generate a QR code for WhatsApp
                  </Text>
                </div>

                <Form
                  form={form}
                  layout="vertical"
                  initialValues={orgConfig}
                  onValuesChange={(_, values) => setOrgConfig(values)}
                >
                  <Row gutter={16}>
                    <Col span={24}>
                      <Form.Item
                        name="deviceName"
                        label="Device Name"
                        rules={[{ required: true, message: 'Please enter device name' }]}
                      >
                        <Input placeholder="Enter device name (e.g., My WhatsApp Bot)" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>

                <Button
                  type="link"
                  icon={<SettingOutlined />}
                  onClick={() => setShowConfig(!showConfig)}
                  className="mb-4"
                >
                  {showConfig ? 'Hide' : 'Show'} Organization Details
                </Button>

                {showConfig && (
                  <>
                    <Divider>Organization Details</Divider>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name={['metadata', 'organizationId']} label="Organization ID">
                          <Input placeholder="org-12345" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name={['metadata', 'department']} label="Department">
                          <Input placeholder="Sales, Support, etc." />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={24}>
                        <Form.Item name={['metadata', 'contactPerson']} label="Contact Person">
                          <Input placeholder="john@company.com" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Divider>Configuration</Divider>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name={['config', 'businessHours']} label="Business Hours">
                          <Input placeholder="9-17" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name={['config', 'timezone']} label="Timezone">
                          <Input placeholder="America/New_York" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </>
                )}

                <div className="text-center mt-6">
                  <Button
                    type="primary"
                    size="large"
                    icon={<QrcodeOutlined />}
                    onClick={startSession}
                    loading={loading}
                  >
                    Create Session & Generate QR Code
                  </Button>
                </div>
              </Card>
            )}

            {session && qrData && session.status !== 'CONNECTED' && (
              <Card>
                <div className="text-center">
                  <Title level={4}>Scan QR Code</Title>
                  <div className="mb-4">
                    <img
                      src={qrData.qrData}
                      width={256}
                      height={256}
                      alt="WhatsApp QR Code"
                      style={{
                        border: '1px solid #d9d9d9',
                        borderRadius: '8px',
                        backgroundColor: 'white',
                      }}
                    />
                  </div>
                  <Text type="secondary" className="block mb-2">
                    Open WhatsApp on your phone and scan this QR code
                  </Text>
                  <Text type="warning" className="block mb-2">
                    Attempt: {qrData.attempts}
                  </Text>
                  <Text type="secondary" className="block mb-4">
                    Expires: {new Date(qrData.expiresAt).toLocaleTimeString()}
                  </Text>
                  <Button icon={<ReloadOutlined />} onClick={refreshQR} loading={loading}>
                    Refresh QR
                  </Button>
                </div>
              </Card>
            )}

            {loading && (
              <Card>
                <div className="text-center py-8">
                  <Spin size="large" />
                  <div className="mt-4">
                    <Text>Generating QR code...</Text>
                  </div>
                </div>
              </Card>
            )}

            {session && session.status === 'CONNECTED' && (
              <Card>
                <Title level={4}>WhatsApp Connected! 🎉</Title>
                <Text type="success" className="block mb-2">
                  Your WhatsApp is now connected and ready to send messages.
                </Text>
                {session.phone && (
                  <Text strong className="block mb-4" style={{ color: '#52c41a' }}>
                    Connected Phone: {session.phone}
                  </Text>
                )}
                <Divider />
                <Title level={5}>Send Test Message</Title>
                <Space direction="vertical" className="w-full">
                  <div>
                    <Text strong>Recipient Phone Number:</Text>
                    <Input
                      placeholder="Enter phone number with country code (e.g., +1234567890)"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="mt-1"
                      addonBefore="+"
                    />
                    <Text type="secondary" className="text-xs">
                      Enter phone number with country code (without + sign)
                    </Text>
                  </div>
                  <div>
                    <Text strong>Message:</Text>
                    <TextArea
                      placeholder="Enter your message here..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={sendMessage}
                    loading={sendingMessage}
                    disabled={!messageText.trim() || !phoneNumber.trim()}
                    size="large"
                  >
                    Send Message
                  </Button>
                </Space>
              </Card>
            )}

            {session && (
              <Card className="mt-4">
                <div className="text-center">
                  <Button
                    danger
                    onClick={() => {
                      setSession(null);
                      setQrData(null);
                      setMessageText('');
                      setPhoneNumber('');
                    }}
                  >
                    Reset Session
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </Content>
    </Layout>
  );
};

export default SimpleWhatsAppTest;
