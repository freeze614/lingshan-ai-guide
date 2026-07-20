/**
 * Lightweight JSON-based data store.
 * Persists conversations, feedback, and daily stats for the admin dashboard.
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../../data');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const DAILY_STATS_FILE = path.join(DATA_DIR, 'daily_stats.json');

// Ensure data directory exists
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

// ============================================================
// Types
// ============================================================

export interface ConversationRecord {
  id: string;
  session_id: string;
  timestamp: string; // ISO
  query: string;
  answer: string;
  emotion: string;
  used_llm: boolean;
  response_time_ms: number;
  location?: { lat: number; lng: number } | null;
  category?: string;
  feedback?: 'helpful' | 'unhelpful' | null;
}

export interface FeedbackRecord {
  id: string;
  session_id: string;
  timestamp: string;
  rating: number; // 1-5
  comment: string;
}

export interface DailyStats {
  date: string;
  total_queries: number;
  llm_queries: number;
  avg_response_ms: number;
  emotions: Record<string, number>; // emotion -> count
  hot_questions: Array<{ question: string; count: number }>;
  categories: Record<string, number>;
  feedback_helpful: number;
  feedback_unhelpful: number;
}

// ============================================================
// Generic JSON read/write (with file-level write locks)
// ============================================================

/** Per-file Promise chains to serialize concurrent writes and prevent data loss. */
const writeLocks = new Map<string, Promise<void>>();

function readJSON<T>(filePath: string, defaultVal: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(`Failed to read ${filePath}:`, e);
  }
  return defaultVal;
}

function writeJSON(filePath: string, data: any): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Failed to write ${filePath}:`, e);
  }
}

/**
 * Enqueue an atomic read-modify-write operation on a JSON file.
 * Prevents concurrent writes from overwriting each other.
 */
function enqueueUpdate<T>(filePath: string, mutator: (data: T) => T, defaultVal: T): void {
  const prev = writeLocks.get(filePath) || Promise.resolve();
  const next = prev.then(() => {
    const data = readJSON<T>(filePath, defaultVal);
    const updated = mutator(data);
    writeJSON(filePath, updated);
  }).catch(err => {
    console.error(`[Store] Write failed for ${filePath}:`, err?.message || err);
  });
  writeLocks.set(filePath, next);
}

// ============================================================
// Query Classification
// ============================================================

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'ticket': ['票价', '门票', '价格', '多少钱', '优惠', '免费', '收费', '购票', '票务'],
  'route': ['路线', '怎么走', '怎么去', '游览', '推荐', '行程', '入口', '出口', '观光车', '步行'],
  'history': ['历史', '建于', '古代', '朝代', '唐代', '千年', '由来', '起源', '典故', '传说'],
  'facility': ['厕所', '卫生间', '母婴', '饮水', '商店', '餐厅', '休息', '停车场', '存包', '医务'],
};

export function classifyQuery(query: string): string {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (query.includes(kw)) return category;
    }
  }
  return 'other';
}

// ============================================================
// Conversations
// ============================================================

function isGarbled(text: string): boolean {
  if (!text) return true;
  // Has Chinese characters — likely valid
  if (/[一-鿿]/.test(text)) return false;
  // Pure ASCII + common punctuation — valid
  if (/^[\x00-\x7F\s\.\,\!\?\:\;\(\)\[\]\{\}\@\#\$\%\^\&\*\+\-\=\/\\\|`~\"\'\_\<\>]*$/.test(text)) return false;
  // Contains replacement chars
  if (text.includes('')) return true;
  // Likely garbled if no Chinese and no basic ASCII
  return !/[一-鿿]/.test(text) && !/^[\x00-\x7F\s]+$/.test(text);
}

export function saveConversation(record: ConversationRecord): void {
  console.log(`[Store] saveConversation called: id=${record.id}, query="${(record.query || '').slice(0, 40)}", session=${record.session_id?.slice(0, 8)}`);
  console.log(`[Store] DATA_DIR=${DATA_DIR}, CONVERSATIONS_FILE=${CONVERSATIONS_FILE}`);
  if (isGarbled(record.query) || isGarbled(record.answer)) {
    console.log('[Store] Skipping garbled conversation:', record.query.slice(0, 30));
    return;
  }
  // Auto-classify if not already set
  if (!record.category) {
    record.category = classifyQuery(record.query);
    console.log(`[Store] Auto-classified as: ${record.category}`);
  }
  enqueueUpdate<ConversationRecord[]>(
    CONVERSATIONS_FILE,
    (conversations) => {
      conversations.push(record);
      console.log(`[Store] Appended to conversations.json, total=${conversations.length}`);
      // Keep last 10000 records
      if (conversations.length > 10000) {
        conversations.splice(0, conversations.length - 10000);
      }
      return conversations;
    },
    []
  );
  // Update daily stats (separate file, okay to run in parallel)
  updateDailyStats(record);
}

