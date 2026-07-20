import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import {
  queryRAG, streamRAGQuery, getSessionHistory,
  initKnowledgeBase, getKnowledgeStats,
} from '../../services/rag-service';
import { textToSpeech } from '../../services/tts-service';
import { isLLMAvailable, getActiveModelName, callLLM, callMultimodalLLM, isMultimodalAvailable } from '../../services/llm-service';
import { analyzeEmotion } from '../../services/emotion-service';
import { broadcastQueryEvent } from '../../services/websocket-service';
import {
  saveConversation, saveFeedback, getConversationStats,
  getHotQuestions as getDbHotQuestions, classifyQuery,
  updateConversationFeedback,
} from '../../db/store';

const visitorRouter = Router();

// ============ Spot Image Mapping ============

const SPOT_IMAGES: Record<string, string> = {
  '灵山大佛': 'lingshan_dafo.jpg',
  '九龙灌浴': 'jiulong_guanyu.jpg',
  '灵山梵宫': 'lingshan_fangong.jpg',
  '五印坛城': 'wuyin_tancheng.jpg',
  '祥符禅寺': 'xiangfu_temple.jpg',
  '拈花湾': 'nianhua_wan.jpg',
  '五明桥': 'wuming_bridge.jpg',
  '胜境门楼': 'shengjing_gate.jpg',
  '洗心池': 'xixin_pond.jpg',
  '佛足坛': 'fozu_altar.jpg',
  '降魔浮雕': 'xiangmo_relief.jpg',
  '阿育王柱': 'ayuwang_pillar.jpg',
  '天下第一掌': 'tianxiadiyizhang.jpg',
  '百子戏弥勒': 'baiziximile.jpg',
  '杏坛广场': 'xingtan_square.jpg',
  '登云道': 'dengyun_road.jpg',
  '灵山大照壁': 'lingshan_zhaobi.jpg',
  '梵宫珍宝馆': 'zhenbao_hall.jpg',
  '曼飞龙塔': 'manfeilong_pagoda.jpg',
  '佛手樟': 'foshou_zhang.jpg',
  '六角井': 'liujiao_well.jpg',
  '白莲池': 'bailian_pond.jpg',
  '五智门': 'wuzhi_gate.jpg',
  '菩提大道': 'puti_avenue.jpg',
  '佛教文化博览馆': 'fojiao_museum.jpg',
  '拈花广场': 'nianhua_square.jpg',
  '梵天花海': 'fantian_huahai.jpg',
  '香悦花街': 'xiangyue_street.jpg',
  '拈花堂': 'nianhua_hall.jpg',
  '五湖灯': 'wuhu_lamp.jpg',
  '鹿鸣谷': 'luming_valley.jpg',
};

type SpotImage = { url: string; name: string };

function matchSpotsInText(text: string): string[] {
  if (!text) return [];
  const results: string[] = [];
  const sortedNames = Object.keys(SPOT_IMAGES).sort((a, b) => b.length - a.length);
  for (const spotName of sortedNames) {
    if (text.includes(spotName)) {
      results.push(spotName);
    }
  }
  return results;
}

function getImageUrls(question: string, answer: string): SpotImage[] {
  // Priority 1: spots mentioned in the user's question
  const questionSpots = matchSpotsInText(question);
  if (questionSpots.length > 0) {
    return questionSpots.map(name => ({ url: `/${SPOT_IMAGES[name]}`, name }));
  }
  // Priority 2: spots mentioned in the AI's answer
  const answerSpots = matchSpotsInText(answer);
  return answerSpots.map(name => ({ url: `/${SPOT_IMAGES[name]}`, name }));
}

// ============ Scenic Spots ============

