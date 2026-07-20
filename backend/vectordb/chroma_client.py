"""ChromaDB client singleton for vector storage."""
import os
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings

from backend.config import settings


# Collection names
SCENIC_KNOWLEDGE_COLLECTION = "scenic_knowledge"
CONVERSATION_HISTORY_COLLECTION = "conversation_history"

_client = None


def get_chroma_client() -> chromadb.PersistentClient:
    """Get or create the ChromaDB persistent client."""
    global _client
    if _client is None:
        persist_dir = os.path.abspath(settings.chroma_persist_dir)
        Path(persist_dir).mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(
            path=persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def get_knowledge_collection() -> chromadb.Collection:
    """Get or create the scenic knowledge collection."""
    client = get_chroma_client()
    try:
        return client.get_collection(SCENIC_KNOWLEDGE_COLLECTION)
    except Exception:
        return client.create_collection(
            name=SCENIC_KNOWLEDGE_COLLECTION,
            metadata={
                "description": "灵山胜境景区知识库",
                "embedding_model": settings.embedding_model,
                "hnsw:space": "cosine",
            },
        )


def get_conversation_collection() -> chromadb.Collection:
    """Get or create the conversation history collection."""
    client = get_chroma_client()
    try:
        return client.get_collection(CONVERSATION_HISTORY_COLLECTION)
    except Exception:
        return client.create_collection(
            name=CONVERSATION_HISTORY_COLLECTION,
            metadata={
                "description": "对话历史缓存",
                "hnsw:space": "cosine",
            },
        )


def reset_collection(collection_name: str):
    """Delete and recreate a collection (for re-indexing)."""
    client = get_chroma_client()
    try:
        client.delete_collection(collection_name)
    except Exception:
        pass
    return client.create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )
