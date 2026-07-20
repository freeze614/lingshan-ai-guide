import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { adminAPI } from '../../services/api';

const { Title } = Typography;

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await adminAPI.login(values.username, values.password);
      localStorage.setItem('admin_token', res.data.access_token);
      localStorage.setItem('admin_user', JSON.stringify(res.data));
      message.success('登录成功！');
      navigate('/admin/dashboard');
    } catch (err: any) {
      message.error(err.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #c41d7f 0%, #e91e63 60%, #f8f4ff 100%)',
    }}>
      <Card style={{
        width: 400,
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏯</div>
          <Title level={3} style={{ margin: 0 }}>管理后台登录</Title>
          <p style={{ color: '#999', marginTop: 8 }}>灵山胜境 AI 数字人导游系统</p>
        </div>

        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                background: 'linear-gradient(135deg, #c41d7f, #e91e63)',
                border: 'none',
                height: 44,
                borderRadius: 8,
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Button type="link" onClick={() => navigate('/')}>返回游客端</Button>
        </div>
      </Card>
    </div>
  );
}
