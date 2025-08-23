import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

const { Title, Text, Link } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

const LoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuthStore();

  const handleLogin = async (values: LoginForm) => {
    setIsLoading(true);
    setError(null);

    try {
      await login(values.email, values.password);
      toast.success('Login successful!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="max-w-md w-full">
        <Card className="shadow-lg border-0">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailOutlined className="text-2xl text-white" />
            </div>
            <Title level={2} className="mb-2">
              Welcome Back
            </Title>
            <Text type="secondary">Sign in to your WhatsApp Integration account</Text>
          </div>

          {error && (
            <Alert
              message="Login Failed"
              description={error}
              type="error"
              showIcon
              className="mb-6"
              closable
              onClose={() => setError(null)}
            />
          )}

          <Form
            form={form}
            name="login"
            onFinish={handleLogin}
            layout="vertical"
            size="large"
            autoComplete="off"
          >
            <Form.Item
              name="email"
              label="Email Address"
              rules={[
                { required: true, message: 'Please enter your email address' },
                { type: 'email', message: 'Please enter a valid email address' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Enter your email"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: 'Please enter your password' },
                { min: 6, message: 'Password must be at least 6 characters' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item className="mb-6">
              <Button
                type="primary"
                htmlType="submit"
                loading={isLoading}
                block
                size="large"
                className="h-12"
              >
                {isLoading ? 'Signing In...' : 'Sign In'}
              </Button>
            </Form.Item>
          </Form>

          <div className="text-center mt-6 pt-6 border-t border-gray-100">
            <Text type="secondary" className="text-sm">
              Don't have an account?{' '}
              <Link href="#" className="font-medium">
                Contact Administrator
              </Link>
            </Text>
          </div>
        </Card>

        <div className="text-center mt-6">
          <Text type="secondary" className="text-xs">
            WhatsApp Integration Service v1.0.0
          </Text>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