const ALL_SPOTS = [
  { id: 'LS-011', name: '灵山大佛', area: '灵山胜境', category: '佛教建筑', summary: '世界最高露天青铜释迦牟尼立像，通高88米', highlight: '登顶抱佛脚，俯瞰太湖全景', lat: 31.42, lng: 120.10 },
  { id: 'LS-006', name: '九龙灌浴', area: '灵山胜境', category: '动态景观', summary: '大型音乐动态群雕，再现佛陀诞生祥瑞场景', highlight: '花开见佛，九龙吐水，可接取圣水', lat: 31.41, lng: 120.10 },
  { id: 'LS-013', name: '灵山梵宫', area: '灵山胜境', category: '佛教建筑', summary: '被誉为"东方卢浮宫"的佛教艺术殿堂', highlight: '穹顶天象图、《华藏世界》琉璃壁画、《吉祥颂》演出', lat: 31.42, lng: 120.10 },
  { id: 'LS-014', name: '五印坛城', area: '灵山胜境', category: '藏传佛教', summary: '藏传佛教风格建筑，有"小布达拉宫"之称', highlight: '转经筒祈福，登顶俯瞰香水海全景', lat: 31.42, lng: 120.11 },
  { id: 'LS-010', name: '祥符禅寺', area: '灵山胜境', category: '千年古刹', summary: '唐代千年古刹，灵山佛教文化发源地', highlight: '千年银杏、祥符禅钟、六角古井', lat: 31.42, lng: 120.10 },
  { id: 'LS-001', name: '灵山大照壁', area: '灵山胜境', category: '景观门户', summary: '华夏第一壁，赵朴初题字', highlight: '鎏金大字，湖光壁影同框', lat: 31.41, lng: 120.09 },
  { id: 'LS-005', name: '菩提大道', area: '灵山胜境', category: '景观步道', summary: '250米菩提树拱廊，印度正宗树种', highlight: '春季菩提花开，感受禅意漫步', lat: 31.41, lng: 120.10 },
  { id: 'LS-009', name: '百子戏弥勒', area: '灵山胜境', category: '祈福景观', summary: '青铜群雕，弥勒百子嬉戏', highlight: '摸弥勒肚皮享福气，亲子互动拍照', lat: 31.42, lng: 120.10 },
  { id: 'LS-015', name: '曼飞龙塔', area: '灵山胜境', category: '南传佛教', summary: '复刻云南西双版纳白塔', highlight: '佛教三大语系建筑齐聚，异域风情拍照', lat: 31.42, lng: 120.11 },
  { id: 'LS-016', name: '无尽意斋', area: '灵山胜境', category: '名人纪念馆', summary: '赵朴初先生纪念馆', highlight: '四合院建筑，禅茶品鉴，书法欣赏', lat: 31.42, lng: 120.10 },
  { id: 'LS-002', name: '五明桥', area: '灵山胜境', category: '景观步道', summary: '五座汉白玉石拱桥，象征佛教五种智慧', highlight: '过桥开启智慧，桥水倒影绝美', lat: 31.41, lng: 120.09 },
  { id: 'LS-003', name: '佛足坛', area: '灵山胜境', category: '祈福景观', summary: '青铜巨型佛足印，复刻佛祖真身脚印', highlight: '瞻仰佛足，触摸吉祥图案祈福', lat: 31.41, lng: 120.10 },
  { id: 'LS-004', name: '五智门', area: '灵山胜境', category: '景观建筑', summary: '汉白玉牌坊，五门象征五方五佛', highlight: '穿过此门踏入禅意圣地', lat: 31.41, lng: 120.10 },
  { id: 'LS-007', name: '降魔浮雕', area: '灵山胜境', category: '佛教艺术', summary: '巨型石雕，再现佛陀降魔成道', highlight: '高浮雕与浅浮雕结合的佛教艺术珍品', lat: 31.41, lng: 120.10 },
  { id: 'LS-008', name: '阿育王柱', area: '灵山胜境', category: '佛教建筑', summary: '整块花岗岩雕刻，重180吨', highlight: '佛教从印度传入中国的重要象征', lat: 31.41, lng: 120.10 },
  { id: 'LS-012', name: '佛教文化博览馆', area: '灵山胜境', category: '博物馆', summary: '大佛座基内三层1万㎡博览馆', highlight: '万佛殿9999尊小佛像，免费讲解', lat: 31.42, lng: 120.10 },
  { id: 'NH-001', name: '拈花广场', area: '拈花湾', category: '小镇门户', summary: '拈花湾入口核心区域', highlight: '拈花微笑雕塑，禅意开园仪式', lat: 31.40, lng: 120.08 },
  { id: 'NH-002', name: '梵天花海', area: '拈花湾', category: '自然景观', summary: '占地30000㎡四季花海', highlight: '四季花开，木质步道漫步，拍照圣地', lat: 31.40, lng: 120.08 },
  { id: 'NH-003', name: '香月花街', area: '拈花湾', category: '禅意商业', summary: '800米禅意商业街', highlight: '非遗手作体验，禅意文创，夜间灯笼美景', lat: 31.40, lng: 120.08 },
  { id: 'NH-005', name: '五灯湖', area: '拈花湾', category: '水景景观', summary: '小镇最大水景观', highlight: '夜间《禅行》灯光秀，湖心亭观景', lat: 31.40, lng: 120.08 },
  { id: 'NH-004', name: '拈花堂', area: '拈花湾', category: '禅修体验', summary: '禅坐抄经体验空间', highlight: '静心抄经，禅茶一味', lat: 31.40, lng: 120.08 },
  { id: 'NH-006', name: '鹿鸣谷', area: '拈花湾', category: '自然景观', summary: '山林幽静区', highlight: '远离喧嚣，听鹿鸣山涧', lat: 31.40, lng: 120.09 },
];

