import React, { useState, useEffect } from 'react';
import { Layout, Button, Card, Input, message, Typography, Spin, Space, Divider } from 'antd';
import { QrcodeOutlined, SendOutlined, ReloadOutlined } from '@ant-design/icons';
import { useSocket } from '../hooks/useSocket';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

interface SimpleSession {
  sessionId: string;
  status: string;
  qrData?: string;
  phone?: string;
}

const SimpleWhatsAppTest: React.FC = () => {
  const [session, setSession] = useState<SimpleSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const { socket, connectionStatus } = useSocket();

  // Generate a simple session ID
  const generateSessionId = () => {
    return 'test-' + Math.random().toString(36).substr(2, 9);
  };

  // Start WhatsApp session
  const startSession = async () => {
    if (!socket || connectionStatus !== 'connected') {
      message.error('Socket not connected');
      return;
    }

    setLoading(true);
    const sessionId = generateSessionId();

    try {
      // Create simple session
      setSession({
        sessionId,
        status: 'creating',
      });

      // Listen for QR code
      socket.on('whatsapp_qr', (data: { qrCode: string; attempts: number }) => {
        console.log('QR Code received:', data);
        setSession((prev) =>
          prev
            ? {
                ...prev,
                status: 'qr',
                qrData: data.qrCode,
              }
            : null
        );
        setLoading(false);
      });

      // Listen for status changes
      socket.on('whatsapp_status', (data: { status: string }) => {
        console.log('Status change:', data);
        setSession((prev) => {
          if (!prev) return null;

          // Keep QR data even when status changes, unless connected
          const newSession = {
            ...prev,
            status: data.status,
          };

          // Only clear QR data when actually connected
          if (data.status === 'connected') {
            message.success('WhatsApp connected successfully!');
            setLoading(false);
          }

          return newSession;
        });
      });

      // Listen for errors
      socket.on('whatsapp_error', (data: { error: string }) => {
        console.error('WhatsApp error:', data);
        message.error('WhatsApp error: ' + data.error);
        setLoading(false);
      });

      // Start the session (using working setup's event structure)
      socket.emit('connect_whatsapp', { whatsappId: sessionId });
    } catch (error: any) {
      console.error('Failed to start session:', error);
      message.error('Failed to start session: ' + error.message);
      setLoading(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!socket || !session || !messageText.trim() || !phoneNumber.trim()) {
      message.error('Please fill all fields and ensure WhatsApp is connected');
      return;
    }

    setSendingMessage(true);

    try {
      // Format phone number (add country code if needed)
      const formattedPhone = phoneNumber.includes('@') ? phoneNumber : phoneNumber + '@c.us';

      socket.emit('send_whatsapp_message', {
        whatsappId: session.sessionId,
        chatId: formattedPhone,
        message: messageText,
      });

      socket.on('whatsapp_messages_success', (data: any) => {
        console.log('Message sent successfully:', data);
        message.success('Message sent successfully!');
        setMessageText('');
        setSendingMessage(false);
        socket.off('whatsapp_messages_success');
      });

      socket.on('whatsapp_error', (data: { error: string }) => {
        console.error('Message send error:', data);
        message.error('Failed to send message: ' + data.error);
        setSendingMessage(false);
        socket.off('whatsapp_error');
      });
    } catch (error: any) {
      console.error('Failed to send message:', error);
      message.error('Failed to send message: ' + error.message);
      setSendingMessage(false);
    }
  };

  // Refresh QR
  const refreshQR = () => {
    if (session) {
      startSession();
    }
  };

  // Cleanup socket listeners
  useEffect(() => {
    return () => {
      if (socket) {
        socket.off('whatsapp_qr');
        socket.off('whatsapp_status');
        socket.off('whatsapp_error');
        socket.off('whatsapp_messages_success');
      }
    };
  }, [socket]);

  return (
    <Layout className="min-h-screen">
      <Header className="bg-white shadow-sm border-b border-gray-200 px-6">
        <div className="flex items-center justify-between">
          <div>
            <Title level={3} className="mb-0">
              Simple WhatsApp Test
            </Title>
            <Text type="secondary">Test WhatsApp QR generation and message sending</Text>
          </div>
          <Space>
            <Text>Socket: {connectionStatus}</Text>
            {session && <Text>Status: {session.status}</Text>}
          </Space>
        </div>
      </Header>

      <Content className="p-6">
        <div className="max-w-2xl mx-auto">
          {/* Start Session */}
          {!session && (
            <Card>
              <div className="text-center">
                <Title level={4}>Start WhatsApp Session</Title>
                <Text type="secondary" className="block mb-4">
                  Click the button below to generate a QR code for WhatsApp
                </Text>
                <Button
                  type="primary"
                  size="large"
                  icon={<QrcodeOutlined />}
                  onClick={startSession}
                  loading={loading}
                  disabled={connectionStatus !== 'connected'}
                >
                  Generate QR Code
                </Button>
              </div>
            </Card>
          )}

          {/* QR Code Display */}
          {session && session.qrData && session.status !== 'connected' && (
            <Card>
              <div className="text-center">
                <Title level={4}>Scan QR Code</Title>
                <div className="mb-4">
                  <img
                    src={session.qrData}
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
                      message.error('QR Code failed to load');
                    }}
                  />
                </div>
                <Text type="secondary" className="block mb-2">
                  Open WhatsApp on your phone and scan this QR code
                </Text>
                <Text type="warning" className="block mb-4">
                  Session ID: {session.sessionId}
                </Text>
                <Button icon={<ReloadOutlined />} onClick={refreshQR}>
                  Refresh QR
                </Button>
              </div>
            </Card>
          )}

          {/* Loading State */}
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

          {/* Connected State */}
          {session && (session.status === 'connected' || session.status === 'CONNECTED') && (
            <Card>
              <Title level={4}>WhatsApp Connected! 🎉</Title>
              <Text type="success" className="block mb-4">
                Your WhatsApp is now connected. You can send messages.
              </Text>

              <Divider />

              <Title level={5}>Send Test Message</Title>
              <Space direction="vertical" className="w-full">
                <div>
                  <Text strong>Phone Number:</Text>
                  <Input
                    placeholder="Enter phone number (e.g., 1234567890)"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="mt-1"
                  />
                  <Text type="secondary" className="text-xs">
                    Enter phone number without country code or @ symbol
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
                >
                  Send Message
                </Button>
              </Space>
            </Card>
          )}

          {/* Error State */}
          {session && session.status === 'error' && (
            <Card>
              <div className="text-center">
                <Title level={4} type="danger">
                  Connection Failed
                </Title>
                <Text type="secondary" className="block mb-4">
                  Failed to connect to WhatsApp. Please try again.
                </Text>
                <Button type="primary" onClick={() => setSession(null)}>
                  Try Again
                </Button>
              </div>
            </Card>
          )}
        </div>
      </Content>
    </Layout>
  );
};

export default SimpleWhatsAppTest;
