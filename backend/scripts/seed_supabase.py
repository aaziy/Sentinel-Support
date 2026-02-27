"""Seed Supabase documents table with KB articles from a JSONL file.

Usage:
    cd backend
    source .venv/bin/activate
    PYTHONPATH=. python scripts/seed_supabase.py
"""
from __future__ import annotations

import json
import uuid

from app.services.supabase_service import _get_client, _get_embedder, upsert_documents


KB_FILE = "data/kb_articles.jsonl"


def seed() -> None:
    embedder = _get_embedder()

    with open(KB_FILE) as f:
        docs = [json.loads(line) for line in f if line.strip()]

    rows: list[dict] = []
    for doc in docs:
        content = doc["text"]
        embedding = embedder.encode(content).tolist()
        rows.append(
            {
                "id": doc.get("id", str(uuid.uuid4())),
                "content": content,
                "metadata": doc.get("metadata", {}),
                "embedding": embedding,
            }
        )

    # Clear existing docs and re-insert
    client = _get_client()
    try:
        client.table("documents").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        print("🗑  Cleared existing documents.")
    except Exception as e:
        print(f"⚠️  Could not clear documents: {e}")

    upsert_documents(rows)
    print(f"✅  Seeded {len(rows)} KB articles into Supabase documents table.")


if __name__ == "__main__":
    seed()