visitorRouter.get('/spots', (_req: Request, res: Response) => {
  res.json(ALL_SPOTS);
});

visitorRouter.get('/spots/:spotId', (req: Request, res: Response) => {
  const spot = ALL_SPOTS.find(s => s.id === req.params.spotId);
  if (!spot) return res.status(404).json({ error: '景点不存在' });
  res.json(spot);
});

// ============ Q&A (with SSE streaming) ============

visitorRouter.post('/qa', async (req: Request, res: Response) => {
  try {
    const { query, session_id } = req.body;
    if (!query) {
      return res.status(400).json({ error: '请输入问题' });
    }

    const sessionId = session_id || uuidv4();
    const startTime = Date.now();

    // Check if client wants streaming
    const acceptSSE = req.headers.accept?.includes('text/event-stream');

    if (acceptSSE) {
      // SSE Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      res.write(`data: ${JSON.stringify({ type: 'session', session_id: sessionId })}\n\n`);

      let fullAnswer = '';
      try {
        for await (const chunk of streamRAGQuery(query, sessionId)) {
          fullAnswer += chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        }
      } catch (streamErr) {
        console.error('Stream error:', streamErr);
      }

      // Save conversation
      const elapsed = Date.now() - startTime;
      const emotion = await detectEmotion(query, fullAnswer);
      saveConversation({
        id: uuidv4(),
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        query,
        answer: fullAnswer,
        emotion,
        used_llm: isLLMAvailable(),
        response_time_ms: elapsed,
      });

      // Broadcast to admin WebSocket subscribers
      broadcastQueryEvent({
        query_short: query.slice(0, 40),
        emotion,
        response_time_ms: elapsed,
        used_llm: isLLMAvailable(),
      });

      const spots = extractSpots(fullAnswer);
      res.write(`data: ${JSON.stringify({
        type: 'done',
        session_id: sessionId,
        emotion,
        related_spots: spots,
        image_urls: getImageUrls(query, fullAnswer),
        used_llm: isLLMAvailable(),
        model: getActiveModelName(),
      })}\n\n`);
      res.end();
    } else {
      // Non-streaming response
      const result = await queryRAG(query, sessionId);

      // Save conversation
      const elapsed = Date.now() - startTime;
      saveConversation({
        id: uuidv4(),
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        query,
        answer: result.answer,
        emotion: result.emotion,
        used_llm: result.usedLLM,
        response_time_ms: elapsed,
      });

      // Broadcast to admin WebSocket subscribers
      broadcastQueryEvent({
        query_short: query.slice(0, 40),
        emotion: result.emotion,
        response_time_ms: elapsed,
        used_llm: result.usedLLM,
      });

      res.json({
        answer: result.answer,
        session_id: sessionId,
        emotion: result.emotion,
        related_spots: result.relatedSpots,
        image_urls: getImageUrls(query, result.answer),
        used_llm: result.usedLLM,
        model: getActiveModelName(),
        retrieved_chunks: result.retrievedChunks,
      });
    }
  } catch (error: any) {
    console.error('QA error:', error);
    res.status(500).json({ error: '问答处理失败' });
  }
});

// ============ TTS ============

visitorRouter.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text, voice: reqVoice, rate, pitch } = req.body;
    if (!text) {
      return res.status(400).json({ error: '请输入文本' });
    }
    const result = await textToSpeech(text, {
      voice: reqVoice || 'zh-CN-XiaoxiaoNeural',
      rate: rate || '+0%',
      pitch: pitch || '+0Hz',
    });

    if (result) {
      res.json({
        audio_base64: result.audioBase64,
        duration: result.duration,
        visemes: result.visemes,
        voice: result.voice,
        format: 'mp3',
      });
    } else {
      res.json({ audio_base64: null, message: 'TTS不可用，请使用文本模式' });
    }
  } catch (error: any) {
    console.error('TTS error:', error);
    res.json({ audio_base64: null, error: 'TTS生成失败' });
  }
});

