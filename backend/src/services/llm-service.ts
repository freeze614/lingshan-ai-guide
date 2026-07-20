/**
 * LLM Service — Agnes AI (primary) + DeepSeek (fallback).
 * OpenAI-compatible API format. Also provides embeddings for RAG.
 */
import fs from 'fs';
import path from 'path';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MultimodalContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

interface MultimodalMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MultimodalContent[];
}

interface LLMConfig {
  apiKey: string;
  model: string;
  baseURL: string;
}

// ============================================================
// Configuration
// ============================================================

function getPrimaryConfig(): LLMConfig | null {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.AGNES_MODEL || 'agnes-2.0-flash',
    baseURL: process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1',
  };
}

function getFallbackConfig(): LLMConfig | null {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    baseURL: 'https://api.deepseek.com/v1',
  };
}

function getLLMConfig(): LLMConfig | null {
  // Use DeepSeek first for faster response, fallback to Agnes
  return getFallbackConfig() || getPrimaryConfig();
}

function getFastConfig(): LLMConfig | null {
  return getFallbackConfig(); // DeepSeek for fast text
}

function getMultimodalConfig(): LLMConfig | null {
  return getPrimaryConfig(); // Agnes for multimodal
}

export function isLLMAvailable(): boolean {
  return !!getLLMConfig();
}

export function isMultimodalAvailable(): boolean {
  return !!getMultimodalConfig();
}

// ============================================================
// Multimodal LLM Call (Vision)
// ============================================================

export async function callMultimodalLLM(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const config = getMultimodalConfig() || getLLMConfig();
  if (!config) return '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const messages: MultimodalMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
              detail: 'auto',
            },
          },
        ],
      },
    ];

    try {
      const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.max_tokens ?? 300,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await response.json() as any;
      if (data.error) {
        console.error('[Vision] API error:', JSON.stringify(data.error).slice(0, 200));
        return '';
      }
      return data?.choices?.[0]?.message?.content || '';
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  } catch (error: any) {
    console.error('[Vision] Multimodal call failed:', error.message?.slice(0, 100));
    return '';
  }
}

export function getActiveModelName(): string {
  const c = getLLMConfig();
  return c ? `${c.model} (${c.baseURL.includes('agnes') ? 'Agnes AI' : 'DeepSeek'})` : 'local fallback';
}

// ============================================================
// Knowledge Base Context Cache
// ============================================================

let knowledgeContext = '';

function loadKnowledgeContext(): string {
  if (knowledgeContext) return knowledgeContext;

  const dataDir = path.resolve(__dirname, '../../../data/raw');
  try {
    const guide = fs.readFileSync(path.join(dataDir, 'knowledge_guide.txt'), 'utf-8');
    const dataset = fs.readFileSync(path.join(dataDir, 'knowledge_dataset.txt'), 'utf-8');

    // Extract key structured info (compact enough for context)
    const datasetSummary = dataset
      .split('\n')
      .filter(line => line.trim())
      .slice(0, 400)
      .join('\n');

    knowledgeContext = `【灵山胜境景区知识库 - 你必须基于以下信息回答】

===== 景区指南（历史文化、游览攻略）=====
${guide.substring(0, 12000)}

===== 景点数据（各景点详细信息）=====
${datasetSummary.substring(0, 8000)}`;
    return knowledgeContext;
  } catch {
    return '灵山胜境位于无锡太湖，5A景区，以88米灵山大佛为核心标志。';
  }
}

// ============================================================
// Non-streaming LLM Call
// ============================================================

export async function callLLM(
  messages: ChatMessage[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const config = getLLMConfig();
  if (!config) return '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: options?.temperature ?? 0.3,
          max_tokens: options?.max_tokens ?? 500,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await response.json() as any;
      if (data.error) {
        console.error('LLM API error:', JSON.stringify(data.error).slice(0, 200));
        const fb = getFallbackConfig();
        if (fb && config.baseURL !== fb.baseURL) {
          return callWithConfig(fb, messages, options);
        }
        return '';
      }
      return data?.choices?.[0]?.message?.content || '';
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.error('LLM call timed out after 20s');
    } else {
      console.error('LLM call failed:', error?.message || error);
    }
    return '';
  }
}