export function getConversations(limit: number = 100): ConversationRecord[] {
  const conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);
  return conversations.slice(-limit).reverse();
}

export interface ConversationFilter {
  startDate?: string;
  endDate?: string;
  category?: string;
  feedback?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export function getFilteredConversations(filter: ConversationFilter): {
  items: ConversationRecord[];
  total: number;
} {
  let conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);

  if (filter.startDate) {
    conversations = conversations.filter(c => c.timestamp >= filter.startDate!);
  }
  if (filter.endDate) {
    conversations = conversations.filter(c => c.timestamp <= filter.endDate!);
  }
  if (filter.category) {
    conversations = conversations.filter(c => c.category === filter.category || (c.category || 'other') === filter.category);
  }
  if (filter.feedback === 'helpful') {
    conversations = conversations.filter(c => c.feedback === 'helpful');
  } else if (filter.feedback === 'unhelpful') {
    conversations = conversations.filter(c => c.feedback === 'unhelpful');
  }
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    conversations = conversations.filter(c =>
      c.query.toLowerCase().includes(kw) || c.answer.toLowerCase().includes(kw)
    );
  }

  const total = conversations.length;
  const sorted = conversations.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const offset = filter.offset || 0;
  const limit = filter.limit || 50;

  return {
    items: sorted.slice(offset, offset + limit),
    total,
  };
}

export function getConversationStats(): {
  today: number;
  week: number;
  month: number;
  total: number;
} {
  const conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  return {
    today: conversations.filter(c => c.timestamp >= todayStart).length,
    week: conversations.filter(c => c.timestamp >= weekStart).length,
    month: conversations.filter(c => c.timestamp >= monthStart).length,
    total: conversations.length,
  };
}

// ============================================================
// Feedback
// ============================================================

export function saveFeedback(record: FeedbackRecord): void {
  enqueueUpdate<FeedbackRecord[]>(
    FEEDBACK_FILE,
    (feedbacks) => {
      feedbacks.push(record);
      return feedbacks;
    },
    []
  );
}

/** Update conversation feedback flag when user rates. */
export function updateConversationFeedback(sessionId: string, feedback: 'helpful' | 'unhelpful'): void {
  enqueueUpdate<ConversationRecord[]>(
    CONVERSATIONS_FILE,
    (conversations) => {
      // Find the latest conversation for this session and set feedback
      for (let i = conversations.length - 1; i >= 0; i--) {
        if (conversations[i].session_id === sessionId) {
          conversations[i].feedback = feedback;
          break;
        }
      }
      return conversations;
    },
    []
  );
}

export function getFeedbackStats(): {
  avg_rating: number;
  total: number;
  distribution: Record<number, number>;
} {
  const feedbacks = readJSON<FeedbackRecord[]>(FEEDBACK_FILE, []);
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const f of feedbacks) {
    distribution[f.rating] = (distribution[f.rating] || 0) + 1;
    sum += f.rating;
  }
  return {
    avg_rating: feedbacks.length > 0 ? sum / feedbacks.length : 0,
    total: feedbacks.length,
    distribution,
  };
}

// ============================================================
// Top Unsatisfied Questions
// ============================================================

export function getTopUnsatisfied(limit: number = 10): Array<{ query: string; count: number }> {
  const conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);
  const unhelpful = conversations.filter(c => c.feedback === 'unhelpful');
  const queryMap: Record<string, number> = {};
  for (const c of unhelpful) {
    const normalized = c.query.replace(/[？?！!，,。.、\s]+/g, '').trim().slice(0, 50);
    queryMap[normalized] = (queryMap[normalized] || 0) + 1;
  }
  return Object.entries(queryMap)
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// ============================================================
// Visitor Location Stats
// ============================================================

export function getVisitorLocationStats(): Array<{
  lat: number;
  lng: number;
  count: number;
  city?: string;
}> {
  const conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);
  const locationMap: Record<string, { lat: number; lng: number; count: number }> = {};

  for (const c of conversations) {
    if (c.location && c.location.lat && c.location.lng) {
      // Round to 2 decimal places for privacy
      const lat = Math.round(c.location.lat * 100) / 100;
      const lng = Math.round(c.location.lng * 100) / 100;
      const key = `${lat},${lng}`;
      if (!locationMap[key]) {
        locationMap[key] = { lat, lng, count: 0 };
      }
      locationMap[key].count++;
    }
  }

  return Object.values(locationMap).sort((a, b) => b.count - a.count).slice(0, 50);
}

// ============================================================
// Category Distribution
// ============================================================