// ============ Session ============

visitorRouter.post('/session/init', (_req: Request, res: Response) => {
  const sessionId = uuidv4();
  res.json({
    session_id: sessionId,
    welcome_message: '您好！我是灵山胜境的AI数字人导游「灵小禅」🌸\n\n我可以为您讲解景区历史、推荐游览路线、回答各种问题。\n请问有什么可以帮您的？',
    llm_available: isLLMAvailable(),
    model: getActiveModelName(),
  });
});

// ============ Recommendations ============

const INTEREST_ROUTES: Record<string, any[]> = {
  '历史': [
    { spot_id: 'LS-010', name: '祥符禅寺', reason: '千年古刹，灵山佛教文化源头', visit_duration: 40 },
    { spot_id: 'LS-011', name: '灵山大佛', reason: '五方五佛之东方大佛，历史意义重大', visit_duration: 60 },
    { spot_id: 'LS-013', name: '灵山梵宫', reason: '佛教艺术殿堂，世界佛教论坛会址', visit_duration: 60 },
    { spot_id: 'LS-016', name: '无尽意斋', reason: '赵朴初纪念馆，了解灵山渊源', visit_duration: 30 },
    { spot_id: 'LS-008', name: '阿育王柱', reason: '佛教传播的历史象征', visit_duration: 15 },
  ],
  '文化': [
    { spot_id: 'LS-011', name: '灵山大佛', reason: '佛教文化核心象征，88米青铜立佛', visit_duration: 60 },
    { spot_id: 'LS-013', name: '灵山梵宫', reason: '佛教艺术的卢浮宫，非遗艺术瑰宝', visit_duration: 60 },
    { spot_id: 'LS-014', name: '五印坛城', reason: '藏传佛教文化体验，小布达拉宫', visit_duration: 45 },
    { spot_id: 'LS-006', name: '九龙灌浴', reason: '佛陀诞生故事再现，震撼动态表演', visit_duration: 30 },
    { spot_id: 'LS-012', name: '佛教文化博览馆', reason: '万佛朝宗，佛教文化深度体验', visit_duration: 40 },
  ],
  '自然': [
    { spot_id: 'LS-005', name: '菩提大道', reason: '250米印度菩提拱廊，禅意漫步', visit_duration: 20 },
    { spot_id: 'LS-011', name: '灵山大佛', reason: '登顶俯瞰太湖全景，佛光普照', visit_duration: 60 },
    { spot_id: 'NH-002', name: '梵天花海', reason: '30000㎡四季花海，自然美景', visit_duration: 40 },
    { spot_id: 'LS-015', name: '曼飞龙塔', reason: '白塔园林景观，异域风情', visit_duration: 20 },
    { spot_id: 'NH-006', name: '鹿鸣谷', reason: '山林幽静，自然禅意', visit_duration: 30 },
  ],
  '建筑': [
    { spot_id: 'LS-013', name: '灵山梵宫', reason: '鲁班奖建筑杰作，7.2万㎡艺术殿堂', visit_duration: 60 },
    { spot_id: 'LS-014', name: '五印坛城', reason: '藏式碉楼建筑，金顶红墙', visit_duration: 45 },
    { spot_id: 'LS-015', name: '曼飞龙塔', reason: '南传佛教建筑代表，九塔组合', visit_duration: 20 },
    { spot_id: 'LS-004', name: '五智门', reason: '汉白玉石牌坊，佛教建筑艺术', visit_duration: 15 },
    { spot_id: 'LS-002', name: '五明桥', reason: '五桥并列，桥梁建筑之美', visit_duration: 15 },
  ],
  '祈福': [
    { spot_id: 'LS-011', name: '灵山大佛', reason: '抱佛脚祈福，216级登云道', visit_duration: 60 },
    { spot_id: 'LS-009', name: '百子戏弥勒', reason: '摸弥勒肚皮，享一生福气', visit_duration: 15 },
    { spot_id: 'LS-006', name: '九龙灌浴', reason: '接取祈福圣水，吉祥安康', visit_duration: 30 },
    { spot_id: 'LS-010', name: '祥符禅寺', reason: '撞钟祈福，聆听祥符禅钟', visit_duration: 30 },
    { spot_id: 'LS-003', name: '佛足坛', reason: '触摸佛足，吉祥祈福', visit_duration: 10 },
  ],
};

