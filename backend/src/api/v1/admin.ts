import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import {
  getConversationStats, getHotQuestions, getEmotionDistribution,
  getHourlyDistribution, getSatisfactionTrend, getFeedbackStats,
  getConversations, getFilteredConversations, getTopUnsatisfied,
  getVisitorLocationStats, getCategoryDistribution, updateConversationFeedback,
} from '../../db/store';
import { reindexKnowledgeBase, getKnowledgeStats, initKnowledgeBase } from '../../services/rag-service';
import { isLLMAvailable, getActiveModelName, callLLM, callMultimodalLLM } from '../../services/llm-service';

const adminRouter = Router();

// ============================================================
// Upload & Doc Processing
// ============================================================
const uploadDir = path.resolve(__dirname, '../../../../data/uploads');
const KB_DOCS_DIR = path.resolve(__dirname, '../../../../data/kb_docs');
try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
try { fs.mkdirSync(KB_DOCS_DIR, { recursive: true }); } catch {}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

/** Parse uploaded docx and extract text for knowledge base */
async function parseDocument(filePath: string, ext: string): Promise<string> {
  // Try mammoth for docx
  if (ext === '.docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (e) {
      console.error('Mammoth parse error:', e);
    }
  }
  // Try xlsx for Excel files
  if (ext === '.xlsx' || ext === '.xls') {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.readFile(filePath);
      let text = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        text += XLSX.utils.sheet_to_csv(sheet) + '\n';
      }
      return text;
    } catch (e) {
      console.error('XLSX parse error:', e);
    }
  }
  // Plain text
  if (ext === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return '';
}

// ============ Dashboard ============

adminRouter.get('/dashboard/summary', (_req: Request, res: Response) => {
  const stats = getConversationStats();
  const feedback = getFeedbackStats();
  const hotQuestions = getHotQuestions(7);
  const hourlyDist = getHourlyDistribution(7);
  const trend = getSatisfactionTrend(7);
  const emotionDist = getEmotionDistribution(7);

  const sentimentDist = {
    positive: (emotionDist.happy || 0) + (emotionDist.greet || 0),
    neutral: (emotionDist.explain || 0) + (emotionDist.think || 0) + (emotionDist.farewell || 0),
    negative: (emotionDist.sorry || 0) + (emotionDist.angry || 0),
  };

  res.json({
    today_queries: stats.today,
    week_queries: stats.week,
    monthly_queries: stats.month,
    total_queries: stats.total,
    avg_satisfaction: Math.round(feedback.avg_rating * 20) || 0,
    total_spots: 22, // LS spots (16) + NH spots (6)
    total_knowledge_chunks: getKnowledgeStats().chunkCount,
    knowledge_indexed: getKnowledgeStats().isIndexed,
    model: getActiveModelName(),
    top_hot_questions: hotQuestions.slice(0, 10),
    satisfaction_trend: trend,
    hourly_distribution: hourlyDist,
    sentiment_distribution: sentimentDist,
    feedback_total: feedback.total,
  });
});

// ============ Sentiment Reports ============

