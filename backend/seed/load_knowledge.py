"""Load knowledge base data into SQLite and ChromaDB."""
import re
import sys
import uuid
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from loguru import logger

from backend.vectordb.chroma_client import (
    get_knowledge_collection,
    reset_collection,
)
from backend.vectordb.embeddings import embed_texts, get_embedding_model
from backend.vectordb.chunking import ChineseTextChunker


def load_knowledge_guide(filepath: str) -> str:
    """Load the scenic guide text file."""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def load_knowledge_dataset(filepath: str) -> str:
    """Load the structured dataset text file."""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def parse_scenic_spots(text: str) -> list[dict]:
    """Parse scenic spot data from the structured dataset."""
    spots = []

    # Match each scenic spot entry by looking for the pattern
    # 灵山胜境 + spot code (LS-xxx or NH-xxx)
    spot_blocks = re.split(r'\n(?=灵山胜境|拈花湾禅意小镇)', text)

    current_spot = None
    fields = []
    expected_fields = [
        "景区名称", "景点ID", "景点名称", "具体位置", "建筑/景观参数",
        "核心功能", "文化内涵", "详细介绍", "游玩亮点", "演艺/开放信息", "备注"
    ]

    for block in spot_blocks:
        if not block.strip():
            continue

        lines = block.strip().split('\n')
        area_name = lines[0].strip() if lines else ""

        # Try to extract spot data from the block
        # Look for spot code pattern LS-xxx or NH-xxx
        code_match = re.search(r'(LS-\d+|NH-\d+)', block)
        if code_match:
            spot_code = code_match.group(1)
            # Find the name after the code (usually next line or same line)
            code_idx = block.find(spot_code)
            after_code = block[code_idx + len(spot_code):].strip()
            name = after_code.split('\n')[0].strip() if after_code else spot_code

            spots.append({
                "area_name": area_name,
                "spot_code": spot_code,
                "name": name,
                "full_text": block.strip(),
            })

    return spots


def build_vector_index(data_dir: str):
    """Build ChromaDB vector index from knowledge base files."""
    logger.info("开始构建知识库向量索引...")

    data_path = Path(data_dir)
    guide_path = data_path / "knowledge_guide.txt"
    dataset_path = data_path / "knowledge_dataset.txt"

    if not guide_path.exists() or not dataset_path.exists():
        logger.error(f"知识库文件缺失: {data_path}")
        return False

    # Reset collection for fresh index
    logger.info("重置向量集合...")
    collection = reset_collection("scenic_knowledge")

    chunker = ChineseTextChunker(chunk_size=500, chunk_overlap=100)

    # Process knowledge guide
    logger.info("处理景区指南...")
    guide_text = load_knowledge_guide(str(guide_path))
    guide_chunks = chunker.split_text(guide_text, metadata={
        "source": "knowledge_guide",
        "doc_type": "guide",
        "category": "综合指南",
    })

    # Process knowledge dataset
    logger.info("处理景点数据集...")
    dataset_text = load_knowledge_dataset(str(dataset_path))
    dataset_chunks = chunker.split_text(dataset_text, metadata={
        "source": "knowledge_dataset",
        "doc_type": "dataset",
        "category": "结构化数据",
    })

    all_chunks = guide_chunks + dataset_chunks
    logger.info(f"总计生成 {len(all_chunks)} 个文本块")

    # Prepare data for ChromaDB
    texts = [c["text"] for c in all_chunks]
    metadatas = [c["metadata"] for c in all_chunks]
    ids = [f"chunk_{i:04d}" for i in range(len(all_chunks))]

    # Generate embeddings
    logger.info("生成向量嵌入（这可能需要几分钟）...")
    # Ensure embedding model is loaded
    get_embedding_model()

    # Process in batches to avoid memory issues
    batch_size = 32
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i + batch_size]
        batch_metadatas = metadatas[i:i + batch_size]
        batch_ids = ids[i:i + batch_size]

        embeddings = embed_texts(batch_texts)
        collection.add(
            embeddings=embeddings,
            documents=batch_texts,
            metadatas=batch_metadatas,
            ids=batch_ids,
        )
        if (i // batch_size) % 10 == 0:
            logger.info(f"  处理进度: {min(i + batch_size, len(texts))}/{len(texts)}")

    logger.info(f"向量索引构建完成！共 {collection.count()} 条记录")
    return True


def main():
    """Main entry point for knowledge base loading."""
    data_dir = Path(__file__).parent.parent.parent / "data" / "raw"
    success = build_vector_index(str(data_dir))
    if success:
        logger.info("知识库导入成功!")
    else:
        logger.error("知识库导入失败!")


if __name__ == "__main__":
    main()