visitorRouter.post('/recommend', (req: Request, res: Response) => {
  const { interests = ['文化'], duration = 4 } = req.body;

  // Pick interest route
  let fullRoute = INTEREST_ROUTES['文化'];
  for (const interest of interests) {
    if (INTEREST_ROUTES[interest]) { fullRoute = INTEREST_ROUTES[interest]; break; }
  }

  const fullDuration = fullRoute.reduce((sum, i) => sum + i.visit_duration, 0);

  // Three tiers: ~2h (top 2-3), ~4h (top 5-6), ~6h (all)
  let route: typeof fullRoute;
  let totalDuration: number;
  let tier: string;

  const maxMin = duration * 60;

  if (maxMin >= fullDuration) {
    // Full route fits
    route = fullRoute;
    totalDuration = fullDuration;
    tier = '深度体验';
  } else if (maxMin >= fullDuration * 0.6) {
    // Can fit most — take top spots sorted by duration
    let acc = 0;
    route = fullRoute.filter(item => {
      if (acc + item.visit_duration <= maxMin) { acc += item.visit_duration; return true; }
      return false;
    });
    totalDuration = acc;
    tier = '经典游览';
  } else {
    // Short time — take top 2-3 must-see spots
    route = fullRoute.slice(0, Math.min(3, fullRoute.length));
    // If still too long, keep only the top 2
    let acc = route.reduce((sum, i) => sum + i.visit_duration, 0);
    if (acc > maxMin) {
      route = fullRoute.slice(0, 2);
      acc = route.reduce((sum, i) => sum + i.visit_duration, 0);
    }
    totalDuration = acc;
    tier = '精华速览';
  }

  res.json({
    route,
    total_duration: totalDuration,
    tier,
    available_tiers: {
      '精华速览 ~2h': Math.round(fullRoute.slice(0, 3).reduce((s, i) => s + i.visit_duration, 0)),
      '经典游览 ~4h': Math.round(fullRoute.slice(0, Math.ceil(fullRoute.length * 0.7)).reduce((s, i) => s + i.visit_duration, 0)),
      '深度体验 ~6h': fullDuration,
    },
    tips: fullDuration > 300
      ? '建议上午9点前入园；全程约5-6小时含餐饮休息；穿着舒适运动鞋。'
      : fullDuration > 180
        ? '建议上午9-10点入园；游览节奏适中；可在大佛脚下多停留。'
        : '时间紧凑可选精华景点；下次再来深入探索！',
  });
});

// ============ Feedback ============

visitorRouter.post('/feedback', (req: Request, res: Response) => {
  const { session_id, rating, comment } = req.body;
  saveFeedback({
    id: uuidv4(),
    session_id: session_id || 'anon',
    timestamp: new Date().toISOString(),
    rating: rating || 5,
    comment: comment || '',
  });
  res.json({ status: 'ok', message: '感谢您的反馈！' });
});

// ============ Conversation Feedback (public, no auth required) ============

visitorRouter.post('/conversation-feedback', (req: Request, res: Response) => {
  const { session_id, feedback } = req.body;
  console.log(`[visitor-feedback] session_id=${session_id}, feedback=${feedback}`);
  if (!session_id || !feedback) {
    return res.status(400).json({ error: '缺少参数' });
  }
  updateConversationFeedback(session_id, feedback as 'helpful' | 'unhelpful');
  res.json({ status: 'ok' });
});

// ============ Hot Questions ============

visitorRouter.get('/hot-questions', (_req: Request, res: Response) => {
  const dbHot = getDbHotQuestions(7);
  if (dbHot.length >= 5) {
    res.json(dbHot);
  } else {
    // Seed with defaults if no data yet
    res.json([
      { question: '灵山大佛有多高？', count: 0 },
      { question: '门票价格是多少？', count: 0 },
      { question: '九龙灌浴表演时间？', count: 0 },
      { question: '梵宫有什么好看的？', count: 0 },
      { question: '游览路线推荐', count: 0 },
      { question: '灵山的历史渊源？', count: 0 },
    ]);
  }
});

