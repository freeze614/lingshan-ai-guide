import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Input, Button, message, Tag, Switch } from 'antd';
import {
  SendOutlined, AudioOutlined, HomeOutlined,
  RobotOutlined, UserOutlined, LoadingOutlined,
  CompassOutlined,
  ClearOutlined, CameraOutlined,
  CaretRightOutlined, SettingOutlined,
} from '@ant-design/icons';
import DigitalHuman, { ensureAudioContext } from '../../components/visitor/DigitalHuman';
import './QAPage.css';

const API_BASE = '';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  emotion?: string;
  relatedSpots?: string[];
  image_urls?: Array<{ url: string; name: string }>;
  ttsStatus?: 'idle' | 'loading' | 'ready' | 'failed';
  ttsAudioBase64?: string | null;
  ttsVisemes?: Array<{ time_ms: number; viseme_id: number }> | null;
}

const QUICK_CHIPS = [
  '灵山大佛有多高？',
  '九龙灌浴表演时间？',
  '门票价格？',
  '推荐游览路线',
];

type DHStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function QAPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // -- state --
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [conversationMode, setConversationMode] = useState(false);
  const [dhStatus, setDhStatus] = useState<DHStatus>('idle');
  const [showRating, setShowRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [activeViseme, setActiveViseme] = useState(0);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [dhStyle, setDhStyle] = useState('zen_red_gold');

  // -- refs (ref-driven audio: no stale closures, survives React re-renders) --
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const visemeTimerRef = useRef<any>(null);
  const playingMsgIdRef = useRef<string | null>(null);
  const handleSendFnRef = useRef<((text?: string) => void) | null>(null);

  // ==================== Stop playback (3 mechanisms) ===========================

  const stopPlayback = useCallback(() => {
    // Mechanism 3: Web Audio API — stop & disconnect source node
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch {}
      try { sourceNodeRef.current.disconnect(); } catch {}
      sourceNodeRef.current = null;
    }
    // Legacy HTML5 audio fallback
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { audioRef.current.currentTime = 0; } catch {}
      audioRef.current = null;
    }
    if (visemeTimerRef.current) {
      clearInterval(visemeTimerRef.current);
      visemeTimerRef.current = null;
    }
    playingMsgIdRef.current = null;
    setIsSpeaking(false);
    setActiveViseme(0);
    setPlayingMsgId(null);
    setDhStatus('idle');
  }, []);

  // Mechanism 2: page leave → stop
  useEffect(() => {
    const onLeave = () => stopPlayback();
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopPlayback();
    });
    return () => {
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [stopPlayback]);

  const playAudioDirect = useCallback(async (
    audioB64: string,
    visemes: any[] | null | undefined,
    msgId: string,
  ) => {
    const TAG = `[TTS:${msgId.slice(-6)}]`;
    console.time(`${TAG} total`);
    console.log(`${TAG} ① 开始获取音频, base64 length =`, audioB64.length);

    playingMsgIdRef.current = msgId;
    setPlayingMsgId(msgId);
    setIsSpeaking(true);
    setDhStatus('speaking');

    try {
      console.time(`${TAG} ② audioContext setup`);
      const { ctx, analyser } = await ensureAudioContext();
      console.timeEnd(`${TAG} ② audioContext setup`);
      console.log(`${TAG}    ctx.state =`, ctx.state, ', sampleRate =', ctx.sampleRate);

      console.time(`${TAG} ③ decode`);
      const binary = atob(audioB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const rawBuffer = await ctx.decodeAudioData(bytes.buffer);
      console.timeEnd(`${TAG} ③ decode`);
      console.log(`${TAG}    raw duration =`, rawBuffer.duration.toFixed(2), 's, channels =', rawBuffer.numberOfChannels);

      const SILENCE_SEC = 0.8;
      const silenceFrames = Math.ceil(SILENCE_SEC * rawBuffer.sampleRate);
      const totalFrames = silenceFrames + rawBuffer.length;
      const padded = ctx.createBuffer(rawBuffer.numberOfChannels, totalFrames, rawBuffer.sampleRate);
      for (let ch = 0; ch < rawBuffer.numberOfChannels; ch++) {
        padded.getChannelData(ch).set(rawBuffer.getChannelData(ch), silenceFrames);
      }
      console.log(`${TAG}    padded +${SILENCE_SEC * 1000}ms silence, total duration =`, padded.duration.toFixed(2), 's');

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = padded;
      sourceNode.connect(analyser);
      sourceNodeRef.current = sourceNode;

      const visemeData: any[] = visemes || [];
      const VISEME_OFFSET_MS = SILENCE_SEC * 1000;
      if (visemeTimerRef.current) clearInterval(visemeTimerRef.current);
      const startTime = performance.now();
      visemeTimerRef.current = setInterval(() => {
        if (playingMsgIdRef.current !== msgId) {
          if (visemeTimerRef.current) { clearInterval(visemeTimerRef.current); visemeTimerRef.current = null; }
          return;
        }
        const elapsed = performance.now() - startTime;
        let vid = 0;
        for (let i = visemeData.length - 1; i >= 0; i--) {
          if (elapsed >= visemeData[i].time_ms + VISEME_OFFSET_MS) { vid = visemeData[i].viseme_id; break; }
        }
        const maxTime = (visemeData.length > 0 ? visemeData[visemeData.length - 1]?.time_ms : 0) + VISEME_OFFSET_MS + 500;
        if (elapsed > maxTime) {
          setActiveViseme(0);
          if (visemeTimerRef.current) { clearInterval(visemeTimerRef.current); visemeTimerRef.current = null; }
          return;
        }
        setActiveViseme(vid);
      }, 25);

      const cleanup = () => {
        try { sourceNode.stop(); } catch {}
        try { sourceNode.disconnect(); } catch {}
        if (sourceNodeRef.current === sourceNode) sourceNodeRef.current = null;
        if (playingMsgIdRef.current === msgId) {
          stopPlayback();
          if (conversationMode) {
            setTimeout(() => {
              if (recognitionRef.current && playingMsgIdRef.current === null) {
                try { recognitionRef.current.start(); setIsListening(true); setDhStatus('listening'); } catch {}
              }
            }, 800);
          }
        }
      };

      sourceNode.onended = cleanup;

      console.time(`${TAG} ④ start`);
      sourceNode.start(0);
      console.timeEnd(`${TAG} ④ start`);
      console.timeEnd(`${TAG} total`);
      console.log(`${TAG} ✅ 播放已触发`);

    } catch (err: any) {
      console.error(`${TAG} ❌ 播放失败:`, err.message);
      stopPlayback();
    }
  }, [stopPlayback, conversationMode]);

  // ==================== TTS fetch + cache ======================================

  const fetchTTS = useCallback(async (text: string) => {
    try {
      const clean = text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/`{1,3}[^`]*`{1,3}/g, '')
        .replace(/[>*_~`#\[\]()|\\]/g, '')
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{2300}-\u{23FF}]/gu, '')
        .replace(/[\u{2B00}-\u{2BFF}]/gu, '')
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
        .replace(/[\u{200D}\u{200C}]/gu, '')
        .replace(/\n{2,}/g, '。')
        .replace(/\n/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (clean.length < 2) return null;
      const res = await fetch(`http://127.0.0.1:8001/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean, voice: localStorage.getItem('selectedVoice') || 'zh-CN-XiaoxiaoNeural' }),
      });
      const data = await res.json();
      if (data.audio_base64 && data.audio_base64.length > 400) {
        return { audio_base64: data.audio_base64, visemes: data.visemes || [] };
      }
      return null;
    } catch { return null; }
  }, []);

  // Cache TTS then optionally auto-play
  const cacheAndMaybePlay = useCallback(async (msgId: string, text: string, shouldPlay: boolean) => {
    const result = await fetchTTS(text);
    setMessages(prev => prev.map(m => m.id === msgId ? {
      ...m,
      ttsAudioBase64: result?.audio_base64 ?? null,
      ttsVisemes: result?.visemes ?? null,
      ttsStatus: result ? 'ready' : 'failed',
    } : m));

    if (result && shouldPlay) {
      playAudioDirect(result.audio_base64, result.visemes, msgId);
    }
  }, [fetchTTS, playAudioDirect]);

  // Cache only (no play) — for initial welcome message
  const preCacheTTS = useCallback(async (msgId: string, text: string) => {
    const result = await fetchTTS(text);
    setMessages(prev => prev.map(m => m.id === msgId ? {
      ...m,
      ttsAudioBase64: result?.audio_base64 ?? null,
      ttsVisemes: result?.visemes ?? null,
      ttsStatus: result ? 'ready' : 'failed',
    } : m));
  }, [fetchTTS]);

  // ==================== Manual play button handler ============================

  const handlePlayClick = useCallback(async (msgId: string, text: string, cachedAudio: string | null | undefined, cachedVisemes: any[] | null | undefined) => {
    if (playingMsgIdRef.current === msgId) {
      stopPlayback();
      return;
    }

    stopPlayback();

    if (cachedAudio) {
      playAudioDirect(cachedAudio, cachedVisemes, msgId);
      return;
    }

    // Fetch TTS then play
    setDhStatus('thinking');
    const result = await fetchTTS(text);
    if (result) {
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        ttsAudioBase64: result.audio_base64,
        ttsVisemes: result.visemes,
        ttsStatus: 'ready',
      } : m));
      playAudioDirect(result.audio_base64, result.visemes, msgId);
    } else {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, ttsStatus: 'failed' } : m));
    }
  }, [stopPlayback, fetchTTS, playAudioDirect]);

  // ==================== Send message ==========================================

  const handleSend = useCallback(async (text?: string) => {
    const query = (text || input.trim());
    if (!query || isStreaming) return;
    stopPlayback();

    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', content: query, timestamp: Date.now() }]);
    setInput('');
    setIsStreaming(true);
    setCurrentEmotion('think');
    setDhStatus('thinking');

    try {
      const res = await fetch(`${API_BASE}/api/v1/visitor/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ query, session_id: sessionId }),
      });
      if (!res.ok || !res.body) throw new Error('No stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', fullAnswer = '';
      let streamDone = false;
      const aiMsgId = `a_${Date.now()}`;
      setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', timestamp: Date.now(), emotion: 'explain', ttsStatus: 'loading' }]);

      let lastChunk = Date.now();
      while (true) {
        try {
          const { done, value } = await reader.read();
          if (done) break;
          lastChunk = Date.now();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'chunk') {
                fullAnswer += data.content;
                setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullAnswer } : m));
              } else if (data.type === 'done') {
                streamDone = true;
                setCurrentEmotion(data.emotion || 'explain');
                setMessages(prev => prev.map(m => m.id === aiMsgId ? {
                  ...m, content: fullAnswer, emotion: data.emotion, relatedSpots: data.related_spots, image_urls: data.image_urls || [],
                } : m));
                // Auto-play if enabled
                cacheAndMaybePlay(aiMsgId, fullAnswer, autoPlay);
              }
            } catch {}
          }
          if (Date.now() - lastChunk > 30000) break;
        } catch { break; }
      }

      if (!streamDone && fullAnswer.length > 10) {
        setCurrentEmotion('explain');
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullAnswer, emotion: 'explain' } : m));
        cacheAndMaybePlay(aiMsgId, fullAnswer, autoPlay);
      } else if (!streamDone) {
        throw new Error('No content');
      }
    } catch {
      try {
        const res2 = await fetch(`${API_BASE}/api/v1/visitor/qa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, session_id: sessionId }),
        });
        const data = await res2.json();
        const errId = `a_${Date.now()}`;
        setMessages(prev => [...prev, { id: errId, role: 'assistant', content: data.answer, timestamp: Date.now(), emotion: data.emotion, relatedSpots: data.related_spots, image_urls: data.image_urls || [], ttsStatus: 'loading' }]);
        setCurrentEmotion(data.emotion || 'explain');
        if (data.answer) cacheAndMaybePlay(errId, data.answer, autoPlay);
      } catch {
        setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: '抱歉，我暂时无法回答。请稍后再试。😔', timestamp: Date.now(), ttsStatus: 'failed' }]);
      }
    } finally {
      setIsStreaming(false);
      setShowRating(true);
      setRatingSubmitted(false);
      if (!autoPlay) setDhStatus('idle');
    }
  }, [input, isStreaming, sessionId, stopPlayback, autoPlay, cacheAndMaybePlay]);

  // Keep handleSendFnRef in sync for SpeechRecognition callback
  useEffect(() => { handleSendFnRef.current = handleSend; }, [handleSend]);

  // ==================== Load digital human config =============================

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/visitor/dh-config`)
      .then(r => r.json())
      .then(data => {
        if (data?.style_preset) setDhStyle(data.style_preset);
      })
      .catch(() => {}); // use default
  }, []);

  // ==================== Session init =========================================

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/visitor/session/init`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setSessionId(data.session_id);
        const welcomeText = data.welcome_message;
        const welcomeId = 'welcome';
        setMessages([{ id: welcomeId, role: 'assistant', content: welcomeText, timestamp: Date.now(), emotion: 'greet', ttsStatus: 'loading' }]);
        setCurrentEmotion('greet');
        preCacheTTS(welcomeId, welcomeText);
      })
      .catch(() => {
        const fallbackId = 'welcome';
        const fallbackText = '您好！我是灵山胜境的AI数字人导游「灵小禅」🌸\n请问有什么可以帮您的？';
        setMessages([{ id: fallbackId, role: 'assistant', content: fallbackText, timestamp: Date.now(), emotion: 'greet', ttsStatus: 'loading' }]);
        setCurrentEmotion('greet');
        preCacheTTS(fallbackId, fallbackText);
      });
  }, []);

  // ==================== URL query param ======================================

  useEffect(() => {
    const q = searchParams.get('q');
    if (q && sessionId) handleSendFnRef.current?.(q);
  }, [searchParams, sessionId]);

  // ==================== Auto-scroll =========================================

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // ==================== Voice input (Web Speech API) =========================

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const r = new SpeechRecognition();
    r.lang = 'zh-CN';
    r.interimResults = true;   // show partial results
    r.continuous = false;
    r.onresult = (e: any) => {
      const txt = e.results[0][0].transcript;
      setInput(txt);
      if (e.results[0].isFinal) {
        setIsListening(false);
        setDhStatus('thinking');
        setTimeout(() => handleSendFnRef.current?.(txt), 300);
      }
    };
    r.onerror = () => { setIsListening(false); setDhStatus('idle'); message.warning('语音识别失败，请使用文字输入'); };
    r.onend = () => { setIsListening(false); };
    recognitionRef.current = r;
  }, []);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) { message.info('您的浏览器不支持语音输入'); return; }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setDhStatus('idle');
    } else {
      stopPlayback(); // stop any current playback before listening
      recognitionRef.current.start();
      setIsListening(true);
      setDhStatus('listening');
    }
  }, [isListening, stopPlayback]);

  // ==================== Image recognition ===================================

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', content: `📷 拍照识别：${file.name}`, timestamp: Date.now() }]);
    setIsRecognizing(true);
    try {
      const base64 = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve((r.result as string).split(',')[1]); r.readAsDataURL(file); });
      const res = await fetch(`${API_BASE}/api/v1/visitor/vision/recognize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_base64: base64 }) });
      const data = await res.json();
      if (data.recognized && data.spot_name) {
        setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: `🏛️ 我认出了！这应该是 **${data.spot_name}**（置信度：${Math.round((data.confidence || 0.5) * 100)}%）\n\n${data.description || ''}\n\n需要我详细介绍一下${data.spot_name}吗？`, timestamp: Date.now(), emotion: 'explain', relatedSpots: [data.spot_name, ...(data.nearby_spots || [])] }]);
        setCurrentEmotion('explain');
      } else {
        setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: '抱歉，我没能识别出这张图片 😔\n\n请尝试拍摄更清晰的景点照片。', timestamp: Date.now(), emotion: 'sorry' }]);
        setCurrentEmotion('sorry');
      }
    } catch {
      setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: 'assistant', content: '图片识别失败，请稍后再试。', timestamp: Date.now() }]);
    } finally {
      setIsRecognizing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  // ==================== Clear chat ==========================================

  const handleClearChat = useCallback(() => {
    stopPlayback();
    setMessages([{ id: 'welcome', role: 'assistant', content: '对话已清空～请问有什么可以帮您的？🌸', timestamp: Date.now(), emotion: 'greet' }]);
    setCurrentEmotion('greet');
    setDhStatus('idle');
  }, [stopPlayback]);

  // ==================== Rating ==============================================

  const handleRate = useCallback(async (stars: number) => {
    setRatingSubmitted(true);
    try {
      await fetch(`${API_BASE}/api/v1/visitor/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, rating: stars, comment: '' }),
      });
      message.success(`感谢您的${stars}星评价！🌸`);
    } catch {
      // Silently fail — rating is optional
    }
  }, [sessionId]);

  // Cleanup on unmount
  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // ==================== RENDER ==============================================

  // Map emotion → DH status text
  const statusText: Record<DHStatus, string> = {
    idle: '○ 待机',
    listening: '🎤 聆听中',
    thinking: '💭 思考中',
    speaking: '● 讲解中',
  };

  return (
    <div className="qa-page">
      <div className="qa-bg-decor">
        <div className="qa-bg-circle c1" /><div className="qa-bg-circle c2" /><div className="qa-bg-circle c3" />
      </div>

      <header className="qa-header">
        <Button type="text" icon={<HomeOutlined />} onClick={() => navigate('/')} className="header-btn" />
        <div className="header-avatar">🏯</div>
        <div className="header-info">
          <div className="header-name">灵小禅</div>
          <div className="header-subtitle">AI 数字人导游 · 在线</div>
        </div>
        <div style={{ flex: 1 }} />

        {/* Conversation mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>连续对话</span>
          <Switch size="small" checked={conversationMode} onChange={setConversationMode} />
        </div>

        {/* Auto-play toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
          <span style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>自动播放</span>
          <Switch size="small" checked={autoPlay} onChange={setAutoPlay} />
        </div>

        <Button type="text" icon={<ClearOutlined />} onClick={handleClearChat} className="header-btn" title="清空对话" />
        <Button type="text" icon={<CompassOutlined />} onClick={() => navigate('/recommend')} className="header-btn" title="路线推荐" />
        <Button type="text" icon={<SettingOutlined />} onClick={() => window.open('/admin/login', '_blank')} className="header-btn" title="管理后台" />
      </header>

      <div className="qa-digital-human-area">
        <DigitalHuman
          emotion={currentEmotion}
          isSpeaking={isSpeaking}
          size="large"
          visemeId={activeViseme}
          stylePreset={dhStyle}
        />
        {/* Status badge */}
        <div className={`dh-status-badge dh-status--${dhStatus}`}>
          {statusText[dhStatus]}
        </div>
      </div>

      <div className="qa-quick-chips">
        {QUICK_CHIPS.map((chip, i) => (<Tag key={i} className="quick-chip" onClick={() => handleSend(chip)}>{chip}</Tag>))}
      </div>

      {showRating && messages.length > 0 && (
        <div className="qa-rating-row">
          {ratingSubmitted ? (
            <span className="qa-rating-thanks">🌸 感谢您的评价！</span>
          ) : (
            <>
              <span className="qa-rating-label">这次回答对您有帮助吗？</span>
              <span className="qa-rating-stars">
                {[1, 2, 3, 4, 5].map(star => (
                  <span key={star} className="qa-rating-star" onClick={() => handleRate(star)} title={`${star}星`}>
                    {'★'}
                  </span>
                ))}
              </span>
            </>
          )}
        </div>
      )}

      <div className="qa-messages" ref={messagesContainerRef}>
        {messages.map(msg => {
          const isAi = msg.role === 'assistant';
          if (isAi) console.log('AI回复消息:', msg);
          const hasContent = (msg.content || '').length > 0;
          const isStreamingMsg = msg.id === messages[messages.length - 1]?.id && isStreaming && isAi && !msg.content;
          const isPlaying = playingMsgId === msg.id;
          const isLoading = !isPlaying && !isStreamingMsg && isAi && hasContent && msg.ttsStatus === 'loading';
          const isReady = !isPlaying && !isLoading && isAi && hasContent && !isStreamingMsg;
          const btnStatus = isPlaying ? 'playing' : isLoading ? 'loading' : 'ready';
          const showBtn = isReady || isLoading || isPlaying;

          return (
            <div key={msg.id} className={`qa-message ${msg.role}`}>
              {isAi && <div className="msg-avatar ai-avatar"><RobotOutlined /></div>}
              <div className="msg-bubble">
                <div className="msg-text">
                  {msg.content || ''}
                  {isStreamingMsg && <span className="typing-indicator"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></span>}
                </div>
                {isAi && msg.image_urls && msg.image_urls.length > 0 && (
                  <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {msg.image_urls.map((item, idx) => (
                      <div key={idx} style={{ textAlign: 'center' }}>
                        <img
                          src={item.url}
                          alt={item.name}
                          style={{ width: '200px', borderRadius: '8px' }}
                        />
                        <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>{item.name}</div>
                      </div>
                    ))}
                  </div>
                )}
                {showBtn && !autoPlay && (
                  <div className="msg-footer">
                    <button className={`msg-play-btn ${btnStatus}`}
                      onClick={() => handlePlayClick(msg.id, msg.content, msg.ttsAudioBase64, msg.ttsVisemes)}
                      title={btnStatus === 'loading' ? '语音加载中...' : btnStatus === 'playing' ? '停止播放' : '播放语音'}
                      disabled={btnStatus === 'loading'}>
                      {btnStatus === 'loading' && <LoadingOutlined spin />}
                      {btnStatus === 'ready' && <CaretRightOutlined />}
                      {btnStatus === 'playing' && <span className="playing-icon"><span /><span /><span /></span>}
                    </button>
                  </div>
                )}
                {msg.relatedSpots && msg.relatedSpots.length > 0 && (
                  <div className="msg-spots">{msg.relatedSpots.map((spot: string) => (<span key={spot} className="spot-tag" onClick={() => handleSend(spot)}>📍 {spot}</span>))}</div>
                )}
              </div>
              {msg.role === 'user' && <div className="msg-avatar user-avatar"><UserOutlined /></div>}
            </div>
          );
        })}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImageUpload} />

      <div className="qa-input-area">
        <Button
          type={isListening ? 'primary' : 'default'}
          icon={<AudioOutlined />}
          onClick={toggleListening}
          danger={isListening}
          shape="circle"
          size="large"
          className={`voice-btn ${isListening ? 'listening' : ''}`}
        />
        <Button
          type="default"
          icon={isRecognizing ? <LoadingOutlined /> : <CameraOutlined />}
          onClick={() => fileInputRef.current?.click()}
          loading={isRecognizing}
          shape="circle"
          size="large"
          className="camera-btn"
          title="拍照识别景点"
        />
        <Input.TextArea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={isListening ? '正在聆听...' : dhStatus === 'thinking' ? '灵小禅正在思考...' : '想问什么？输入后按 Enter 发送~'}
          autoSize={{ minRows: 1, maxRows: 4 }}
          className="qa-text-input"
          disabled={isStreaming || isListening}
        />
        <Button
          type="primary"
          icon={isStreaming ? <LoadingOutlined /> : <SendOutlined />}
          onClick={() => handleSend()}
          loading={isStreaming}
          shape="circle"
          size="large"
          className="send-btn"
        />
      </div>
    </div>
  );
}