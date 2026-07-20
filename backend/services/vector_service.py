"""
Vector Search Microservice — ChromaDB + BGE Embedding
Provides semantic search over the Ling Shan knowledge base.
POST /search  {"query":"...", "top_k":5} → {"results":[...]}
GET /health  → {"status":"ok", "chunks":N}
"""
import sys, os, json, re, uuid
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"
CHROMA_DIR = str(DATA_DIR / "chroma_db")
CACHE_DIR = str(DATA_DIR / "model_cache")

os.makedirs(CHROMA_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

# ===== Init =====
print("[Vector] Loading embedding model...", flush=True)
embedding_model = SentenceTransformer(
    "BAAI/bge-large-zh-v1.5",
    device="cpu",
    cache_folder=CACHE_DIR,
)
embedding_model.encode(["test"], normalize_embeddings=True)  # warm-up
print("[Vector] Embedding model ready", flush=True)

print("[Vector] Connecting to ChromaDB...", flush=True)
chroma_client = chromadb.PersistentClient(
    path=CHROMA_DIR,
    settings=ChromaSettings(anonymized_telemetry=False),
)
collection = chroma_client.get_or_create_collection(
    name="scenic_knowledge",
    metadata={"hnsw:space": "cosine"},
)
print(f"[Vector] ChromaDB ready, collection has {collection.count()} docs", flush=True)

# ===== Chunking =====
CHINESE_SEPS = ['\n\n', '\n', '。', '！', '？', '；', '，']

def split_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list:
    chunks = []
    paragraphs = text.split('\n\n')
    current = ''
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(para) <= chunk_size:
            combined = (current + '\n\n' + para).strip() if current else para
            if len(combined) > chunk_size and current:
                chunks.append(current.strip())
                current = para
            else:
                current = combined
            if len(current) >= chunk_size:
                chunks.append(current.strip())
                current = ''
        else:
            if current:
                chunks.append(current.strip())
                current = ''
            sentences = re.split(r'(?<=[。！？])', para)
            sub = ''
            for sent in sentences:
                if len(sub + sent) > chunk_size and sub:
                    chunks.append(sub.strip())
                    sub = sent
                else:
                    sub += sent
            if sub.strip():
                chunks.append(sub.strip())
    if current.strip():
        chunks.append(current.strip())
    return [c for c in chunks if len(c) > 20]


SPOT_NAMES = [
    '灵山大佛', '九龙灌浴', '灵山梵宫', '五印坛城', '祥符禅寺',
    '灵山大照壁', '菩提大道', '百子戏弥勒', '曼飞龙塔', '无尽意斋',
    '佛足坛', '五智门', '降魔浮雕', '阿育王柱', '佛教文化博览馆',
    '拈花广场', '梵天花海', '香月花街', '五灯湖', '灵山精舍',
    '五明桥', '拈花湾', '香水海', '登云道', '鹿鸣谷', '拈花堂',
]


def detect_category(text: str) -> str:
    if any(w in text for w in ['门票', '交通', '餐饮', '住宿']):
        return '实用信息'
    if any(w in text for w in ['表演', '演出', '时间']):
        return '演艺信息'
    if any(w in text for w in ['路线', '游览', '攻略']):
        return '游览指南'
    if any(w in text for w in ['唐代', '北宋', '历史', '千年', '贞观']):
        return '历史背景'
    return '景点数据'


def build_index(force: bool = False) -> int:
    """Index knowledge into ChromaDB. Returns chunk count."""
    global collection
    if not force and collection.count() > 0:
        print(f"[Vector] Index already has {collection.count()} docs, skipping build", flush=True)
        return collection.count()

    print("[Vector] Building knowledge index...", flush=True)

    # Load texts
    guide_text = (RAW_DIR / "knowledge_guide.txt").read_text(encoding="utf-8")
    dataset_text = (RAW_DIR / "knowledge_dataset.txt").read_text(encoding="utf-8")

    # Chunk
    guide_chunks = split_text(guide_text, 500, 100)
    dataset_chunks = split_text(dataset_text, 600, 100)
    all_texts = guide_chunks + dataset_chunks
    print(f"[Vector] Built {len(all_texts)} chunks ({len(guide_chunks)} guide + {len(dataset_chunks)} dataset)", flush=True)

    # Embed in batches
    batch_size = 32
    all_ids = []
    all_metadatas = []
    all_embeddings = []

    for batch_start in range(0, len(all_texts), batch_size):
        batch = all_texts[batch_start:batch_start + batch_size]
        embeddings = embedding_model.encode(batch, normalize_embeddings=True).tolist()
        all_embeddings.extend(embeddings)

        for i, text in enumerate(batch):
            chunk_id = f"chunk_{batch_start + i}"
            all_ids.append(chunk_id)
            all_metadatas.append({
                "source": "knowledge_guide.txt" if batch_start + i < len(guide_chunks) else "knowledge_dataset.txt",
                "category": detect_category(text),
                "keywords": ",".join([n for n in SPOT_NAMES if n in text]),
            })

        if (batch_start // batch_size) % 5 == 0:
            print(f"[Vector] Embedded {batch_start + len(batch)}/{len(all_texts)} chunks...", flush=True)

    # Clear and reload
    print("[Vector] Storing in ChromaDB...", flush=True)
    try:
        chroma_client.delete_collection("scenic_knowledge")
    except Exception:
        pass
    collection = chroma_client.get_or_create_collection(
        name="scenic_knowledge",
        metadata={"hnsw:space": "cosine"},
    )
    collection.add(
        ids=all_ids,
        documents=all_texts,
        metadatas=all_metadatas,
        embeddings=all_embeddings,
    )
    print(f"[Vector] Index built: {collection.count()} documents", flush=True)
    return collection.count()


def search(query: str, top_k: int = 5) -> list:
    """Semantic search. Returns [{text, score, metadata}, ...]."""
    query_embedding = embedding_model.encode([query], normalize_embeddings=True).tolist()
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )
    output = []
    if results["ids"] and results["ids"][0]:
        for i in range(len(results["ids"][0])):
            dist = results["distances"][0][i] if results.get("distances") else 0.0
            output.append({
                "id": results["ids"][0][i],
                "text": results["documents"][0][i] if results.get("documents") else "",
                "score": round(1.0 - dist, 4),  # cosine distance → similarity
                "metadata": results["metadatas"][0][i] if results.get("metadatas") else {},
            })
    return output


# ===== HTTP Handler =====
class VectorHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/search':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length).decode('utf-8'))
        query = body.get('query', '').strip()
        top_k = min(body.get('top_k', 5), 20)
        if not query:
            self.send_json({"error": "empty query"})
            return
        results = search(query, top_k)
        self.send_json({"results": results, "query": query, "count": len(results)})

    def do_GET(self):
        if self.path == '/health':
            self.send_json({
                "status": "ok",
                "chunks": collection.count(),
                "model": "BAAI/bge-large-zh-v1.5",
            })
        elif self.path == '/rebuild':
            count = build_index(force=True)
            self.send_json({"status": "rebuilt", "chunks": count})
        else:
            self.send_error(404)

    def send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8002
    # Build index on startup
    build_index()
    server = HTTPServer(('127.0.0.1', port), VectorHandler)
    print(f"[Vector] Service ready on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()