// ============ Vision — Multimodal Spot Recognition ============

visitorRouter.post('/vision/recognize', async (req: Request, res: Response) => {
  try {
    const { image_base64 } = req.body;
    if (!image_base64) return res.status(400).json({ error: '请上传图片' });
    if (!isLLMAvailable()) return res.status(503).json({ error: 'AI模型不可用，请配置API密钥' });

    const systemPrompt = `你是灵山胜境景区的AI导览专家。请仔细观察这张图片，判断最可能是灵山胜境或拈花湾禅意小镇的哪个景点。

灵山胜境景点：灵山大佛(88米青铜立佛，右手施无畏印左手与愿印)、九龙灌浴(莲花太子佛像+九龙喷泉)、灵山梵宫(金顶建筑群+五座莲花塔)、五印坛城(藏式红墙金顶)、祥符禅寺(唐代风格红墙黛瓦)、灵山大照壁(青石浮雕照壁)、菩提大道(菩提树拱廊)、百子戏弥勒(青铜弥勒+童子群雕)、曼飞龙塔(白色九塔组合)、无尽意斋(四合院纪念馆)、佛足坛(巨型青铜佛足印)、五智门(汉白玉牌坊)、降魔浮雕(石雕壁画)、阿育王柱(花岗岩石柱)、佛教文化博览馆(室内展馆)。

拈花湾景点：拈花广场(拈花微笑雕塑)、梵天花海(大面积花田)、香月花街(仿古商业街)、五灯湖(水景+灯光秀)、拈花堂(禅意建筑)、鹿鸣谷(山林步道)。

请返回纯JSON（不要markdown代码块）：{"spot_name":"景点名称","confidence":0.0-1.0,"description":"100字以内的景点简介","nearby_spots":["附近景点1","附近景点2"]}`;

    const result = await callMultimodalLLM(
      systemPrompt,
      '请识别这张图片中的灵山景区景点，并返回JSON格式结果。',
      image_base64,
      { temperature: 0.2, max_tokens: 350 }
    );

    if (!result) {
      return res.json({
        recognized: false,
        spot_name: '未能识别',
        confidence: 0,
        description: '请尝试拍摄更清晰的景点照片，或直接输入景点名称查询。',
        nearby_spots: [],
      });
    }

    // Try to parse JSON from response (handle markdown code blocks)
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        res.json({ recognized: true, ...parsed });
      } else {
        res.json({
          recognized: true,
          spot_name: '灵山胜境',
          confidence: 0.5,
          description: result.slice(0, 200),
          nearby_spots: [],
        });
      }
    } catch {
      res.json({
        recognized: true,
        spot_name: '灵山胜境',
        confidence: 0.5,
        description: result.slice(0, 200),
        nearby_spots: [],
      });
    }
  } catch (e: any) {
    res.status(500).json({ error: '识别失败', detail: e.message });
  }
});

// ============ Status ============

visitorRouter.get('/status', (_req: Request, res: Response) => {
  const kbStats = getKnowledgeStats();
  const convStats = getConversationStats();
  res.json({
    llm_available: isLLMAvailable(),
    model: getActiveModelName(),
    tts_available: true,
    asr_available: true,
    knowledge_chunks: kbStats.chunkCount,
    knowledge_indexed: kbStats.isIndexed,
    total_conversations: convStats.total,
  });
});

// ============ Nearby Spots (GPS) ============

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

visitorRouter.get('/nearby', (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const radius = parseFloat(req.query.radius as string) || 2000; // default 2km

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: '请提供有效的经纬度坐标 (lat, lng)' });
  }

  const nearby = ALL_SPOTS
    .map(spot => ({
      ...spot,
      distance: Math.round(haversineDistance(lat, lng, spot.lat, spot.lng)),
    }))
    .filter(s => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  const nearest = nearby[0] || null;

  res.json({
    location: { lat, lng },
    radius_m: radius,
    nearest_spot: nearest ? {
      id: nearest.id,
      name: nearest.name,
      area: nearest.area,
      distance_m: nearest.distance,
      direction_hint: nearest.distance < 50 ? '您已到达' :
        nearest.distance < 200 ? '步行2-3分钟' :
        nearest.distance < 500 ? '步行5-8分钟' :
        nearest.distance < 1000 ? '步行约15分钟' :
        '建议搭乘景区接驳车',
      summary: nearest.summary,
      highlight: nearest.highlight,
    } : null,
    nearby_spots: nearby.slice(0, 10).map(s => ({
      id: s.id,
      name: s.name,
      area: s.area,
      distance_m: s.distance,
      category: s.category,
    })),
    total_nearby: nearby.length,
    tip: nearest
      ? `您当前位置距离${nearest.name}约${nearest.distance}米，${nearest.distance < 50 ? '已到达！' : nearest.distance < 200 ? '步行即达。' : nearest.distance < 500 ? '步行几分钟即达。' : '建议搭乘景区接驳车前往。'}`
      : '附近暂未发现景点，请确认您位于灵山胜境景区范围内。',
  });
});

