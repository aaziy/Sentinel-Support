"""
Ingest documents into Supabase (pgvector) for RAG.

Supports .txt, .md, and .json/.jsonl files from the /data folder.
Chunks large documents, generates embeddings via OpenAI text-embedding-3-small,
and upserts into the `documents` table.

Usage:
    python -m scripts.ingest                      # default: ./data
    python -m scripts.ingest --dir /path/to/docs
    python -m scripts.ingest --dir ./data --batch-size 50
"""
from __future__ import annotations

import argparse
import json
import os
import uuid
from pathlib import Path
from typing import Iterator

from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

load_dotenv()

# ── Config ────────────────────────────────────────────────
SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # 384-dim, runs locally, free
EMBEDDING_DIM = 384
CHUNK_SIZE = 1000   # characters per chunk
CHUNK_OVERLAP = 200


# ── Helpers ───────────────────────────────────────────────
def _supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


_model: SentenceTransformer | None = None

def _get_embedder() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks."""
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += size - overlap
    return chunks


def load_documents(directory: str) -> Iterator[dict]:
    """Yield {'content': str, 'metadata': dict} from supported files."""
    data_dir = Path(directory)
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    for file_path in sorted(data_dir.rglob("*")):
        if file_path.is_dir():
            continue

        suffix = file_path.suffix.lower()

        if suffix in (".txt", ".md"):
            text = file_path.read_text(encoding="utf-8")
            for i, chunk in enumerate(chunk_text(text)):
                yield {
                    "content": chunk,
                    "metadata": {
                        "source": str(file_path.relative_to(data_dir)),
                        "chunk_index": i,
                        "file_type": suffix,
                    },
                }

        elif suffix == ".jsonl":
            for line_no, line in enumerate(file_path.open(encoding="utf-8"), 1):
                doc = json.loads(line)
                text = doc.get("text") or doc.get("content", "")
                for i, chunk in enumerate(chunk_text(text)):
                    yield {
                        "content": chunk,
                        "metadata": {
                            **doc.get("metadata", {}),
                            "source": doc.get("source", str(file_path.name)),
                            "line": line_no,
                            "chunk_index": i,
                        },
                    }

        elif suffix == ".json":
            data = json.loads(file_path.read_text(encoding="utf-8"))
            items = data if isinstance(data, list) else [data]
            for idx, doc in enumerate(items):
                text = doc.get("text") or doc.get("content", "")
                for i, chunk in enumerate(chunk_text(text)):
                    yield {
                        "content": chunk,
                        "metadata": {
                            **doc.get("metadata", {}),
                            "source": doc.get("source", str(file_path.name)),
                            "doc_index": idx,
                            "chunk_index": i,
                        },
                    }


def embed_texts(model: SentenceTransformer, texts: list[str]) -> list[list[float]]:
    """Batch-embed a list of strings using local model."""
    embeddings = model.encode(texts)
    return [emb.tolist() for emb in embeddings]


# ── Main ──────────────────────────────────────────────────
def ingest(directory: str, batch_size: int = 100) -> None:
    sb = _supabase()
    oai = _get_embedder()

    batch: list[dict] = []
    total = 0

    for doc in load_documents(directory):
        batch.append(doc)

        if len(batch) >= batch_size:
            _flush(sb, oai, batch)
            total += len(batch)
            batch.clear()
            print(f"  ✓ {total} chunks upserted …")

    if batch:
        _flush(sb, oai, batch)
        total += len(batch)

    print(f"\n✅  Ingestion complete — {total} chunks upserted into 'documents'.")


def _flush(sb: Client, oai: OpenAI, batch: list[dict]) -> None:
    texts = [d["content"] for d in batch]
    embeddings = embed_texts(oai, texts)

    rows = [
        {
            "id": str(uuid.uuid4()),
            "content": doc["content"],
            "metadata": doc["metadata"],
            "embedding": emb,
        }
        for doc, emb in zip(batch, embeddings)
    ]

    sb.table("documents").upsert(rows).execute()


# ── CLI ───────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest docs into Supabase pgvector")
    parser.add_argument("--dir", default="data", help="Path to documents folder")
    parser.add_argument("--batch-size", type=int, default=100, help="Upsert batch size")
    args = parser.parse_args()

    ingest(args.dir, args.batch_size)
