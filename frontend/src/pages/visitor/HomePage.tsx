import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Typography, Card, Row, Col, Tag, Button } from 'antd';
import {
  MessageOutlined, CompassOutlined, SoundOutlined,
  SmileOutlined, EnvironmentOutlined, RobotOutlined,
  ThunderboltOutlined, StarFilled, SettingOutlined,
  AimOutlined, LoadingOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const SPOT_CARDS = [
  { name: '灵山大佛', desc: '88米世界最高青铜立佛', icon: < img src="/lingshan_dafo.jpg" style={{width:"48px",height:"48px",objectFit:"cover"}} />, color: '#c41d7f' },
  { name: '九龙灌浴', desc: '花开见佛的震撼演出', icon: < img src="/jiulong_guanyu.jpg" style={{width:"48px",height:"48px",objectFit:"cover"}} />, color: '#1890ff' },
  { name: '灵山梵宫', desc: '东方卢浮宫艺术殿堂', icon: < img src="/lingshan_fangong.jpg" style={{width:"48px",height:"48px",objectFit:"cover"}} />, color: '#d4a853' },
  { name: '五印坛城', desc: '藏传佛教文化瑰宝', icon: < img src="/wuyin_tancheng.jpg" style={{width:"48px",height:"48px",objectFit:"cover"}} />, color: '#e91e63' },
  { name: '祥符禅寺', desc: '千年古刹历史遗存', icon: < img src="/xiangfu_temple.jpg" style={{width:"48px",height:"48px",objectFit:"cover"}} />, color: '#722ed1' },
  { name: '拈花湾', desc: '禅意小镇慢生活', icon: < img src="/nianhua_wan.jpg" style={{width:"48px",height:"48px",objectFit:"cover"}} />, color: '#eb2f96' },
];

const HOT_QUESTIONS = [
  { q: '灵山大佛有多高？', icon: '📏' },
  { q: '门票价格是多少？', icon: '🎫' },
  { q: '九龙灌浴表演时间？', icon: '⏰' },
  { q: '游览路线推荐？', icon: '🗺️' },
  { q: '梵宫有什么好看的？', icon: '✨' },
  { q: '灵山的历史渊源？', icon: '📜' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [heroVisible, setHeroVisible] = useState(false);
  const [locating, setLocating] = useState(false);
  const [nearbySpots, setNearbySpots] = useState<any[] | null>(null);
  const [geoError, setGeoError] = useState('');
  const [activeCategory, setActiveCategory] = useState('spots');
  const [facilities, setFacilities] = useState<any[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);

  useEffect(() => { setHeroVisible(true); }, []);

  const ALL_SPOTS_WITH_COORDS = [
    { name: '灵山大佛', lat: 31.42, lng: 120.10, desc: '88米世界最高青铜立佛，登顶抱佛脚俯瞰太湖', icon: '🗿' },
    { name: '九龙灌浴', lat: 31.41, lng: 120.10, desc: '大型音乐群雕，花开见佛九龙吐水', icon: '🌊' },
    { name: '灵山梵宫', lat: 31.42, lng: 120.10, desc: '东方卢浮宫，佛教艺术殿堂', icon: '🏛️' },
    { name: '五印坛城', lat: 31.42, lng: 120.11, desc: '藏传佛教风格，有小布达拉宫之称', icon: '🏰' },
    { name: '祥符禅寺', lat: 31.42, lng: 120.10, desc: '唐代千年古刹，灵山佛教文化发源地', icon: '🛕' },
    { name: '拈花湾', lat: 31.40, lng: 120.08, desc: '禅意小镇，慢生活体验', icon: '🌸' },
    { name: '灵山大照壁', lat: 31.41, lng: 120.09, desc: '华夏第一壁，赵朴初题字', icon: '🪨' },
    { name: '菩提大道', lat: 31.41, lng: 120.10, desc: '250米印度菩提树拱廊，禅意漫步', icon: '🌳' },
    { name: '百子戏弥勒', lat: 31.42, lng: 120.10, desc: '青铜群雕，摸弥勒肚皮享福气', icon: '👶' },
    { name: '曼飞龙塔', lat: 31.42, lng: 120.11, desc: '复刻西双版纳白塔，异域风情', icon: '🗼' },
    { name: '无尽意斋', lat: 31.42, lng: 120.10, desc: '赵朴初先生纪念馆，禅茶品鉴', icon: '🍵' },
    { name: '佛足坛', lat: 31.41, lng: 120.10, desc: '青铜巨型佛足印，触摸祈福', icon: '🦶' },
    { name: '五智门', lat: 31.41, lng: 120.10, desc: '汉白玉牌坊，五门象征五方五佛', icon: '⛩️' },
    { name: '降魔浮雕', lat: 31.41, lng: 120.10, desc: '巨型石雕，再现佛陀降魔成道', icon: '🗿' },
    { name: '阿育王柱', lat: 31.41, lng: 120.10, desc: '整块花岗岩雕刻，重180吨', icon: '🪨' },
    { name: '梵天花海', lat: 31.40, lng: 120.08, desc: '30000㎡四季花海，拍照圣地', icon: '🌺' },
    { name: '香月花街', lat: 31.40, lng: 120.08, desc: '800米禅意商业街，非遗手作', icon: '🏮' },
    { name: '五灯湖', lat: 31.40, lng: 120.08, desc: '小镇最大水景，夜间灯光秀', icon: '💡' },
    { name: '鹿鸣谷', lat: 31.40, lng: 120.09, desc: '山林幽静区，听鹿鸣山涧', icon: '🦌' },
    { name: '佛教文化博览馆', lat: 31.42, lng: 120.10, desc: '大佛座基内万佛殿，免费讲解', icon: '🏯' },
    { name: '拈花广场', lat: 31.40, lng: 120.08, desc: '拈花湾入口，禅意开园仪式', icon: '🌸' },
  ];

  function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const handleLocate = () => {
    setLocating(true);
    setGeoError('');
    setNearbySpots(null);

    if (!navigator.geolocation) {
      setGeoError('您的浏览器不支持定位，请手动选择景点。');
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const sorted = ALL_SPOTS_WITH_COORDS
          .map(s => ({ ...s, distance: haversineM(latitude, longitude, s.lat, s.lng) }))
          .sort((a, b) => a.distance - b.distance);
        setNearbySpots(sorted);
        setLocating(false);
      },
      (err) => {
        setGeoError(err.code === 1 ? '定位被拒绝，请允许浏览器访问位置。' : '定位失败，请检查网络后重试。');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const fetchFacilities = async (type: string) => {
    setActiveCategory(type);
    if (type === 'spots') return;
    setFacilitiesLoading(true);
    try {
      const res = await fetch(`/api/v1/visitor/nearby-facilities?type=${type}`);
      const data = await res.json();
      setFacilities(data.facilities || []);
    } catch {
      setFacilities([]);
    } finally {
      setFacilitiesLoading(false);
    }
  };

  const CATEGORIES = [
    { key: 'spots', label: '景点', icon: '🏛️' },
    { key: 'toilet', label: '厕所', icon: '🚻' },
    { key: 'shop', label: '商店', icon: '🛒' },
    { key: 'nursery', label: '母婴室', icon: '🍼' },
    { key: 'entrance', label: '出入口', icon: '🚪' },
    { key: 'visitor_center', label: '游客中心', icon: '🏢' },
    { key: 'ticket', label: '售票处', icon: '🎫' },
    { key: 'hotel', label: '住宿', icon: '🏨' },
    { key: 'rest', label: '休息区', icon: '🪑' },
    { key: 'sightseeing', label: '观光车站', icon: '🚌' },
  ];

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="hero-particles">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="hero-particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 4}s`,
              }}
            />
          ))}
        </div>

        <div className={`hero-content ${heroVisible ? 'visible' : ''}`}>
          <div className="hero-badge">
            <StarFilled style={{ color: '#FFD700', marginRight: 6 }} />
            国家 5A 级旅游景区
          </div>
          <div className="hero-icon">🏯</div>
          <Title level={1} className="hero-title">
            灵山胜境
          </Title>
          <Title level={2} className="hero-subtitle">
            AI 数字人导游
          </Title>
          <Paragraph className="hero-desc">
            7×24 小时在线 · 智能问答 · 语音交互 · 情感陪伴<br/>
            为您带来前所未有的沉浸式灵山之旅
          </Paragraph>
          <div className="hero-actions">
            <Button
              size="large"
              className="hero-btn primary"
              onClick={() => navigate('/qa')}
            >
              <MessageOutlined /> 开始对话
            </Button>
            <Button
              size="large"
              className="hero-btn secondary"
              onClick={() => navigate('/recommend')}
            >
              <CompassOutlined /> 智能推荐
            </Button>
          </div>
        </div>

        <div className="scroll-hint">
          <div className="scroll-arrow" />
        </div>
      </section>

      <section className="home-section">
        <div className="section-header">
          <RobotOutlined className="section-icon" />
          <Title level={3}>核心能力</Title>
          <Paragraph type="secondary">多模态 AI 数字人，让游览更智能</Paragraph>
        </div>
        <Row gutter={[16, 16]}>
          {[
            { icon: <MessageOutlined />, title: '智能问答', desc: '基于景区知识库的精准回答，覆盖历史、文化、实用信息等各类问题', color: '#c41d7f' },
            { icon: <SoundOutlined />, title: '多模态交互', desc: '支持语音输入和文本输入，数字人以语音、表情、口型同步方式回应', color: '#1890ff' },
            { icon: <CompassOutlined />, title: '个性化推荐', desc: '根据兴趣偏好智能推荐最佳游览路线和讲解重点', color: '#52c41a' },
            { icon: <SmileOutlined />, title: '情感互动', desc: 'AI导游具有丰富的情感表达，提供亲切温暖的陪伴体验', color: '#fa8c16' },
          ].map((f, i) => (
            <Col xs={24} sm={12} md={6} key={i}>
              <Card className="feature-card" hoverable>
                <div className="feature-icon" style={{ color: f.color }}>{f.icon}</div>
                <Title level={5}>{f.title}</Title>
                <Paragraph type="secondary">{f.desc}</Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      <section className="home-section alt-bg">
        <div className="section-header">
          <EnvironmentOutlined className="section-icon" />
          <Title level={3}>核心景点</Title>
          <Paragraph type="secondary">22 个精品景点，等您来探索</Paragraph>
        </div>
        <Row gutter={[12, 12]}>
          {SPOT_CARDS.map((spot, i) => (
            <Col xs={12} sm={8} md={4} key={i}>
              <Card
                className="spot-card"
                hoverable
                onClick={() => navigate(`/qa?q=${encodeURIComponent(spot.name)}`)}
              >
                <div className="spot-emoji">{spot.icon}</div>
                <div className="spot-name">{spot.name}</div>
                <div className="spot-desc">{spot.desc}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      <section className="home-section">
        <div className="section-header">
          <ThunderboltOutlined className="section-icon" />
          <Title level={3}>大家都在问</Title>
        </div>
        <div className="hot-questions-grid">
          {HOT_QUESTIONS.map((item, i) => (
            <Tag
              key={i}
              className="hot-q-tag"
              onClick={() => navigate(`/qa?q=${encodeURIComponent(item.q)}`)}
            >
              {item.icon} {item.q}
            </Tag>
          ))}
        </div>
      </section>

      <section className="home-section alt-bg">
        <div className="section-header">
          <AimOutlined className="section-icon" />
          <Title level={3}>📍 附近景点</Title>
          <Paragraph type="secondary">开启定位，发现您身边的灵山美景</Paragraph>
        </div>

        {!nearbySpots && !geoError && (
          <div style={{ textAlign: 'center' }}>
            <Button
              size="large"
              icon={locating ? <LoadingOutlined /> : <AimOutlined />}
              onClick={handleLocate}
              loading={locating}
              style={{
                height: 48, borderRadius: 24, paddingInline: 32,
                background: 'linear-gradient(135deg, #c41d7f, #e91e63)',
                border: 'none', color: '#fff', fontSize: 15,
              }}
            >
              {locating ? '正在定位...' : '查找附近景点'}
            </Button>
          </div>
        )}

        {geoError && (
          <div style={{ textAlign: 'center' }}>
            <Paragraph type="secondary" style={{ fontSize: 13 }}>⚠️ {geoError}</Paragraph>
            <Button icon={<AimOutlined />} onClick={handleLocate} loading={locating} style={{ borderRadius: 16, marginTop: 8 }}>
              重试定位
            </Button>
          </div>
        )}

        {nearbySpots && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
              {CATEGORIES.map(cat => (
                <Tag key={cat.key}
                  style={{
                    cursor: 'pointer', padding: '4px 16px', borderRadius: 20,
                    fontSize: 14, border: activeCategory === cat.key ? '2px solid #c41d7f' : '1px solid #d9d9d9',
                    background: activeCategory === cat.key ? '#fdf2f8' : '#fff',
                    color: activeCategory === cat.key ? '#c41d7f' : '#333',
                  }}
                  onClick={() => { setActiveCategory(cat.key); if (cat.key !== 'spots') fetchFacilities(cat.key); }}
                >
                  {cat.icon} {cat.label}
                </Tag>
              ))}
            </div>
            {activeCategory === 'spots' ? (
              <div>
                {nearbySpots.slice(0, 5).map((spot, i) => {
                  const distKm = spot.distance / 1000;
                  const distText = spot.distance < 1000
                    ? `约${spot.distance}m`
                    : `约${distKm.toFixed(1)}km`;
                  return (
                    <Card
                      key={spot.name}
                      hoverable
                      size="small"
                      style={{
                        borderRadius: 12, marginBottom: 8,
                        border: i === 0 ? '2px solid #c41d7f' : '1px solid #f0f0f0',
                        background: i === 0 ? 'linear-gradient(135deg, #fdf2f8, #fff9f5)' : '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{spot.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text strong style={{ fontSize: 14 }}>{spot.name}</Text>
                            <Tag color={i === 0 ? 'magenta' : 'default'} style={{ borderRadius: 10, fontSize: 11 }}>
                              {distText}
                            </Tag>
                            {i === 0 && <Tag color="green" style={{ borderRadius: 10, fontSize: 11 }}>最近</Tag>}
                          </div>
                          <Paragraph type="secondary" style={{ margin: '2px 0 0', fontSize: 12 }}>
                            {spot.desc}
                          </Paragraph>
                        </div>
                        <a
                          href={`https://api.map.baidu.com/marker?location=${spot.lat},${spot.lng}&title=${encodeURIComponent(spot.name)}&output=html`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#c41d7f', textDecoration: 'none', whiteSpace: 'nowrap' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          🚗 去这里
                        </a>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div>
                {facilitiesLoading && <div style={{ textAlign: 'center', padding: 20 }}><LoadingOutlined /> 搜索中...</div>}
                {!facilitiesLoading && facilities.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>附近未找到相关设施</div>
                )}
                {facilities.map((f, i) => {
                  const distText = f.distance < 1000 ? `约${f.distance}m` : `约${(f.distance / 1000).toFixed(1)}km`;
                  const navUrl = f.uid
                    ? `https://api.map.baidu.com/place/detail?uid=${f.uid}&output=html`
                    : `https://uri.amap.com/marker?position=${f.lng},${f.lat}&name=${encodeURIComponent(f.name)}`;
                  return (
                    <Card key={i} hoverable size="small" style={{ borderRadius: 12, marginBottom: 8, border: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{CATEGORIES.find(c => c.key === activeCategory)?.icon}</span>
                        <div style={{ flex: 1 }}>
                          <Text strong style={{ fontSize: 14 }}>{f.name}</Text>
                          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{distText}</Text>
                        </div>
                        <Tag style={{ borderRadius: 10, fontSize: 11 }}>{distText}</Tag>
                        <a href={navUrl} target="_blank" rel="noopener noreferrer"
                           style={{ fontSize: 12, color: '#c41d7f', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          🚗 去这里
                        </a>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <Button type="text" icon={<AimOutlined />} onClick={handleLocate} loading={locating} size="small">
                重新定位
              </Button>
            </div>
          </div>
        )}
      </section>

      <footer className="home-footer">
        <div className="footer-brand">🏯 灵山胜境 AI 数字人导游</div>
        <div className="footer-links">
          <span onClick={() => window.open('/admin/login', '_blank')}><SettingOutlined /> 管理后台</span>
        </div>
        <div className="footer-copy">© 2024 Ling Shan Sacred Land · AI Tour Guide</div>
      </footer>

      <style>{`
        .home-page { min-height: 100vh; background: #faf8f5; }

        .home-hero {
          position: relative;
          min-height: 100vh;
          background-color: #1a0510;
          display: flex; align-items: center; justify-content: center;
          background: url(/background.jpg) center/contain no-repeat;
          overflow: hidden;
        }
        .hero-particles { position: absolute; inset: 0; }
        .hero-particle {
          position: absolute; bottom: -20px;
          width: 2px; height: 2px;
          background: rgba(255,215,0,0.6);
          border-radius: 50%;
          animation: heroFloat linear infinite;
        }
        @keyframes heroFloat {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(-100vh) scale(0.5); opacity: 0; }
        }

        .hero-content {
          text-align: center; padding: 40px 20px; position: relative; z-index: 1;
          opacity: 0; transform: translateY(20px);
          transition: all 0.8s cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .hero-content.visible { opacity: 1; transform: translateY(0); }

        .hero-badge {
          display: inline-block;
          padding: 4px 16px; border-radius: 20px;
          background: rgba(255,255,255,0.1); color: #FFD700;
          font-size: 12px; font-weight: 500; margin-bottom: 16px;
          border: 1px solid rgba(255,215,0,0.2); backdrop-filter: blur(4px);
        }
        .hero-icon { font-size: 64px; margin-bottom: 8px; animation: iconBounce 2s ease-in-out infinite; }
        @keyframes iconBounce {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .hero-title {
          color: #fff !important; font-size: 40px !important; font-weight: 800 !important;
          margin-bottom: 0 !important; letter-spacing: 4px;
        }
        .hero-subtitle {
          color: rgba(255,255,255,0.85) !important; font-size: 20px !important;
          font-weight: 400 !important; margin-top: 4px !important; margin-bottom: 16px !important;
        }
        .hero-desc {
          color: rgba(255,255,255,0.6) !important; font-size: 14px !important;
          line-height: 2 !important; margin-bottom: 28px !important;
        }
        .hero-actions { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
        .hero-btn {
          height: 46px !important; border-radius: 23px !important; padding: 0 28px !important;
          font-size: 15px !important; font-weight: 600 !important; border: none !important;
        }
        .hero-btn.primary {
          background: linear-gradient(135deg, #c41d7f, #e91e63) !important;
          color: #fff !important; box-shadow: 0 4px 20px rgba(196,29,127,0.5) !important;
        }
        .hero-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(196,29,127,0.6) !important; }
        .hero-btn.secondary {
          background: rgba(255,255,255,0.12) !important; color: #fff !important;
          border: 1px solid rgba(255,255,255,0.25) !important; backdrop-filter: blur(8px);
        }
        .hero-btn.secondary:hover { background: rgba(255,255,255,0.2) !important; }

        .scroll-hint { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); }
        .scroll-arrow {
          width: 20px; height: 20px; border-right: 2px solid rgba(255,255,255,0.4);
          border-bottom: 2px solid rgba(255,255,255,0.4);
          transform: rotate(45deg);
          animation: scrollBounce 1.5s ease-in-out infinite;
        }
        @keyframes scrollBounce {
          0%,100% { opacity: 0.3; transform: rotate(45deg) translate(0,0); }
          50% { opacity: 1; transform: rotate(45deg) translate(6px,6px); }
        }

        .home-section { max-width: 1000px; margin: 0 auto; padding: 48px 20px; }
        .alt-bg { background: linear-gradient(135deg, #fef5fb 0%, #fff8f0 100%); border-radius: 32px; margin-top: -16px; }
        .section-header { text-align: center; margin-bottom: 28px; }
        .section-icon { font-size: 32px; color: #c41d7f; margin-bottom: 8px; }

        .feature-card { border-radius: 16px !important; text-align: center; height: 100%;
          border: none !important; box-shadow: 0 2px 16px rgba(0,0,0,0.04) !important;
          transition: transform 0.3s, box-shadow 0.3s !important;
        }
        .feature-card:hover { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(0,0,0,0.08) !important; }
        .feature-icon { font-size: 36px; margin-bottom: 12px; }

        .spot-card { border-radius: 16px !important; text-align: center; border: none !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.04) !important; cursor: pointer !important;
          transition: transform 0.3s, box-shadow 0.3s !important;
        }
        .spot-card:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 8px 28px rgba(0,0,0,0.08) !important; }
        .spot-emoji { font-size: 36px; margin-bottom: 8px; }
        .spot-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #333; }
        .spot-desc { font-size: 11px; color: #999; }

        .hot-questions-grid { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
        .hot-q-tag {
          cursor: pointer !important; font-size: 14px !important; padding: 8px 20px !important;
          border-radius: 22px !important; background: #fff !important;
          border: 1px solid rgba(196,29,127,0.15) !important; color: #333 !important;
          transition: all 0.25s !important;
        }
        .hot-q-tag:hover { background: #c41d7f !important; color: #fff !important; border-color: #c41d7f !important; transform: translateY(-2px); }

        .home-footer { text-align: center; padding: 32px 20px; color: #999; font-size: 12px; }
        .footer-brand { font-size: 15px; font-weight: 600; color: #666; margin-bottom: 6px; }
        .footer-links { margin-bottom: 6px; }
        .footer-links span { cursor: pointer; color: #c41d7f; }
        .footer-links span:hover { text-decoration: underline; }

        @media (max-width: 768px) {
          .hero-title { font-size: 28px !important; }
          .hero-subtitle { font-size: 16px !important; }
          .hero-icon { font-size: 48px; }
        }
      `}</style>
    </div>
  );
}