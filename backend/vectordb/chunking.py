"""Document chunking strategies for Chinese text."""
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter


class ChineseTextChunker:
    """Splits Chinese text into overlapping chunks optimized for RAG."""

    # Chinese-aware separators in priority order
    CHINESE_SEPARATORS = [
        "\n\n",
        "\n",
        "。",
        "！",
        "？",
        "；",
        "，",
        "、",
        " ",
        "",
    ]

    def __init__(
        self,
        chunk_size: int = 600,
        chunk_overlap: int = 150,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=self.CHINESE_SEPARATORS,
            length_function=len,
            is_separator_regex=False,
        )

    def split_text(self, text: str, metadata: Optional[dict] = None) -> list[dict]:
        """Split a text document into chunks with metadata.

        Returns list of dicts with 'text' and 'metadata' keys.
        """
        chunks = self.splitter.split_text(text)
        result = []
        for i, chunk in enumerate(chunks):
            chunk_meta = {
                "chunk_index": i,
                "total_chunks": len(chunks),
            }
            if metadata:
                chunk_meta.update(metadata)
            result.append({
                "text": chunk,
                "metadata": chunk_meta,
            })
        return result

    def split_documents(self, documents: list[dict]) -> list[dict]:
        """Split multiple documents with their metadata."""
        all_chunks = []
        for doc in documents:
            text = doc.get("text", "")
            metadata = doc.get("metadata", {})
            chunks = self.split_text(text, metadata)
            all_chunks.extend(chunks)
        return all_chunks


def chunk_scenic_guide(text: str, source: str) -> list[dict]:
    """Chunk the scenic guide document with source-specific metadata."""
    chunker = ChineseTextChunker(chunk_size=500, chunk_overlap=100)
    return chunker.split_text(text, metadata={
        "source": source,
        "doc_type": "guide",
        "category": "综合",
    })


def chunk_scenic_dataset(text: str, source: str) -> list[dict]:
    """Chunk the structured scenic spot dataset."""
    chunker = ChineseTextChunker(chunk_size=600, chunk_overlap=150)
    return chunker.split_text(text, metadata={
        "source": source,
        "doc_type": "dataset",
        "category": "结构化数据",
    })
