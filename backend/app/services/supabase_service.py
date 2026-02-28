"""Supabase vector store & DB service – replaces the former Pinecone service."""
from __future__ import annotations
import logging

from supabase import create_client, Client
from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _client


def _get_embedder():
    """Kept for backwards compatibility — returns None since we no longer
    use SentenceTransformer on Render (HuggingFace downloads are blocked)."""
    return None


def search_documents(query: str, top_k: int = 5, threshold: float = 0.78) -> list[dict]:
    """Text-based document search using Supabase ilike.

    Replaces the former pgvector cosine search because Render free tier
    cannot download the SentenceTransformer model from HuggingFace.
    Falls back to returning empty list on any error.
    """
    try:
        # Split query into keywords and search for any match
        keywords = [w.strip() for w in query.split() if len(w.strip()) > 2]
        if not keywords:
            return []

        client = _get_client()
        # Use Supabase textSearch with OR for each keyword
        # Fallback: use ilike with the full query
        result = (
            client.table("documents")
            .select("id, content, metadata")
            .ilike("content", f"%{query}%")
            .limit(top_k)
            .execute()
        )

        docs = result.data or []

        # If no results, try individual keywords
        if not docs and len(keywords) > 1:
            for kw in keywords[:3]:  # limit to first 3 keywords
                result = (
                    client.table("documents")
                    .select("id, content, metadata")
                    .ilike("content", f"%{kw}%")
                    .limit(top_k)
                    .execute()
                )
                if result.data:
                    docs.extend(result.data)
            # Deduplicate by id
            seen = set()
            unique_docs = []
            for d in docs:
                if d["id"] not in seen:
                    seen.add(d["id"])
                    unique_docs.append(d)
            docs = unique_docs[:top_k]

        return docs
    except Exception as e:
        logger.warning("search_documents failed: %s", e)
        return []


def upsert_documents(rows: list[dict]) -> None:
    """Insert or update rows into the documents table.

    Each row should have: id, content, metadata, embedding.
    """
    _get_client().table("documents").upsert(rows).execute()