adminRouter.get('/reports/sentiment', async (req: Request, res: Response) => {
  const periodStr = (req.query.period as string) || 'week';
  const days = periodStr === 'day' ? 1 : periodStr === 'month' ? 30 : 7;
  const stats = getConversationStats();
  const emotionDist = getEmotionDistribution(days);
  const hotQuestions = getHotQuestions(days);
  const feedback = getFeedbackStats();

  const positive = (emotionDist.happy || 0) + (emotionDist.greet || 0);
  const neutral = (emotionDist.explain || 0) + (emotionDist.think || 0) + (emotionDist.farewell || 0);
  const negative = (emotionDist.sorry || 0) + (emotionDist.angry || 0);
  const total = positive + neutral + negative || 1;

  // Get top mentioned spots from recent conversations
  const recentConvs = getConversations(200);
  const spotMentions: Record<string, number> = {};
  const spotNames = ['灵山大佛','九龙灌浴','灵山梵宫','五印坛城','祥符禅寺','灵山大照壁','菩提大道','百子戏弥勒','曼飞龙塔','无尽意斋','佛足坛','五智门','降魔浮雕','阿育王柱','拈花广场','梵天花海','香月花街','五灯湖','灵山精舍'];
  for (const conv of recentConvs) {
    for (const spot of spotNames) {
      if ((conv.query + conv.answer).includes(spot)) {
        spotMentions[spot] = (spotMentions[spot] || 0) + 1;
      }
    }
  }
  const topSpots = Object.entries(spotMentions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, mention_count: count }));

  // Get sample negative-feedback conversations for deeper analysis
  const sampleNegatives = recentConvs
    .filter(c => c.emotion === 'sorry' || c.emotion === 'angry' || (c as any).feedback === 'unhelpful')
    .slice(0, 5)
    .map(c => ({ query: c.query?.slice(0, 80), answer: c.answer?.slice(0, 80) }));

  const count = days === 7 ? stats.week : days === 1 ? stats.today : stats.month;
  const periodLabel = days === 1 ? '今日' : days === 7 ? '本周' : '本月';
  const posPct = Math.round((positive / total) * 100);
  const neuPct = Math.round((neutral / total) * 100);
  const negPct = Math.round((negative / total) * 100);

  // ── AI Summary (fast, < 5s) ──────────────────────────────────
  let summary = '';
  if (isLLMAvailable()) {
    const topQs = hotQuestions.slice(0, 5).map((q: any) => `${q.question}(${q.count}次)`).join('、');
    const topSps = topSpots.slice(0, 5).map((s: any) => `${s.name}(${s.mention_count}次)`).join('、');

    try {
      summary = await callLLM([
        {
          role: 'system',
          content: `你是景区数据分析师。根据数据写一份简洁的分析报告（200字以内），包含：1.总体评价 2.关键发现 3.一条改进建议。用Markdown格式。`,
        },
        {
          role: 'user',
          content: `${periodLabel}数据：咨询${count}次，正面${posPct}% 中性${neuPct}% 负面${negPct}%。热门问题：${topQs}。热门景点：${topSps}。`,
        },
      ], { temperature: 0.3, max_tokens: 200 });
    } catch {
      summary = '';
    }
  }

  if (!summary) {
    summary = `### 📊 ${periodLabel}概况\n\n咨询 **${count}** 次，正面 **${posPct}%** / 中性 **${neuPct}%** / 负面 **${negPct}%**。\n\n### 🔥 热门话题\n${hotQuestions.slice(0, 5).map((q: any, i: number) => `${i + 1}. ${q.question}（${q.count}次）`).join('\n')}\n\n### 🏛️ 热门景点\n${topSpots.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.name}（${s.mention_count}次）`).join('\n')}`;
  }

  res.json({
    period_type: periodStr,
    period_start: new Date(Date.now() - days * 86400000).toISOString().split('T')[0],
    period_end: new Date().toISOString().split('T')[0],
    total_queries: count,
    avg_sentiment: posPct,
    sentiment_distribution: {
      positive: posPct,
      neutral: neuPct,
      negative: negPct,
    },
    hot_questions: hotQuestions,
    top_spots: topSpots.length > 0 ? topSpots : [
      { name: '灵山大佛', mention_count: 0 },
      { name: '灵山梵宫', mention_count: 0 },
      { name: '九龙灌浴', mention_count: 0 },
    ],
    summary,
  });
});

// ============ LLM Sentiment Analysis ============

adminRouter.post('/reports/analyze-sentiment', async (req: Request, res: Response) => {
  if (!isLLMAvailable()) {
    return res.status(503).json({ error: 'LLM 不可用' });
  }
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: '请提供待分析文本' });

    const result = await callLLM([
      { role: 'system', content: '你是一个情感分析专家。分析以下游客与AI导游的对话，判断情感倾向。只返回JSON格式：{"sentiment":"positive/neutral/negative","confidence":0.0-1.0,"topics":["话题1","话题2"]}。不要返回其他内容。' },
      { role: 'user', content: text },
    ], { temperature: 0.1, max_tokens: 150 });

    try {
      const parsed = JSON.parse(result);
      res.json(parsed);
    } catch {
      res.json({ sentiment: 'neutral', confidence: 0.5, topics: [] });
    }
  } catch (e: any) {
    res.status(500).json({ error: '分析失败', detail: e.message });
  }
});

// ============ Knowledge Base Management ============

adminRouter.post('/knowledge/documents', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '请上传文件' });

  const ext = path.extname(file.originalname).toLowerCase();
  let text = '';
  let status = 'uploaded';
  let docId = '';

  // Try to parse and index immediately
  try {
    text = await parseDocument(file.path, ext);
    if (text && text.length > 50) {
      // Save parsed text to kb_docs for re-indexing
      docId = uuidv4();
      const docPath = path.join(KB_DOCS_DIR, `${docId}.txt`);
      fs.writeFileSync(docPath, text);
      status = 'indexed';
    }
  } catch (e) {
    console.error('Document parsing error:', e);
    status = 'parse_failed';
  }

  res.json({
    id: file.filename,
    title: file.originalname,
    filename: file.filename,
    size: file.size,
    docId,
    status,
    text_length: text.length,
    message: status === 'indexed'
      ? '文档已解析并加入知识库。点击"重建索引"使其生效。'
      : status === 'parse_failed'
        ? '文档解析失败，请确认文件格式正确。'
        : '文件已上传，但内容较短未自动索引。',
  });
});

adminRouter.get('/knowledge/documents', (_req: Request, res: Response) => {
  const docs: Array<{ id: string; name: string; size: number; date: string; status: string }> = [];
  try {
    // 1. Source knowledge files (data/raw/)
    const rawDir = path.resolve(__dirname, '../../../../data/raw');
    if (fs.existsSync(rawDir)) {
      const rawEntries = fs.readdirSync(rawDir);
      for (const entry of rawEntries) {
        if (entry.startsWith('.')) continue;
        if (!entry.endsWith('.txt') && !entry.endsWith('.docx') && !entry.endsWith('.xlsx')) continue;
        const stat = fs.statSync(path.join(rawDir, entry));
        docs.push({
          id: entry,
          name: entry,
          size: stat.size,
          date: stat.mtime.toISOString().split('T')[0],
          status: 'indexed',
        });
      }
    }
    // 2. Uploaded files
    if (fs.existsSync(uploadDir)) {
      const entries = fs.readdirSync(uploadDir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const stat = fs.statSync(path.join(uploadDir, entry));
        docs.push({
          id: entry,
          name: entry,
          size: stat.size,
          date: stat.mtime.toISOString().split('T')[0],
          status: 'uploaded',
        });
      }
    }
    // 3. Parsed KB docs
    if (fs.existsSync(KB_DOCS_DIR)) {
      const kbEntries = fs.readdirSync(KB_DOCS_DIR);
      for (const entry of kbEntries) {
        if (entry.startsWith('.')) continue;
        const stat = fs.statSync(path.join(KB_DOCS_DIR, entry));
        if (!docs.find(d => d.name === entry)) {
          docs.push({
            id: entry,
            name: entry,
            size: stat.size,
            date: stat.mtime.toISOString().split('T')[0],
            status: 'indexed',
          });
        }
      }
    }
  } catch {}
  res.json(docs);
});

adminRouter.delete('/knowledge/documents/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  let deleted = false;
  try {
    const p1 = path.join(uploadDir, id);
    const p2 = path.join(KB_DOCS_DIR, id);
    if (fs.existsSync(p1)) { fs.unlinkSync(p1); deleted = true; }
    if (fs.existsSync(p2)) { fs.unlinkSync(p2); deleted = true; }
  } catch {}
  if (deleted) {
    res.json({ status: 'ok', message: '文档已删除。请重建索引使变更生效。' });
  } else {
    res.status(404).json({ error: '文档不存在' });
  }
});

adminRouter.post('/knowledge/refresh-index', async (_req: Request, res: Response) => {
  try {
    const result = await reindexKnowledgeBase();
    res.json({
      status: 'ok',
      message: `索引重建完成：${result.chunkCount} 个分块`,
      ...result,
    });
  } catch (e: any) {
    res.status(500).json({ error: '索引刷新失败', detail: e.message });
  }
});

adminRouter.get('/knowledge/stats', (_req: Request, res: Response) => {
  res.json(getKnowledgeStats());
});

adminRouter.get('/knowledge/test-qa', async (req: Request, res: Response) => {
  const query = (req.query.query as string) || '';
  if (!query.trim()) {
    return res.json({ query: '', results: [], hint: '请输入测试问题' });
  }
  try {
    const { searchStructured } = await import('../../services/structured-knowledge');
    const results = searchStructured(query, 5);
    res.json({
      query,
      retrieved_chunks: results.length,
      results: results.map(r => ({
        id: r.spotId,
        spot: r.spotName,
        field: r.fieldLabel,
        text: r.text,
        score: r.score,
      })),
    });
  } catch (e: any) {
    res.json({ query, error: '检索失败：' + (e.message || '未知错误') });
  }
});

// ============ Image Recognition (Multimodal) ============

adminRouter.post('/vision/recognize', upload.single('image'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: '请上传图片' });

  if (!isLLMAvailable()) {
    return res.status(503).json({ error: 'AI模型不可用，请配置API密钥' });
  }

  try {
    const imageBuffer = fs.readFileSync(file.path);
    const imageBase64 = imageBuffer.toString('base64');

    const systemPrompt = `你是灵山胜境景区的AI导览专家。请观察图片，判断最可能是灵山胜境或拈花湾的哪个景点，并简要介绍。`;

    const result = await callMultimodalLLM(
      systemPrompt,
      '请识别这张图片中的景点，并给出100字以内的简介。',
      imageBase64,
      { temperature: 0.3, max_tokens: 400 }
    );

    res.json({
      recognized: !!result,
      result: result || '未能识别该图片，请尝试更清晰的照片。',
      filename: file.originalname,
    });
  } catch (e: any) {
    res.status(500).json({ error: '识别失败', detail: e.message });
  }
});

// ============ Digital Human Configuration ============

adminRouter.get('/digital-human/appearance', (_req: Request, res: Response) => {
  const configPath = path.resolve(__dirname, '../../../../data/dh_config.json');
  let config: any = {
    id: 'config_001',
    name: '灵小禅',
    model_type: 'pixi_live2d',
    voice_speed: 1.0,
    voice_pitch: 1.0,
    voice_id: 'zh-CN-XiaoxiaoNeural',
    emotion_presets: {
      happy: { eyeScale: 0.85, mouthOffset: 3, blushAlpha: 0.5 },
      explain: { eyeScale: 1.0, mouthOffset: 0, blushAlpha: 0.2 },
      think: { eyeScale: 1.1, mouthOffset: -2, blushAlpha: 0.1 },
      greet: { eyeScale: 0.8, mouthOffset: 2, blushAlpha: 0.6 },
      farewell: { eyeScale: 0.9, mouthOffset: 1, blushAlpha: 0.3 },
      sorry: { eyeScale: 1.05, mouthOffset: -1, blushAlpha: 0.15 },
    },
    clothes: { top: 'traditional_hanfu', color: 'red_gold' },
    background_scene: 'lingshan_panorama',
    primary_color: '#c41d7f',
    is_active: true,
  };
  try {
    if (fs.existsSync(configPath)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    }
  } catch {}
  res.json(config);
});

adminRouter.put('/digital-human/appearance', (req: Request, res: Response) => {
  const configPath = path.resolve(__dirname, '../../../../data/dh_config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ status: 'ok', message: '数字人配置已保存' });
  } catch (e: any) {
    res.status(500).json({ error: '保存失败', detail: e.message });
  }
});

// ============ Conversations Detail ============

adminRouter.get('/conversations', (req: Request, res: Response) => {
  const { startDate, endDate, category, feedback, keyword, page, pageSize } = req.query;
  const limit = parseInt(pageSize as string) || 20;
  const offset = ((parseInt(page as string) || 1) - 1) * limit;

  const result = getFilteredConversations({
    startDate: startDate as string,
    endDate: endDate as string,
    category: category as string,
    feedback: feedback as string,
    keyword: keyword as string,
    limit,
    offset,
  });

  res.json({
    items: result.items,
    total: result.total,
    page: parseInt(page as string) || 1,
    pageSize: limit,
  });
});

// ============ Conversations Export (CSV) ============

adminRouter.get('/conversations/export', (req: Request, res: Response) => {
  const { startDate, endDate, category } = req.query;
  const result = getFilteredConversations({
    startDate: startDate as string,
    endDate: endDate as string,
    category: category as string,
    limit: 5000,
    offset: 0,
  });

  // Build CSV
  const headers = ['时间', '会话ID', '问题分类', '用户问题', 'AI回复', '情感', '耗时(ms)', '评价'];
  const rows = result.items.map(c => [
    c.timestamp,
    c.session_id,
    c.category || 'other',
    `"${(c.query || '').replace(/"/g, '""')}"`,
    `"${(c.answer || '').replace(/"/g, '""')}"`,
    c.emotion,
    c.response_time_ms,
    c.feedback || '',
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=conversations_${new Date().toISOString().split('T')[0]}.csv`);
  // Add BOM for Excel Chinese support
  res.send('\uFEFF' + csv);
});

// ============ Top Unsatisfied Questions ============

adminRouter.get('/top-unsatisfied', (_req: Request, res: Response) => {
  const items = getTopUnsatisfied(10);
  res.json(items);
});

// ============ Visitor Location Stats ============

adminRouter.get('/visitor-locations', (_req: Request, res: Response) => {
  const locations = getVisitorLocationStats();
  res.json(locations);
});

// ============ Category Distribution ============

adminRouter.get('/category-distribution', (_req: Request, res: Response) => {
  const dist = getCategoryDistribution();
  res.json(dist);
});

// ============ Update Feedback ============

adminRouter.post('/conversations/feedback', (req: Request, res: Response) => {
  const { session_id, feedback } = req.body;
  if (!session_id || !feedback) {
    return res.status(400).json({ error: '缺少参数' });
  }
  updateConversationFeedback(session_id, feedback);
  res.json({ status: 'ok' });
});

export { adminRouter };
