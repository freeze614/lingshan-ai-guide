# 🏯 灵山胜境 AI 数字人导游 · 灵小禅

基于大语言模型的智慧景区导游系统，面向**灵山胜境**景区提供 AI 数字人交互导览服务。支持文字问答、语音输入、TTS 语音播报、数字人形象展示（PNG 角色 + 呼吸灯动效），以及后台数据管理面板。

---

## 🖥️ 系统架构

```
lingshan-ai-guide/
├── backend/          # Node.js + Express 主服务 (port 8000)
│   ├── src/          # TypeScript 源码（API / RAG / LLM / WebSocket）
│   ├── scripts/      # TTS 服务 (Python)
│   ├── python/       # Python FastAPI 备用后端
│   ├── services/     # 向量检索服务 (Python, port 8002)
│   └── data/         # ChromaDB 向量库持久化目录
├── frontend/         # React 19 + Vite + Ant Design (dev port 5173)
│   └── src/pages/    # visitor（游客端）/ admin（管理端）
├── frontend-dist/    # 前端构建产物，后端静态托管
├── data/             # 运行时数据（对话记录、统计、配置）
└── docs/specs/       # 设计与优化方案文档
```

**核心服务：**

| 服务 | 端口 | 技术栈 | 说明 |
|------|------|--------|------|
| 主服务 | 8000 | Express + TypeScript | REST API、RAG 问答、静态文件托管 |
| TTS 服务 | 8001 | Python (edge-tts) | 微软 Edge TTS 语音合成 |
| 向量检索 | 8002 | Python (ChromaDB) | 知识库向量化检索 |

**前端页面：**
- 游客问答页 → `http://localhost:8000`
- 管理后台 → `http://localhost:8000/admin/login`（账号 `admin` / 密码 `lingshan2026`）

---

## 🚀 快速启动（Windows）

### 1. 环境要求

- **Node.js** ≥ 18（[下载 LTS 版](https://nodejs.org)）
- **Python** ≥ 3.10（[下载](https://www.python.org/downloads/)，安装时勾选 **Add Python to PATH**）
- 建议使用 Chrome 或 Edge 浏览器（语音功能需要）

### 2. 启动

双击项目根目录下的 **`启动数字人.bat`**，脚本会自动：

1. 安装 backend / frontend 依赖（首次，约 3-5 分钟）
2. 构建前端产物（首次）
3. 安装 Python 依赖 `edge-tts chromadb sentence-transformers`
4. 依次启动 TTS → 向量检索 → 主服务
5. 自动打开浏览器访问 `http://localhost:8000`

**停止服务：** 双击 **`停止服务.bat`**。

---

## 🔧 手动启动（开发调试）

```bash
# 1. 安装依赖
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 2. 构建前端
cd frontend && npm run build && cd ..

# 3. 安装 Python 依赖
pip install edge-tts chromadb sentence-transformers

# 4. 启动 TTS 服务
cd backend && python scripts/tts_server.py &

# 5. 启动向量检索服务
cd backend && python services/vector_service.py &

# 6. 启动主服务
cd backend && npm run dev
```

访问 `http://localhost:8000`。

### 前端开发模式（热更新）

```bash
cd frontend && npm run dev
# 访问 http://localhost:5173
```

---

## ⚙️ 环境变量

⚠️ **首次使用前必须配置 API Key，否则问答和图片识别功能无法使用。**

项目根目录已提供 `.env.example` 模板文件，请按以下步骤操作：

1. 将 `.env.example` **复制一份**，重命名为 `.env`
2. 打开 `.env`，将 `your-xxx-api-key-here` 替换为您自己的 API Key

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `DEEPSEEK_API_KEY` | DeepSeek 主力文本模型 Key | [platform.deepseek.com](https://platform.deepseek.com) 注册获取 |
| `DEEPSEEK_MODEL` | 主力文本模型 | `deepseek-chat` |
| `AGNES_API_KEY` | Agnes AI 多模态 + 文本 fallback Key | [agnes-ai.com](https://agnes-ai.com) 注册获取 |
| `AGNES_MODEL` | 多模态模型（图片识别） | `agnes-2.0-flash` |
| `AGNES_BASE_URL` | Agnes API 地址 | `https://apihub.agnes-ai.com/v1` |
| `PORT` | 主服务端口 | `8000` |
| `CORS_ORIGINS` | 跨域白名单 | `http://localhost:5173` |

---

## 📊 管理后台

| 功能模块 | 路径 | 说明 |
|----------|------|------|
| 仪表盘 | `/admin/dashboard` | 查询量、活跃度统计 |
| 对话记录 | `/admin/conversations` | 游客对话历史 |
| 知识库 | `/admin/knowledge` | 知识条目管理 |
| 反馈分析 | `/admin/sentiment` | 情感分析报告 |

---

## 📄 License

MIT
