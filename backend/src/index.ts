import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';

import { apiRouter } from './api/v1/router';
import { initKnowledgeBase, getKnowledgeStats } from './services/rag-service';
import { isLLMAvailable, getActiveModelName } from './services/llm-service';
import { checkVectorHealth } from './services/vector-search-service';
import { addClient } from './services/websocket-service';
import { getIndexStats } from './services/structured-knowledge';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '8000');

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.resolve(__dirname, '../../data/uploads')));

// Serve frontend
const frontendDist = path.resolve(__dirname, '../../frontend-dist');
app.use(express.static(frontendDist));

// API routes
app.use('/api/v1', apiRouter);

// Health check
app.get('/health', (_req, res) => {
  const kb = getKnowledgeStats();
  const structured = getIndexStats();
  res.json({
    status: 'ok',
    service: '灵山胜境 AI 数字人导游',
    version: '2.2.0',
    llm: isLLMAvailable() ? getActiveModelName() : 'offline',
    knowledge_chunks: kb.chunkCount,
    knowledge_indexed: kb.isIndexed,
    vector_search: kb.vectorAvailable,
    structured_spots: structured.spotCount,
    structured_fields: structured.fieldDocCount,
  });
});

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: '服务器内部错误', detail: err.message });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║  🏯 灵山胜境 AI 数字人导游系统  v2.2              ║');
  console.log('  ║                                                  ║');
  console.log(`  ║  游客端:    http://localhost:${PORT}                 ║`);
  console.log(`  ║  管理后台:  http://localhost:${PORT}/admin/login     ║`);
  console.log(`  ║  API:       http://localhost:${PORT}/api/v1          ║`);
  console.log(`  ║  Health:    http://localhost:${PORT}/health          ║`);
  console.log('  ║                                                  ║');
  console.log(`  ║  LLM:       ${isLLMAvailable() ? getActiveModelName() : '离线模式'}  ║`);
  console.log('  ║  默认账号:  admin / lingshan2026                 ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');

  // Initialize knowledge base in background
  console.log('[Init] 正在初始化知识库...');
  initKnowledgeBase().then(result => {
    console.log(`[Init] 知识库就绪：${result.chunkCount} 个分块，向量索引：${result.indexed ? '✅' : '⚠️ 未启用（使用关键词匹配）'}`);
  }).catch(err => {
    console.error('[Init] 知识库初始化失败:', err);
  });
});

// WebSocket for real-time dashboard updates and voice streaming
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  // Heartbeat to prevent proxy/network timeouts
  const heartbeat = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    } else {
      clearInterval(heartbeat);
    }
  }, 30000);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'subscribe_admin') {
        addClient(ws, 'admin');
        ws.send(JSON.stringify({ type: 'connected', role: 'admin', message: '管理端实时连接已建立' }));
      } else if (msg.type === 'subscribe_visitor') {
        addClient(ws, 'visitor');
        ws.send(JSON.stringify({ type: 'connected', role: 'visitor', message: '游客端连接已建立' }));
      }
    } catch {
      addClient(ws, 'visitor');
      ws.send(JSON.stringify({ type: 'connected', role: 'visitor', message: 'WebSocket 连接成功' }));
    }
  });

  ws.on('close', () => clearInterval(heartbeat));
  ws.on('error', () => clearInterval(heartbeat));
});

export { app };