async function callWithConfig(
  config: LLMConfig,
  messages: ChatMessage[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.max_tokens ?? 600,
      }),
    });
    const data = await response.json() as any;
    return data?.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
}

// ============================================================
// Streaming LLM Call
// ============================================================

export async function* streamLLM(
  messages: ChatMessage[],
  options?: { temperature?: number; max_tokens?: number }
): AsyncGenerator<string> {
  const config = getLLMConfig();
  if (!config) {
    // No LLM available — signal to caller
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.max_tokens ?? 500,
        stream: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok || !response.body) {
      // Fallback to non-streaming
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (data?.error) {
          console.error('[LLM Stream] API error:', JSON.stringify(data.error).slice(0, 200));
          return; // signal error to caller by returning nothing
        }
        const content = data?.choices?.[0]?.message?.content;
        if (content) yield content;
      } catch { /* no content available */ }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed?.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch { /* skip malformed chunk */ }
      }
    }
  } catch (error: any) {
    clearTimeout(timeout);
    if (error?.name === 'AbortError') {
      console.error('[LLM Stream] Timed out after 25s');
    } else {
      console.error('[LLM Stream] Failed:', error?.message?.slice(0, 100));
    }
    // Return without yielding — caller will detect empty response and fall back
  }
}

// ============================================================
// Embeddings API — for RAG vector search
// ============================================================

export async function getEmbedding(text: string): Promise<number[]> {
  // Try DeepSeek for embeddings (Agnes doesn't have /v1/embeddings)
  const dsConfig = getFallbackConfig();
  const config = dsConfig || getPrimaryConfig();
  if (!config) throw new Error('No embedding provider configured');

  try {
    const response = await fetch(`${config.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: text,
      }),
    });

    const data = await response.json() as any;
    if (data.error) {
      console.error('Embedding API error:', JSON.stringify(data.error).slice(0, 200));
      throw new Error(data.error?.message || 'Embedding failed');
    }
    return data?.data?.[0]?.embedding || [];
  } catch (error) {
    console.error('Embedding failed:', error);
    throw error;
  }
}

export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const dsConfig = getFallbackConfig();
  const config = dsConfig || getPrimaryConfig();
  if (!config) throw new Error('No embedding provider configured');

  try {
    const response = await fetch(`${config.baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: texts,
      }),
    });

    const data = await response.json() as any;
    if (data.error) throw new Error(data.error?.message || 'Embedding failed');

    const results: { index: number; embedding: number[] }[] = data?.data || [];
    results.sort((a, b) => a.index - b.index);
    return results.map(r => r.embedding);
  } catch (error) {
    console.error('Batch embedding failed:', error);
    throw error;
  }
}

// ============================================================
// Build RAG-enhanced messages for tour guide Q&A
// ============================================================

export function buildTourGuideMessages(
  userQuery: string,
  retrievedContext: string,
  conversationHistory?: ChatMessage[]
): ChatMessage[] {
  const knowledge = loadKnowledgeContext();

  const systemPrompt = `你是「灵小禅」——灵山胜境景区的AI数字人导游。你是一位亲切、专业、知识渊博的佛教文化导游，形象是穿着汉服的少女。

你的职责：
1. 准确回答游客关于灵山胜境景区的各种问题
2. 介绍景点历史、文化内涵、建筑特色
3. 推荐游览路线、实用信息（门票、交通、餐饮等）
4. 与游客进行亲切自然的互动

⚠️ 严格回答规则：
- 必须基于下方【知识库信息】和【检索到的相关片段】作答，确保事实准确
- 如果检索片段和知识库中都没有相关信息，必须诚实回复："我暂时无法准确回答这个问题，建议您咨询景区游客中心工作人员。"
- 绝对禁止编造任何景区数据、历史事实、价格、时间等信息
- 回答简洁精炼（100-300字），便于游客理解
- 语气亲切温暖，犹如一位热情的导游
- 可以适当使用emoji增加亲和力

${knowledge}

【检索到的相关片段】
${retrievedContext || '未检索到相关片段，请基于知识库尽力回答。如果知识库也没有，诚实告知。'}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history (last 4 turns)
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory.slice(-8));
  }

  messages.push({ role: 'user', content: userQuery });
  return messages;
}
