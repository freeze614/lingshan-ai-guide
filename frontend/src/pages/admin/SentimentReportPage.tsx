import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Row, Col, Typography, Tag, Button, Radio, Space,
  Progress,
} from 'antd';
import {
  LogoutOutlined, DashboardOutlined, BookOutlined,
  SettingOutlined, BarChartOutlined, SmileOutlined,
  FrownOutlined, MehOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { adminAPI } from '../../services/api';

const { Title, Text } = Typography;

/** Lightweight Markdown → HTML for AI-generated report summaries */
function renderMarkdown(md: string): string {
  if (!md) return '<p style="color:#999">暂无分析数据</p>';
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headings
    .replace(/^#### (.+)$/gm, '<h5 style="margin:16px 0 6px;font-size:14px;color:#555">$1</h5>')
    .replace(/^### (.+)$/gm, '<h4 style="margin:20px 0 8px;font-size:16px;color:#c41d7f">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:24px 0 10px;font-size:18px;color:#a01d5f">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:28px 0 12px;font-size:20px;color:#801a4f">$1</h2>')
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#c41d7f">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered list items
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0 4px 16px">$1</li>')
    .replace(/^  - (.+)$/gm, '<li style="margin:4px 0 4px 32px">$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0 4px 16px">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e8d5e0;margin:16px 0">')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote style="margin:8px 0;padding:8px 16px;background:rgba(196,29,127,0.05);border-left:3px solid #c41d7f;color:#666">$1</blockquote>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:#f5f0f5;padding:1px 6px;border-radius:3px;font-size:13px">$1</code>')
    // Paragraph breaks (double newlines)
    .replace(/\n\n/g, '</p><p style="margin:10px 0">')
    // Single newlines → <br>
    .replace(/\n/g, '<br>');

  // Wrap consecutive <li> in <ul> / <ol>
  html = html.replace(/((?:<li[^>]*>.*?<\/li><br>?)+)/g, (match) => {
    return '<ul style="margin:8px 0;padding:0">' + match.replace(/<br>/g, '') + '</ul>';
  });

  return '<p style="margin:10px 0">' + html + '</p>';
}

export default function SentimentReportPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState<any>(null);

  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setData(null);
    adminAPI.getSentimentReport(period)
      .then(res => setData(res.data))
      .catch(err => {
        console.error(err);
        setError(err?.response?.data?.error || err?.message || '加载失败，请刷新重试');
      });
  }, [period]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/admin/login');
  };

  if (error) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <Text type="danger" style={{ fontSize: 16 }}>{error}</Text>
      <br />
      <Button type="primary" style={{ marginTop: 16, borderRadius: 12 }}
        onClick={() => { setError(''); setData(null); adminAPI.getSentimentReport(period).then(res => setData(res.data)).catch(err => { console.error(err); setError(err?.message || '加载失败'); }); }}>
        重新加载
      </Button>
    </div>
  );

  if (!data) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  const emotionOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['40%', '60%'],
      center: ['50%', '45%'],
      itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{d}%', color: '#333' },
      data: [
        { value: data.sentiment_distribution.positive, name: '正面', itemStyle: { color: '#52c41a' } },
        { value: data.sentiment_distribution.neutral, name: '中性', itemStyle: { color: '#faad14' } },
        { value: data.sentiment_distribution.negative, name: '负面', itemStyle: { color: '#ff4d4f' } },
      ],
    }],
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{
        background: '#fff', padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24,
      }}>
        <div style={{ fontSize: 24 }}>🏯</div>
        <Title level={4} style={{ margin: 0 }}>游客感受度报告</Title>
        <div style={{ flex: 1 }} />
        <Button type="text" icon={<DashboardOutlined />} onClick={() => navigate('/admin/dashboard')}>仪表盘</Button>
        <Button type="text" icon={<BookOutlined />} onClick={() => navigate('/admin/knowledge')}>知识库</Button>
        <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/admin/digital-human')}>数字人</Button>
        <Button type="text" icon={<BarChartOutlined />} onClick={() => navigate('/admin/reports')}>报告</Button>
        <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} danger>退出</Button>
      </div>

      <div style={{ padding: '0 24px' }}>
        {/* Period selector */}
        <Card style={{ borderRadius: 12, marginBottom: 16 }}>
          <Space>
            <Text strong>统计周期：</Text>
            <Radio.Group value={period} onChange={e => setPeriod(e.target.value)}>
              <Radio.Button value="day">今日</Radio.Button>
              <Radio.Button value="week">本周</Radio.Button>
              <Radio.Button value="month">本月</Radio.Button>
            </Radio.Group>
          </Space>
        </Card>

        <Row gutter={[16, 16]}>
          {/* Sentiment Distribution */}
          <Col xs={24} md={12}>
            <Card title="😊 情感分布" style={{ borderRadius: 12 }}>
              <ReactECharts option={emotionOption} style={{ height: 320 }} />
            </Card>
          </Col>

          {/* Summary Stats */}
          <Col xs={24} md={12}>
            <Card title="📋 数据概览" style={{ borderRadius: 12 }}>
              <Row gutter={[16, 24]}>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">总咨询量</Text>
                    <div style={{ fontSize: 36, fontWeight: 700, color: '#c41d7f' }}>
                      {data.total_queries.toLocaleString()}
                    </div>
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <Text type="secondary">平均情感指数</Text>
                    <div style={{ fontSize: 36, fontWeight: 700, color: '#52c41a' }}>
                      {(data.avg_sentiment).toFixed(1)}%
                    </div>
                  </div>
                </Col>
              </Row>
              <div style={{ marginTop: 16 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Space><SmileOutlined style={{ color: '#52c41a' }} /> 正面</Space>
                    <Text>{data.sentiment_distribution.positive}%</Text>
                  </div>
                  <Progress percent={data.sentiment_distribution.positive} showInfo={false}
                    strokeColor="#52c41a" />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Space><MehOutlined style={{ color: '#faad14' }} /> 中性</Space>
                    <Text>{data.sentiment_distribution.neutral}%</Text>
                  </div>
                  <Progress percent={data.sentiment_distribution.neutral} showInfo={false}
                    strokeColor="#faad14" />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Space><FrownOutlined style={{ color: '#ff4d4f' }} /> 负面</Space>
                    <Text>{data.sentiment_distribution.negative}%</Text>
                  </div>
                  <Progress percent={data.sentiment_distribution.negative} showInfo={false}
                    strokeColor="#ff4d4f" />
                </Space>
              </div>
            </Card>
          </Col>

          {/* Hot Questions */}
          <Col xs={24} md={12}>
            <Card title="🔥 热门话题" style={{ borderRadius: 12 }}>
              {data.hot_questions.map((q: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: i < data.hot_questions.length - 1 ? '1px solid #f0f0f0' : 'none',
                }}>
                  <Space>
                    <Tag color={i < 3 ? 'red' : 'default'}>{i + 1}</Tag>
                    <Text>{q.question}</Text>
                  </Space>
                  <Tag color="blue">{q.count}次</Tag>
                </div>
              ))}
            </Card>
          </Col>

          {/* Attraction Mentions */}
          <Col xs={24} md={12}>
            <Card title="🏛️ 景点关注度" style={{ borderRadius: 12 }}>
              {data.top_spots.map((spot: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: i < data.top_spots.length - 1 ? '1px solid #f0f0f0' : 'none',
                }}>
                  <Space>
                    <Tag color="magenta">{i + 1}</Tag>
                    <Text>📍 {spot.name}</Text>
                  </Space>
                  <Text type="secondary">提及 {spot.mention_count} 次</Text>
                </div>
              ))}
            </Card>
          </Col>

          {/* AI Summary */}
          <Col span={24}>
            <Card title="📝 AI 分析总结" style={{ borderRadius: 12 }}>
              <div style={{
                padding: 24,
                background: 'linear-gradient(135deg, #fdf2f8, #f8f4ff)',
                borderRadius: 12,
                border: '1px solid #f0f0f0',
                fontSize: 15,
                lineHeight: 2,
                color: '#333',
              }}
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(data.summary || ''),
                }}
              />
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}
