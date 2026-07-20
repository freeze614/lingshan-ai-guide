"""Embedding model service using sentence-transformers."""
from typing import Optional

from loguru import logger
from sentence_transformers import SentenceTransformer

from backend.config import settings


_embedding_model: Optional[SentenceTransformer] = None


def get_embedding_model() -> SentenceTransformer:
    """Load or get cached embedding model."""
    global _embedding_model
    if _embedding_model is None:
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        _embedding_model = SentenceTransformer(
            settings.embedding_model,
            device=settings.embedding_device,
            cache_folder=settings.embedding_cache_dir,
        )
        logger.info("Embedding model loaded successfully")
    return _embedding_model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    model = get_embedding_model()
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    """Generate embedding for a single query."""
    model = get_embedding_model()
    embedding = model.encode(
        query,
        normalize_embeddings=True,
    )
    return embedding.tolist()


def get_embedding_dimension() -> int:
    """Get the embedding dimension of the current model."""
    model = get_embedding_model()
    return model.get_sentence_embedding_dimension()