// ============ Helpers ============

// ============ Nearby Facilities (Baidu Map POI) ============

const FACILITY_KEYWORDS: Record<string, string[]> = {
  'spots': ['景点'],
  'toilet': ['公共厕所'],
  'shop': ['商店'],
  'nursery': ['母婴室'],
  'entrance': ['入口'],
  'visitor_center': ['游客中心'],
  'ticket': ['售票处'],
  'hotel': ['酒店'],
  'rest': ['休息区'],
  'sightseeing': ['观光车站'],
};

const BAIDU_MAP_AK = 'ZT4ycNFGJ6Q5JzZs6IRCXTRjhQGtHpIx';

visitorRouter.get('/nearby-facilities', async (req: Request, res: Response) => {
  try {
    // Force Ling Shan scenic area center coordinates (ignore frontend params)
    const CENTER_LAT = 31.4269;
    const CENTER_LNG = 120.1009;
    const type = req.query.type as string;

    if (!type || !FACILITY_KEYWORDS[type]) {
      return res.status(400).json({ error: '请提供有效的设施类型' });
    }

    console.log(`[nearby-facilities] 使用灵山景区中心坐标: lat=${CENTER_LAT}, lng=${CENTER_LNG}, type=${type}`);

    const keywords = FACILITY_KEYWORDS[type];
    let allResults: any[] = [];

    for (const keyword of keywords) {
      const url = `https://api.map.baidu.com/place/v2/search?query=${encodeURIComponent(keyword)}&location=${CENTER_LAT},${CENTER_LNG}&radius=3000&output=json&ak=${BAIDU_MAP_AK}`;
      console.log(`[nearby-facilities] 调用百度地图API: ${url}`);
      const response = await fetch(url);
      const data = await response.json();
      console.log(`[nearby-facilities] 百度地图API原始响应:`, JSON.stringify(data, null, 2));

      if (data.status === 0 && data.results) {
        const items = data.results.map((r: any) => {
          const itemLat = r.location?.lat;
          const itemLng = r.location?.lng;
          const dist = (itemLat && itemLng) ? Math.round(haversineDistance(CENTER_LAT, CENTER_LNG, itemLat, itemLng)) : 0;
          return {
            name: r.name,
            address: r.address || '',
            distance: dist,
            lat: itemLat,
            lng: itemLng,
            uid: r.uid || null,
          };
        });
        allResults = allResults.concat(items);
      }
    }

    // Sort by calculated distance, deduplicate by name
    allResults.sort((a, b) => a.distance - b.distance);
    const seen = new Set<string>();
    const unique = allResults.filter(item => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });

    console.log(`[nearby-facilities] 解析后的设施列表数量: ${unique.length}`);
    res.json({ facilities: unique.slice(0, 10) });
  } catch (error: any) {
    console.error('Baidu Map API error:', error);
    res.status(500).json({ error: '设施搜索失败' });
  }
});

async function detectEmotion(query: string, answer: string): Promise<string> {
  return analyzeEmotion(query);
}

function extractSpots(text: string): string[] {
  const names = ALL_SPOTS.map(s => s.name);
  return names.filter(n => text.includes(n));
}

// ============ Digital Human public config (no auth) ============

visitorRouter.get('/dh-config', (_req: Request, res: Response) => {
  const configPath = path.resolve(__dirname, '../../../../data/dh_config.json');
  let stylePreset = 'zen_red_gold';
  let voiceId = 'zh-CN-XiaoxiaoNeural';
  try {
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (saved.style_preset) stylePreset = saved.style_preset;
      if (saved.voice_id) voiceId = saved.voice_id;
    }
  } catch {}
  res.json({ style_preset: stylePreset, voice_id: voiceId });
});

export { visitorRouter };