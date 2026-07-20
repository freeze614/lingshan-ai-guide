/**
 * Emotion Service — LLM-based sentiment analysis with fallback to keywords.
 */
import { callLLM, isLLMAvailable } from './llm-service';

type Emotion = 'happy' | 'greet' | 'explain' | 'think' | 'farewell' | 'sorry' | 'angry';

// Simple in-memory cache (query+answer hash → emotion)
const emotionCache = new Map<string, { emotion: Emotion; timestamp: number }>();
const CACHE_TTL_MS = 60000; // 60 seconds

function cacheKey(query: string): string {
  return query.slice(0, 80).trim();
}

function getCached(query: string): Emotion | null {
  const key = cacheKey(query);
  const entry = emotionCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.emotion;
  }
  if (entry) emotionCache.delete(key);
  return null;
}

function setCache(query: string, emotion: Emotion): void {
  const key = cacheKey(query);
  emotionCache.set(key, { emotion, timestamp: Date.now() });
  // Limit cache size
  if (emotionCache.size > 500) {
    const oldest = [...emotionCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) emotionCache.delete(oldest[0]);
  }
}

/**
 * Analyze emotion using LLM. Falls back to keyword detection when LLM unavailable.
 */
export async function analyzeEmotion(query: string): Promise<Emotion> {
  // Check cache
  const cached = getCached(query);
  if (cached) return cached;

  // Try LLM-based analysis
  if (isLLMAvailable()) {
    try {
      const result = await callLLM([
        {
          role: 'system',
          content: `你是情感分析专家。分析游客与AI导游对话中游客的情感倾向。
分类标准：
- greet: 打招呼、问候（你好、在吗、嗨）
- happy: 满意、开心、感谢、称赞（谢谢、太好了、很棒）
- think: 提问、思考、好奇（带疑问词的问题）
- explain: 要求解释、深入了解、追问细节
- farewell: 告别、结束对话（再见、拜拜）
- sorry: 失望、不满意、抱怨
- angry: 愤怒、强烈不满（极少出现）

只返回一个单词（happy/greet/explain/think/farewell/sorry/angry），不要返回其他内容。`,
        },
        { role: 'user', content: query },
      ], { temperature: 0.1, max_tokens: 10 });

      const cleaned = result.trim().toLowerCase();
      const validEmotions: Emotion[] = ['happy', 'greet', 'explain', 'think', 'farewell', 'sorry', 'angry'];
      for (const emo of validEmotions) {
        if (cleaned.includes(emo)) {
          setCache(query, emo);
          return emo;
        }
      }
    } catch (e) {
      // Fall through to keyword detection
    }
  }

  // Fallback: keyword-based detection
  const emotion = keywordDetectEmotion(query);
  setCache(query, emotion);
  return emotion;
}

/**
 * Keyword-based emotion detection — used as fallback.
 */
function keywordDetectEmotion(query: string): Emotion {
  const q = query;

  // Greeting patterns
  if (/^(你好|您好|嗨|哈喽|在吗|早上好|下午好|晚上好)/.test(q)) return 'greet';

  // Farewell patterns
  if (/再见|拜拜|bye|下次|回头见/.test(q)) return 'farewell';

  // Gratitude/positive patterns
  if (/谢谢|感谢|太棒|真好|不错|很好|厉害|优秀|喜欢|赞/.test(q)) return 'happy';

  // Question patterns
  if (/[？?]/.test(q) || /怎么|如何|什么|为什么|多少|哪些|哪里|哪个|请问|帮我|推荐|介绍/.test(q)) return 'think';

  // Complaint/negative patterns
  if (/不对|错了|不行|不好|失望|差|没用|无语/.test(q)) return 'sorry';

  // Anger patterns (rare)
  if (/垃圾|骗|投诉|差评/.test(q)) return 'angry';

  return 'explain';
}

/**
 * Batch analyze emotions for historical conversations.
 */
export async function analyzeEmotionBatch(
  queries: string[]
): Promise<Array<{ query: string; emotion: Emotion }>> {
  const results: Array<{ query: string; emotion: Emotion }> = [];
  for (const query of queries) {
    results.push({ query, emotion: await analyzeEmotion(query) });
  }
  return results;
}
