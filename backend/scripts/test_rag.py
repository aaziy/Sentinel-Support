"""
Diagnostic script: verify Supabase pgvector RAG retrieval.

Usage:
    python -m scripts.test_rag
    python -m scripts.test_rag --query "How do I reset my password?" --threshold 0.7 --top-k 3
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Any

from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

load_dotenv()

# ── Constants ────────────────────────────────────────────
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # 384-dim, runs locally, free
DEFAULT_THRESHOLD = 0.7
DEFAULT_TOP_K = 3

# ── ANSI colours ─────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"


# ── Clients ──────────────────────────────────────────────
def _get_clients() -> tuple[SentenceTransformer, Client]:
    missing = [
        v for v in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
        if not os.getenv(v)
    ]
    if missing:
        print(f"{RED}✗ Missing environment variables: {', '.join(missing)}{RESET}")
        sys.exit(1)

    model = SentenceTransformer(EMBEDDING_MODEL)
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    return model, sb


# ── Core ─────────────────────────────────────────────────
def verify_retrieval(
    query_text: str,
    threshold: float = DEFAULT_THRESHOLD,
    top_k: int = DEFAULT_TOP_K,
) -> bool:
    """
    Embed query_text, call match_documents RPC, print results.
    Returns True if at least one result passes the threshold.
    """
    model, sb = _get_clients()

    print(f"\n{BOLD}{'─' * 60}{RESET}")
    print(f"{BOLD}🔍 Query:{RESET}  {CYAN}{query_text}{RESET}")
    print(f"{BOLD}Settings:{RESET} top_k={top_k}  threshold={threshold}")
    print(f"{BOLD}{'─' * 60}{RESET}\n")

    # 1. Generate embedding (local, free)
    print("⏳ Generating embedding …", end=" ", flush=True)
    embedding: list[float] = model.encode(query_text).tolist()
    print(f"{GREEN}done{RESET}  (dim={len(embedding)})\n")

    # 2. Call Supabase RPC
    print("⏳ Calling match_documents RPC …", end=" ", flush=True)
    response = (
        sb.rpc(
            "match_documents",
            {
                "query_embedding": embedding,
                "match_threshold": threshold,
                "match_count": top_k,
            },
        )
        .execute()
    )
    results: list[dict[str, Any]] = response.data or []
    print(f"{GREEN}done{RESET}  ({len(results)} result(s) returned)\n")

    if not results:
        print(f"{RED}✗ No results returned above threshold {threshold}.{RESET}")
        print(f"  → Try lowering --threshold or re-running the ingestion script.\n")
        _print_verdict(passed=False)
        return False

    # 3. Print results
    any_pass = False
    for rank, doc in enumerate(results, 1):
        sim: float = doc.get("similarity", 0.0)
        content: str = doc.get("content", "").strip()
        doc_id: str = str(doc.get("id", ""))[:8]
        metadata: dict = doc.get("metadata", {})
        source: str = metadata.get("source", "—")

        passed = sim >= threshold
        any_pass = any_pass or passed
        status_icon = f"{GREEN}PASS ✓{RESET}" if passed else f"{RED}FAIL ✗{RESET}"
        bar = _score_bar(sim)

        print(f"  {BOLD}#{rank}{RESET}  [{status_icon}]  similarity={YELLOW}{sim:.4f}{RESET}  {bar}")
        print(f"       id={doc_id}…  source={CYAN}{source}{RESET}")
        print(f"       {BOLD}Content:{RESET} {content[:200]}{'…' if len(content) > 200 else ''}")
        print()

    _print_verdict(passed=any_pass, threshold=threshold)
    return any_pass


# ── Helpers ───────────────────────────────────────────────
def _score_bar(score: float, width: int = 20) -> str:
    filled = round(score * width)
    bar = "█" * filled + "░" * (width - filled)
    return f"[{bar}] {score:.0%}"


def _print_verdict(passed: bool, threshold: float = DEFAULT_THRESHOLD) -> None:
    print(f"{BOLD}{'─' * 60}{RESET}")
    if passed:
        print(
            f"{GREEN}{BOLD}✅  OVERALL: PASS{RESET}"
            f" — At least one result scored ≥ {threshold}\n"
        )
    else:
        print(
            f"{RED}{BOLD}❌  OVERALL: FAIL{RESET}"
            f" — No results scored ≥ {threshold}\n"
            f"  Suggestions:\n"
            f"  • Lower --threshold (currently {threshold})\n"
            f"  • Re-ingest docs:  python -m scripts.ingest --dir data\n"
            f"  • Check that match_documents RPC exists in Supabase SQL Editor\n"
        )
    print(f"{BOLD}{'─' * 60}{RESET}\n")


# ── CLI ───────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Verify Supabase pgvector RAG retrieval"
    )
    parser.add_argument(
        "--query",
        default="How does the human-in-the-loop handoff work?",
        help="Query string to test retrieval with",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"Minimum similarity score to PASS (default: {DEFAULT_THRESHOLD})",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=DEFAULT_TOP_K,
        help=f"Number of results to retrieve (default: {DEFAULT_TOP_K})",
    )
    args = parser.parse_args()

    passed = verify_retrieval(
        query_text=args.query,
        threshold=args.threshold,
        top_k=args.top_k,
    )
    sys.exit(0 if passed else 1)
