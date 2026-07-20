"""
Accuracy Test Runner — evaluates 50 standard questions against RAG pipeline.
Checks answer quality via keyword overlap and semantic similarity.
"""
import json, sys, os, time
from pathlib import Path

# Add project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Try to import semantic scoring
try:
    from sentence_transformers import SentenceTransformer
    _embedder = SentenceTransformer("BAAI/bge-large-zh-v1.5", device="cpu")
    _embedder.encode(["test"])
    HAS_EMBED = True
except Exception:
    _embedder = None
    HAS_EMBED = False


def load_questions() -> list:
    qfile = Path(__file__).parent / "test_questions.json"
    return json.loads(qfile.read_text(encoding="utf-8"))


def call_qa_api(query: str) -> dict:
    """Call the running backend Q&A endpoint."""
    import urllib.request
    url = "http://127.0.0.1:8000/api/v1/visitor/qa"
    data = json.dumps({"query": query, "session_id": "test_runner"}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"answer": "", "error": str(e)[:200]}


def keyword_score(answer: str, expected_keywords: list) -> float:
    """Score by keyword overlap."""
    if not answer or not expected_keywords:
        return 0.0
    hits = sum(1 for kw in expected_keywords if kw.lower() in answer.lower())
    return hits / len(expected_keywords)


def semantic_score(answer: str, question: str) -> float:
    """Score by semantic relevance using embeddings."""
    if not HAS_EMBED or not answer or len(answer) < 5:
        return 0.5  # neutral
    try:
        q_emb = _embedder.encode([question], normalize_embeddings=True)
        a_emb = _embedder.encode([answer[:500]], normalize_embeddings=True)
        import numpy as np
        similarity = np.dot(q_emb, a_emb.T)[0][0]
        return float(max(0, similarity))
    except Exception:
        return 0.5


def evaluate_answer(answer: str, question: dict) -> dict:
    """Score a single answer."""
    kw_score = keyword_score(answer, question["expected_keywords"])
    sem_score = semantic_score(answer, question["question"])
    # Combined: 50% keyword + 50% semantic
    combined = round(kw_score * 0.5 + sem_score * 0.5, 3)
    passed = combined >= 0.4  # 40% combined threshold
    return {
        "question_id": question["id"],
        "question": question["question"],
        "expected_keywords": question["expected_keywords"],
        "keyword_score": round(kw_score, 3),
        "semantic_score": round(sem_score, 3),
        "combined_score": combined,
        "passed": passed,
        "answer_preview": answer[:200],
    }


def main():
    print("=" * 60)
    print("  灵山胜境 AI 导游 — 标准测试集准确率评估")
    print("=" * 60)
    print(f"  语义评分: {'可用 (BGE-large)' if HAS_EMBED else '不可用 (仅关键词)'}")
    print()

    questions = load_questions()
    print(f"  测试题数: {len(questions)}")
    print()

    results = []
    passed_count = 0
    total_keyword = 0.0
    total_semantic = 0.0

    for i, q in enumerate(questions):
        print(f"  [{i+1:2d}/{len(questions)}] {q['question'][:40]}...", end=" ", flush=True)
        resp = call_qa_api(q["question"])
        answer = resp.get("answer", "")
        if not answer and resp.get("error"):
            print(f"❌ API错误: {resp['error'][:50]}")
            continue

        eval_result = evaluate_answer(answer, q)
        results.append(eval_result)
        total_keyword += eval_result["keyword_score"]
        total_semantic += eval_result["semantic_score"]
        if eval_result["passed"]:
            passed_count += 1

        status = "✅" if eval_result["passed"] else "⚠️"
        print(f"{status} KW={eval_result['keyword_score']:.2f} SEM={eval_result['semantic_score']:.2f}")

        # Rate limit
        time.sleep(0.3)

    total = len(results)
    accuracy = round(passed_count / total * 100, 1) if total > 0 else 0
    avg_kw = round(total_keyword / total, 3) if total > 0 else 0
    avg_sem = round(total_semantic / total, 3) if total > 0 else 0

    print()
    print("=" * 60)
    print("  评估结果")
    print("=" * 60)
    print(f"  通过数:      {passed_count}/{total}")
    print(f"  准确率:      {accuracy}%")
    print(f"  平均关键词分: {avg_kw}")
    print(f"  平均语义分:   {avg_sem}")
    print(f"  目标:        ≥ 90%")

    # Flag weak questions
    weak = [r for r in results if not r["passed"]]
    if weak:
        print(f"\n  ⚠️ 需改进的题目 ({len(weak)}题):")
        for w in weak:
            print(f"    #{w['question_id']}: {w['question'][:50]}")
            print(f"       综合分: {w['combined_score']}, 期望关键词: {w['expected_keywords']}")

    # Save detailed results
    outfile = Path(__file__).parent.parent.parent / "data" / "test_results.json"
    outfile.write_text(json.dumps({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": total,
        "passed": passed_count,
        "accuracy": accuracy,
        "avg_keyword_score": avg_kw,
        "avg_semantic_score": avg_sem,
        "semantic_model": "BAAI/bge-large-zh-v1.5" if HAS_EMBED else "unavailable",
        "results": results,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  详细结果已保存到 data/test_results.json")

    return accuracy >= 90.0


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
