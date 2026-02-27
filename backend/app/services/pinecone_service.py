"""Pinecone vector store service."""
from pinecone import Pinecone
from langchain_openai import OpenAIEmbeddings
from app.core.config import settings

_pc = Pinecone(api_key=settings.PINECONE_API_KEY)
_index = _pc.Index(settings.PINECONE_INDEX_NAME)
_embedder = OpenAIEmbeddings(api_key=settings.OPENAI_API_KEY)


def query_index(text: str, top_k: int = 5) -> list[dict]:
    vector = _embedder.embed_query(text)
    result = _index.query(vector=vector, top_k=top_k, include_metadata=True)
    return result.get("matches", [])


def upsert_documents(documents: list[dict]) -> None:
    """Upsert pre-embedded documents: [{'id': str, 'values': list, 'metadata': dict}]"""
    _index.upsert(vectors=documents)
