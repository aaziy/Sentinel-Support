"""Script: seed Pinecone index with documents from a JSONL file.

Usage:
    python scripts/seed_pinecone.py --file data/kb_articles.jsonl
"""
import argparse
import json
import uuid
from langchain_openai import OpenAIEmbeddings
from pinecone import Pinecone
from app.core.config import settings


def seed(file_path: str, batch_size: int = 100) -> None:
    embedder = OpenAIEmbeddings(api_key=settings.OPENAI_API_KEY)
    pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    index = pc.Index(settings.PINECONE_INDEX_NAME)

    with open(file_path) as f:
        docs = [json.loads(line) for line in f]

    batch: list[dict] = []
    for doc in docs:
        vector = embedder.embed_query(doc["text"])
        batch.append(
            {
                "id": doc.get("id", str(uuid.uuid4())),
                "values": vector,
                "metadata": {"text": doc["text"], "source": doc.get("source", "")},
            }
        )
        if len(batch) >= batch_size:
            index.upsert(vectors=batch)
            batch.clear()

    if batch:
        index.upsert(vectors=batch)

    print(f"✅  Seeded {len(docs)} documents into '{settings.PINECONE_INDEX_NAME}'.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    args = parser.parse_args()
    seed(args.file)
