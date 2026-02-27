"""Retrieves relevant context chunks from Supabase pgvector.

If no documents score above the threshold, sets is_escalated=True
so the graph transitions to the escalation node.
"""
from __future__ import annotations

from app.core.engine.state import AgentState
from app.services.supabase_service import search_documents

MIN_SIMILARITY = 0.30  # floor for "relevant" doc


def retrieve_context(state: AgentState) -> AgentState:
    """LangGraph node: run pgvector semantic search."""
    matches = search_documents(state["query"], top_k=5, threshold=MIN_SIMILARITY)
    docs = [m["content"] for m in matches]

    state["retrieved_docs"] = docs

    if not docs:
        # Nothing relevant – flag for escalation
        state["is_escalated"] = True
        state["escalation_reason"] = (
            "No relevant knowledge-base articles found for this query."
        )
    else:
        state["is_escalated"] = False

    return state
