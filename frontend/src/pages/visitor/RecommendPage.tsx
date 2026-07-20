import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography, Card, Tag, Row, Col, Steps } from 'antd';
import {
  HistoryOutlined, EnvironmentOutlined, HomeOutlined,
  HeartOutlined, BuildOutlined, StarOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { visitorAPI } from '../../services/api';

const { Title, Paragraph, Text } = Typography;

const interests = [
  { key: '历史', icon: <HistoryOutlined />, label: '历史文化', desc: '千年佛教传承' },
  { key: '文化', icon: <StarOutlined />, label: '佛教文化', desc: '深度文化体验' },
  { key: '自然', icon: <EnvironmentOutlined />, label: '自然风光', desc: '太湖山水美景' },
  { key: '建筑', icon: <BuildOutlined />, label: '建筑艺术', desc: '佛教建筑杰作' },
  { key: '祈福', icon: <HeartOutlined />, label: '祈福体验', desc: '吉祥平安之旅' },
];

export default function RecommendPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [duration, setDuration] = useState(4);
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState<any>(null);

  const toggleInterest = (key: string) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleRecommend = async () => {
    setLoading(true);
    try {
      const res = await visitorAPI.recommend(selected, duration);
      setRoute(res.data);
    } catch (err) {
      console.error('Recommend error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #c41d7f 0%, #e91e63 100%)',
        padding: '20px',
        textAlign: 'center',
        color: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <Button type="text" icon={<HomeOutlined />} onClick={() => navigate('/')}
          style={{ color: '#fff', position: 'absolute', left: 16, top: 20 }} />
        <Title level={3} style={{ color: '#fff', margin: 0 }}>🗺️ 个性化游览推荐</Title>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px' }}>
        {/* Interest Selection */}
        <Card
          title="选择您的兴趣偏好"
          style={{ borderRadius: 16, marginBottom: 20, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
        >
          <Row gutter={[12, 12]}>
            {interests.map(item => (
              <Col xs={12} sm={8} md={8} lg={8} key={item.key}>
                <Card
                  hoverable
                  onClick={() => toggleInterest(item.key)}
                  style={{
                    borderRadius: 12,
                    textAlign: 'center',
                    border: selected.includes(item.key) ? '2px solid #c41d7f' : '1px solid #f0f0f0',
                    background: selected.includes(item.key) ? '#fdf2f8' : '#fff',
                    transition: 'all 0.3s',
                  }}
                >
                  <div style={{ fontSize: 28, color: '#c41d7f', marginBottom: 8 }}>{item.icon}</div>
                  <div style={{ fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: '#999' }}>{item.desc}</div>
                </Card>
              </Col>
            ))}
          </Row>

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Text>预计游览时长：</Text>
            {[3, 4, 5, 6].map(h => (
              <Tag
                key={h}
                color={duration === h ? 'magenta' : 'default'}
                style={{ cursor: 'pointer', margin: '0 4px', padding: '4px 16px', borderRadius: 16 }}
                onClick={() => setDuration(h)}
              >
                <ClockCircleOutlined /> {h} 小时
              </Tag>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Button
              type="primary"
              size="large"
              onClick={handleRecommend}
              loading={loading}
              disabled={selected.length === 0}
              style={{
                background: 'linear-gradient(135deg, #c41d7f, #e91e63)',
                border: 'none',
                height: 48,
                borderRadius: 24,
                paddingInline: 40,
              }}
            >
              生成推荐路线
            </Button>
          </div>
        </Card>

        {/* Route Result */}
        {route && (
          <Card
            title="✨ 推荐路线"
            style={{ borderRadius: 16, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
            className="fade-in"
          >
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fdf2f8', borderRadius: 12 }}>
              <Text strong>总游览时长：{route.total_duration} 分钟</Text>
              <br />
              <Text type="secondary">{route.tips}</Text>
            </div>

            <Steps
              direction="vertical"
              current={-1}
              items={route.route.map((item: any, i: number) => ({
                title: <Text strong>{item.name}</Text>,
                description: (
                  <div>
                    <Paragraph type="secondary" style={{ marginBottom: 4 }}>{item.reason}</Paragraph>
                    <Tag color="magenta" style={{ borderRadius: 12 }}>⏱️ {item.visit_duration}分钟</Tag>
                    <Tag
                      color="blue"
                      style={{ borderRadius: 12, cursor: 'pointer' }}
                      onClick={() => navigate(`/qa?q=${encodeURIComponent(item.name)}`)}
                    >
                      💬 了解更多
                    </Tag>
                  </div>
                ),
                icon: <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #c41d7f, #e91e63)',
                  color: '#fff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 12, fontWeight: 700,
                }}>
                  {i + 1}
                </div>,
              }))}
            />

            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <Button
                type="primary"
                onClick={() => navigate('/qa')}
                style={{
                  background: 'linear-gradient(135deg, #c41d7f, #e91e63)',
                  border: 'none',
                  borderRadius: 20,
                }}
              >
                开始游览，了解更多景点详情
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
