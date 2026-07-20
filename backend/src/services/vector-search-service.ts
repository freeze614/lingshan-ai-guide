/**
 * Vector Search Service — TypeScript client calling Python ChromaDB microservice.
 */
interface VectorResult {
  id: string;
  text: string;
  score: number;
  metadata: {
    source: string;
    category: string;
    keywords: string;
  };
}

interface SearchResponse {
  results: VectorResult[];
  query: string;
  count: number;
}

interface HealthResponse {
  status: string;
  chunks: number;
  model: string;
}

const VECTOR_SERVICE_URL = 'http://127.0.0.1:8002';
let available = false;
let checked = false;

export async function checkVectorHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${VECTOR_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json() as HealthResponse;
    available = data.status === 'ok' && data.chunks > 0;
    checked = true;
    console.log(`[Vector] Health check: ${available ? `OK (${data.chunks} chunks)` : 'NO CHUNKS'}`);
  } catch {
    available = false;
    checked = true;
    console.log('[Vector] Service unavailable');
  }
  return available;
}

export async function waitForVectorService(timeoutMs: number = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkVectorHealth()) return true;
    console.log('[Vector] Waiting for service to be ready...');
    await new Promise(r => setTimeout(r, 2000));
  }
  console.warn('[Vector] Service did not become ready within timeout');
  return false;
}

export function isVectorAvailable(): boolean {
  return available;
}

export async function searchVectors(query: string, topK: number = 5): Promise<VectorResult[]> {
  if (!available) return [];
  try {
    const res = await fetch(`${VECTOR_SERVICE_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, top_k: topK }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json() as SearchResponse;
    return data.results || [];
  } catch (e: any) {
    console.error(`[Vector] Search failed: ${e.message?.slice(0, 100)}`);
    return [];
  }
}

export async function rebuildVectorIndex(): Promise<{ status: string; chunks: number }> {
  try {
    const res = await fetch(`${VECTOR_SERVICE_URL}/rebuild`, {
      signal: AbortSignal.timeout(120000),
    });
    return await res.json() as { status: string; chunks: number };
  } catch (e: any) {
    return { status: 'error', chunks: 0 };
  }
}
