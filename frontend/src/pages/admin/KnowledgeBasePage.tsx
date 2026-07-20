import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Upload, Button, Table, Tag, Space, Typography, Input, Row, Col,
  message, Popconfirm, Result,
} from 'antd';
import {
  UploadOutlined, ReloadOutlined, DeleteOutlined,
  FileTextOutlined, SearchOutlined, LogoutOutlined,
  DashboardOutlined, BookOutlined, SettingOutlined, BarChartOutlined,
} from '@ant-design/icons';
import { adminAPI } from '../../services/api';

const { Title } = Typography;

interface DocItem {
  id: string;
  name: string;
  size: number;
  date: string;
  status: string;
}

export default function KnowledgeBasePage() {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/knowledge/documents', {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (_err) {
      console.error('Failed to load documents:', _err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await adminAPI.uploadDocument(file);
      message.success(`${file.name} 上传成功！正在处理中...`);
      loadDocuments(); // Refresh list
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleRefreshIndex = async () => {
    try {
      await adminAPI.refreshIndex();
      message.success('索引刷新已提交');
      loadDocuments();
    } catch {
      message.error('索引刷新失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/v1/admin/knowledge/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      message.success('文档已删除');
      loadDocuments();
    } catch {
      message.error('删除失败');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/admin/login');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{
        background: '#fff', padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24,
      }}>
        <div style={{ fontSize: 24 }}>🏯</div>
        <Title level={4} style={{ margin: 0 }}>知识库管理</Title>
        <div style={{ flex: 1 }} />
        <Button type="text" icon={<DashboardOutlined />} onClick={() => navigate('/admin/dashboard')}>仪表盘</Button>
        <Button type="text" icon={<BookOutlined />} onClick={() => navigate('/admin/knowledge')}>知识库</Button>
        <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/admin/digital-human')}>数字人</Button>
        <Button type="text" icon={<BarChartOutlined />} onClick={() => navigate('/admin/reports')}>报告</Button>
        <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} danger>退出</Button>
      </div>

      <div style={{ padding: '0 24px' }}>
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card
              title="📁 知识文档管理"
              extra={
                <Space>
                  <Upload beforeUpload={handleUpload} showUploadList={false}>
                    <Button icon={<UploadOutlined />} type="primary" loading={uploading}>
                      上传文档
                    </Button>
                  </Upload>
                  <Button icon={<ReloadOutlined />} onClick={handleRefreshIndex}>
                    重建索引
                  </Button>
                </Space>
              }
              style={{ borderRadius: 12 }}
            >
              <Table
                dataSource={documents}
                loading={loading}
                columns={[
                  { title: '文档名称', dataIndex: 'name', key: 'name',
                    render: (t: string) => <Space><FileTextOutlined /> {t}</Space> },
                  { title: '大小', dataIndex: 'size', key: 'size', width: 100,
                    render: (s: number) => s ? `${(s / 1024).toFixed(1)} KB` : '-' },
                  { title: '状态', dataIndex: 'status', key: 'status', width: 100,
                    render: (s: string) => (
                      <Tag color={s === 'indexed' ? 'green' : s === 'uploaded' ? 'blue' : 'orange'}>
                        {s === 'indexed' ? '已索引' : s === 'uploaded' ? '已上传' : '待处理'}
                      </Tag>
                    ) },
                  { title: '上传日期', dataIndex: 'date', key: 'date', width: 120 },
                  { title: '操作', key: 'action', width: 80,
                    render: (_: any, record: DocItem) => (
                      <Popconfirm title="确定删除此文档？" onConfirm={() => handleDelete(record.id)}>
                        <Button type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ) },
                ]}
                rowKey="id"
                pagination={false}
                locale={{ emptyText: '暂无文档，请上传知识文档' }}
              />
            </Card>
          </Col>

          <Col span={24}>
            <Card title="🔍 RAG 准确性测试" style={{ borderRadius: 12 }}>
              <Space style={{ width: '100%' }} direction="vertical">
                <Input.Search
                  placeholder="输入测试问题，验证知识库检索准确性..."
                  enterButton={<><SearchOutlined /> 测试</>}
                  size="large"
                  loading={testLoading}
                  onSearch={async (v) => {
                    setTestLoading(true);
                    setTestResult(null);
                    try {
                      const token = localStorage.getItem('admin_token');
                      const res = await fetch(`/api/v1/admin/knowledge/test-qa?query=${encodeURIComponent(v)}`, {
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      const data = await res.json();
                      setTestResult(data);
                    } catch {
                      setTestResult({ error: '测试请求失败' });
                    } finally {
                      setTestLoading(false);
                    }
                  }}
                />
                {testResult && !testResult.error && (
                  <Card size="small" style={{ background: '#fafafa', borderRadius: 8 }}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div>
                        <Typography.Text strong>命中结果：</Typography.Text>
                        <Tag color={testResult.retrieved_chunks > 0 ? 'green' : 'red'}>{testResult.retrieved_chunks} 条</Tag>
                      </div>
                      {testResult.results?.map((r: any, i: number) => (
                        <Card key={i} size="small" style={{ borderRadius: 6 }}>
                          <Space direction="vertical" size={4}>
                            <Space>
                              <Tag color="magenta">{r.spot}</Tag>
                              <Tag color="blue">{r.field}</Tag>
                              <Tag>相关度：{r.score}</Tag>
                            </Space>
                            <Typography.Paragraph style={{ margin: 0, fontSize: 13, color: '#555', whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                              {r.text}
                            </Typography.Paragraph>
                          </Space>
                        </Card>
                      ))}
                      {testResult.results?.length === 0 && (
                        <Typography.Text type="secondary">未找到匹配的景点数据</Typography.Text>
                      )}
                    </Space>
                  </Card>
                )}
                {testResult?.error && (
                  <Result status="error" title="测试失败" subTitle={testResult.error} />
                )}
                <Typography.Text type="secondary">
                  输入问题测试 RAG 检索效果 — 查看知识库是否命中相关内容
                </Typography.Text>
              </Space>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}