export function getCategoryDistribution(): Record<string, number> {
  const conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);
  const dist: Record<string, number> = { ticket: 0, route: 0, history: 0, facility: 0, other: 0 };
  for (const c of conversations) {
    const cat = c.category || 'other';
    dist[cat] = (dist[cat] || 0) + 1;
  }
  return dist;
}

// ============================================================
// Daily Stats
// ============================================================

function updateDailyStats(record: ConversationRecord): void {
  const today = new Date().toISOString().split('T')[0];

  enqueueUpdate<Record<string, DailyStats>>(
    DAILY_STATS_FILE,
    (stats) => {
      if (!stats[today]) {
        stats[today] = {
          date: today,
          total_queries: 0,
          llm_queries: 0,
          avg_response_ms: 0,
          emotions: {},
          hot_questions: [],
          categories: {},
          feedback_helpful: 0,
          feedback_unhelpful: 0,
        };
      }

      const day = stats[today];
      day.total_queries++;
      if (record.used_llm) day.llm_queries++;
      day.avg_response_ms = (day.avg_response_ms * (day.total_queries - 1) + record.response_time_ms) / day.total_queries;
      day.emotions[record.emotion] = (day.emotions[record.emotion] || 0) + 1;

      // Category tracking
      const cat = record.category || 'other';
      day.categories[cat] = (day.categories[cat] || 0) + 1;

      // Feedback tracking
      if (record.feedback === 'helpful') day.feedback_helpful++;
      if (record.feedback === 'unhelpful') day.feedback_unhelpful++;

      // Track hot questions
      const normalized = record.query.replace(/[？?！!，,。.、\s]+/g, '').trim().slice(0, 30);
      const existing = day.hot_questions.find(q => q.question === normalized);
      if (existing) {
        existing.count++;
      } else {
        day.hot_questions.push({ question: normalized, count: 1 });
      }
      // Keep top 20
      day.hot_questions.sort((a, b) => b.count - a.count);
      day.hot_questions = day.hot_questions.slice(0, 20);

      // Keep last 90 days
      const keys = Object.keys(stats).sort();
      if (keys.length > 90) {
        for (const k of keys.slice(0, keys.length - 90)) {
          delete stats[k];
        }
      }

      return stats;
    },
    {}
  );
}

export function getDailyStats(days: number = 7): DailyStats[] {
  const stats = readJSON<Record<string, DailyStats>>(DAILY_STATS_FILE, {});
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().split('T')[0];
  return Object.values(stats)
    .filter(s => s.date >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getHotQuestions(days: number = 7): Array<{ question: string; count: number }> {
  // Aggregate hot questions directly from conversations within calendar window
  const conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const recent = conversations.filter(c => c.timestamp >= cutoff);

  const merged: Record<string, number> = {};
  for (const c of recent) {
    const normalized = c.query.replace(/[？?！!，,。.、\s]+/g, '').trim().slice(0, 30);
    merged[normalized] = (merged[normalized] || 0) + 1;
  }
  return Object.entries(merged)
    .map(([question, count]) => ({ question: question.length > 30 ? question + '...' : question, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function getEmotionDistribution(days: number = 7): Record<string, number> {
  // Aggregate emotions directly from conversations within calendar window
  const conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const recent = conversations.filter(c => c.timestamp >= cutoff);

  const dist: Record<string, number> = {};
  for (const c of recent) {
    dist[c.emotion] = (dist[c.emotion] || 0) + 1;
  }
  return dist;
}

export function getHourlyDistribution(days: number = 7): Array<{ hour: number; count: number }> {
  const conversations = readJSON<ConversationRecord[]>(CONVERSATIONS_FILE, []);
  const weekAgo = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const hours: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hours[h] = 0;

  for (const c of conversations) {
    if (c.timestamp >= weekAgo) {
      const hour = new Date(c.timestamp).getHours();
      hours[hour]++;
    }
  }

  return Object.entries(hours).map(([hour, count]) => ({
    hour: parseInt(hour),
    count,
  }));
}

export function getSatisfactionTrend(days: number = 7): Array<{ date: string; score: number | null }> {
  const feedbacks = readJSON<FeedbackRecord[]>(FEEDBACK_FILE, []);
  const trend: Array<{ date: string; score: number | null }> = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().split('T')[0];
    const dayFeedbacks = feedbacks.filter(f => f.timestamp.startsWith(date));
    const avg = dayFeedbacks.length > 0
      ? dayFeedbacks.reduce((sum, f) => sum + f.rating, 0) / dayFeedbacks.length
      : null;
    trend.push({
      date: date.slice(5),
      score: avg !== null ? Math.round(avg * 10) / 10 : null,
    });
  }

  return trend;
}