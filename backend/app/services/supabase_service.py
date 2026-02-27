"""Supabase vector store & DB service – replaces the former Pinecone service."""
from __future__ import annotations

from supabase import create_client, Client
from sentence_transformers import SentenceTransformer
from app.core.config import settings

_client: Client | None = None
_embedder: SentenceTransformer | None = None

EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # 384-dim, runs locally, free


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _client


def _get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBEDDING_MODEL)
    return _embedder


def search_documents(query: str, top_k: int = 5, threshold: float = 0.78) -> list[dict]:
    """Semantic search via the match_documents RPC function (pgvector cosine)."""
    embedding = _get_embedder().encode(query).tolist()
    result = (
        _get_client()
        .rpc(
            "match_documents",
            {
                "query_embedding": embedding,
                "match_threshold": threshold,
                "match_count": top_k,
            },
        )
        .execute()
    )
    return result.data or []


def upsert_documents(rows: list[dict]) -> None:
    """Insert or update rows into the documents table.

    Each row should have: id, content, metadata, embedding.
    """
    _get_client().table("documents").upsert(rows).execute()
