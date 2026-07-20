import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Row, Col, Typography, Space, Badge, Divider, message } from 'antd';
import {
  LogoutOutlined, DashboardOutlined, BookOutlined,
  SettingOutlined, BarChartOutlined, SoundOutlined, PauseOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { adminAPI } from '../../services/api';
import DigitalHuman, { ensureAudioContext } from '../../components/visitor/DigitalHuman';

const { Title, Text, Paragraph } = Typography;

const APPEARANCES = [
  { key: 'zen_red_gold', name: '禅意红金', desc: '红色汉服，金绣祥云，佛寺红墙背景', color: '#c41d7f', accent: '#e91e63' },
  { key: 'celadon_elegance', name: '青瓷雅韵', desc: '青色汉服，江南水乡，莲花点缀', color: '#2e7d5b', accent: '#4caf9e' },
  { key: 'tang_splendor', name: '唐风华韵', desc: '金色唐风宫廷装，富丽堂皇', color: '#b8860b', accent: '#d4a853' },
  { key: 'ink_wash', name: '水墨丹青', desc: '深蓝素雅汉服，水墨山竹意境', color: '#455a7b', accent: '#6b8db5' },
];

const VOICES = [
  { id: 'xiaoxiao', voiceId: 'zh-CN-XiaoxiaoNeural', name: '晓晓', style: '温柔知性', desc: '语调温婉，适合景区讲解和文化介绍', rate: '+0%', pitch: '+0Hz' },
  { id: 'xiaoyi',   voiceId: 'zh-CN-XiaoyiNeural',   name: '晓伊', style: '活泼灵动', desc: '语调轻快，富有朝气，适合互动问答', rate: '+10%', pitch: '+5Hz' },
  { id: 'xiaoxuan', voiceId: 'zh-CN-XiaoxuanNeural', name: '晓萱', style: '沉稳大气', desc: '语调沉稳，字正腔圆，适合历史文化讲解', rate: '-10%', pitch: '-5Hz' },
];

const BG_GRADIENTS: Record<string, string> = {
  zen_red_gold: 'linear-gradient(160deg, #fef5fb, #fff9f5, #fdf2f8)',
  celadon_elegance: 'linear-gradient(160deg, #f0faf5, #f5faf8, #f0f5f3)',
  tang_splendor: 'linear-gradient(160deg, #fffdf5, #fff8e8, #fef9ef)',
  ink_wash: 'linear-gradient(160deg, #f5f7fa, #f0f3f8, #f8f9fc)',
};

export default function DigitalHumanPage() {
  const navigate = useNavigate();
  const [appearance, setAppearance] = useState('zen_red_gold');
  const [voice, setVoice] = useState('xiaoxiao');
  const [previewSpeaking, setPreviewSpeaking] = useState(false);
  const [previewEmotion, setPreviewEmotion] = useState('greet');
  const [voiceLoading, setVoiceLoading] = useState(false);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const ctxWarmed = useRef(false);

  // Step 1: 预热 AudioContext — 首次用户交互时就 resume，避免试听时才初始化
  useEffect(() => {
    const warmUp = async () => {
      if (ctxWarmed.current) return;
      ctxWarmed.current = true;
      try {
        console.log('[Admin] 预热 AudioContext...');
        await ensureAudioContext();
        console.log('[Admin] AudioContext 预热完成');
      } catch { /* 静默失败，试听时再重试 */ }
      // 预热完立即关闭（不占资源），下次 ensureAudioContext 会重建
    };
    // 监听首次点击 / 触摸 / 键盘 → 预热
    const events = ['click', 'touchstart', 'keydown'] as const;
    const handler = () => { warmUp(); events.forEach(e => document.removeEventListener(e, handler)); };
    events.forEach(e => document.addEventListener(e, handler, { once: false }));
    return () => events.forEach(e => document.removeEventListener(e, handler));
  }, []);

  const save = (a: string, vId: string) => {
    const vObj = VOICES.find(x => x.id === vId) || VOICES[0];
    localStorage.setItem('selectedVoice', vObj.voiceId);
    adminAPI.updateDigitalHuman({
      name: '灵小禅', style_preset: a, voice_id: vObj.voiceId, voice_speed: 1.0, voice_pitch: 1.0,
    }).catch(() => {});
  };

  const activeAppearance = APPEARANCES.find(a => a.key === appearance)!;
  const activeVoice = VOICES.find(v => v.id === voice)!;

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const stopVoice = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      try { sourceNodeRef.current.disconnect(); } catch {}
      sourceNodeRef.current = null;
    }
    if (currentAudio.current) { currentAudio.current.pause(); currentAudio.current = null; }
    setPreviewSpeaking(false);
    setPreviewEmotion('greet');
  };

  const handlePreview = async (v?: typeof VOICES[0]) => {
    setVoiceLoading(true);
    stopVoice(); // stop any previous preview
    const voiceObj = v || activeVoice;
    try {
      // ── 前端 Step 1: 300ms 延迟，等 AudioContext 完全稳定 ──
      await new Promise(r => setTimeout(r, 300));

      const res = await fetch('/api/v1/visitor/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '你好我是灵小禅，欢迎来到灵山胜境', voice: voiceObj.voiceId, rate: voiceObj.rate, pitch: voiceObj.pitch }),
      });
      const data = await res.json();
      if (!data.audio_base64) { setVoiceLoading(false); return; }

      // ── 前端 Step 2: ensure AudioContext resumed ──
      const { ctx, analyser } = await ensureAudioContext();

      // ── 前端 Step 3: decode + canplaythrough 等效（decode 完成即可播）──
      const binary = atob(data.audio_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const rawBuffer = await ctx.decodeAudioData(bytes.buffer);

      // ── 兜底: 前面拼接 800ms 静音 ──
      const SILENCE_SEC = 0.8;
      const silenceFrames = Math.ceil(SILENCE_SEC * rawBuffer.sampleRate);
      const totalFrames = silenceFrames + rawBuffer.length;
      const padded = ctx.createBuffer(rawBuffer.numberOfChannels, totalFrames, rawBuffer.sampleRate);
      for (let ch = 0; ch < rawBuffer.numberOfChannels; ch++) {
        padded.getChannelData(ch).set(rawBuffer.getChannelData(ch), silenceFrames);
      }

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = padded;
      sourceNode.connect(analyser);
      sourceNodeRef.current = sourceNode;

      sourceNode.onended = () => {
        setPreviewSpeaking(false);
        setPreviewEmotion('greet');
        if (sourceNodeRef.current === sourceNode) sourceNodeRef.current = null;
      };

      setPreviewSpeaking(true);
      setPreviewEmotion('explain');
      sourceNode.start(0);
    } catch { /* ignore */ }
    finally { setVoiceLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <div style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24 }}>
        <div style={{ fontSize: 24 }}>🏯</div>
        <Title level={4} style={{ margin: 0 }}>数字人形象管理</Title>
        <div style={{ flex: 1 }} />
        <Button type="text" icon={<DashboardOutlined />} onClick={() => navigate('/admin/dashboard')}>仪表盘</Button>
        <Button type="text" icon={<BookOutlined />} onClick={() => navigate('/admin/knowledge')}>知识库</Button>
        <Button type="text" icon={<SettingOutlined />} onClick={() => navigate('/admin/digital-human')}>数字人</Button>
        <Button type="text" icon={<BarChartOutlined />} onClick={() => navigate('/admin/reports')}>报告</Button>
        <Button type="text" icon={<LogoutOutlined />} onClick={() => { localStorage.clear(); navigate('/admin/login'); }} danger>退出</Button>
      </div>

      <div style={{ padding: '0 24px', maxWidth: 1000, margin: '0 auto' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={10}>
            <Card title={<Space><span>🎭 实时预览</span><Badge status={previewSpeaking ? 'processing' : 'default'} text={previewSpeaking ? '讲解中' : '待机'} /></Space>} style={{ borderRadius: 12, minHeight: 450, position: 'sticky', top: 24 }}>
              <div style={{ background: BG_GRADIENTS[appearance], borderRadius: 16, padding: '20px 0', transition: 'background 0.6s ease' }}>
                <DigitalHuman emotion={previewEmotion} isSpeaking={previewSpeaking} size="large" stylePreset={appearance} />
              </div>
              <div style={{ textAlign: 'center', marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {previewSpeaking ? (
                  <Button icon={<PauseOutlined />} onClick={stopVoice} danger>停止播放</Button>
                ) : (
                  <Button icon={<SoundOutlined />} onClick={() => handlePreview()} loading={voiceLoading}>
                    试听「{activeVoice.name}·{activeVoice.style}」
                  </Button>
                )}
                <Button onClick={() => setPreviewEmotion(p => p === 'greet' ? 'happy' : p === 'happy' ? 'explain' : p === 'explain' ? 'think' : 'greet')}>
                  切换表情
                </Button>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当前组合：{activeAppearance.name} + {activeVoice.name}·{activeVoice.style}
                </Text>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={14}>
            <Card title="🎨 外观风格" style={{ borderRadius: 12, marginBottom: 16 }}>
              <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                选择数字人的角色形象。每张图片由 AI 独立生成，风格各异。
              </Paragraph>
              <Row gutter={[12, 12]}>
                {APPEARANCES.map(a => {
                  const sel = appearance === a.key;
                  return (
                    <Col xs={12} key={a.key}>
                      <Card hoverable size="small"
                        onClick={() => { setAppearance(a.key); save(a.key, voice); message.success(`外观：${a.name}`); }}
                        style={{ borderRadius: 12, border: sel ? `2px solid ${a.color}` : '1px solid #f0f0f0', background: sel ? `linear-gradient(135deg, ${a.color}08, ${a.accent}08)` : '#fff', cursor: 'pointer', transition: 'all 0.3s' }}
                        bodyStyle={{ padding: '12px 16px' }}>
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Space>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${a.color}, ${a.accent})`, boxShadow: `0 2px 8px ${a.color}40` }} />
                              <Text strong>{a.name}</Text>
                            </Space>
                            {sel && <CheckCircleFilled style={{ color: a.color, fontSize: 18 }} />}
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>{a.desc}</Text>
                        </Space>
                      </Card>
                    </Col>
                  );
                })}
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Space size={12}>
                <Text type="secondary">当前外观：</Text>
                <Badge color={activeAppearance.color} text={activeAppearance.name} />
                <Text code style={{ fontSize: 11 }}>{activeAppearance.color}</Text>
              </Space>
            </Card>

            <Card title="🔊 声音风格" style={{ borderRadius: 12 }}>
              <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                独立于外观，任意搭配。选择与导览场景匹配的语音风格。
              </Paragraph>
              {VOICES.map(v => {
                const sel = voice === v.id;
                return (
                  <Card hoverable size="small" key={v.id}
                    onClick={() => { setVoice(v.id); save(appearance, v.id); message.success(`声音：${v.name}·${v.style}`); }}
                    style={{ borderRadius: 12, marginBottom: 8, border: sel ? '2px solid #c41d7f' : '1px solid #f0f0f0', background: sel ? '#fdf2f8' : '#fff', cursor: 'pointer', transition: 'all 0.3s' }}
                    bodyStyle={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Text strong style={{ fontSize: 15 }}>
                          {v.name}
                          <Text type="secondary" style={{ fontSize: 13, marginLeft: 6 }}>· {v.style}</Text>
                        </Text>
                        <Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 0', maxWidth: 300 }}>
                          {v.desc}
                        </Paragraph>
                      </div>
                      <Space>
                        {sel && <CheckCircleFilled style={{ color: '#c41d7f', fontSize: 18 }} />}
                        <Button size="small" icon={<SoundOutlined />}
                          onClick={e => { e.stopPropagation(); handlePreview(v); }}
                        >试听</Button>
                      </Space>
                    </div>
                  </Card>
                );
              })}
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
}
