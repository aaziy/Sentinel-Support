"""Routes incoming queries to the correct processing path.

Two-turn escalation flow
------------------------
Turn 1: User says "speak to a human" → router detects escalation intent
        → routes to "clarify_escalation" → bot asks "What's your issue?"
Turn 2: User provides problem description → the endpoint sets
        awaiting_problem_description=True in the state, router sees it
        → routes directly to "human_escalation" with problem_description set.

Other routes: "retrieval" (KB lookup) | "direct_response" (greeting/farewell)
"""
from __future__ import annotations

import re
from sentence_transformers import SentenceTransformer, util
from langchain_core.messages import HumanMessage

from app.core.engine.state import AgentState

# ── Intent exemplars (embedded once, cached) ──────────────
_RETRIEVAL_EXEMPLARS = [
    "How do I reset my password?",
    "What is the API rate limit?",
    "How do I set up two-factor authentication?",
    "Explain how billing invoices work.",
    "Why is my webhook failing?",
    "Troubleshoot my integration error.",
    "What are the steps to configure SSO?",
]

_ESCALATION_EXEMPLARS = [
    "I need to speak to a real person.",
    "Let me talk to a human agent.",
    "This is urgent, escalate this immediately.",
    "I want to file a complaint.",
    "I've been waiting too long, get me a manager.",
    "Your bot is useless, connect me to support.",
    "I need a refund and your system won't let me.",
]

_DIRECT_EXEMPLARS = [
    "Hello",
    "Thanks for the help!",
    "What time is it?",
    "Who are you?",
    "Goodbye",
    "Tell me a joke.",
]

# Hard keyword patterns for instant escalation-intent detection
_ESCALATION_PATTERNS = re.compile(
    r"\b(human|agent|person|manager|escalat|complain|refund|urgent|speak to|talk to)\b",
    re.IGNORECASE,
)

# Lazy singleton — share with supabase_service to avoid duplicate loads
_model: SentenceTransformer | None = None
_exemplar_embeddings: dict | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        from app.services.supabase_service import _get_embedder
        _model = _get_embedder()
    return _model


def _get_exemplar_embeddings():
    global _exemplar_embeddings
    if _exemplar_embeddings is None:
        model = _get_model()
        _exemplar_embeddings = {
            "retrieval": model.encode(_RETRIEVAL_EXEMPLARS, convert_to_tensor=True),
            "human_escalation": model.encode(_ESCALATION_EXEMPLARS, convert_to_tensor=True),
            "direct_response": model.encode(_DIRECT_EXEMPLARS, convert_to_tensor=True),
        }
    return _exemplar_embeddings


def route_intent(query: str) -> str:
    """Classify a user query into retrieval / direct_response / human_escalation / clarify_escalation."""
    # 1. Fast keyword check for escalation
    if _ESCALATION_PATTERNS.search(query):
        return "clarify_escalation"

    # 2. Semantic similarity against exemplar banks
    model = _get_model()
    exemplars = _get_exemplar_embeddings()
    q_emb = model.encode(query, convert_to_tensor=True)

    scores = {}
    for intent, embs in exemplars.items():
        cos_scores = util.cos_sim(q_emb, embs)[0]
        scores[intent] = float(cos_scores.max())

    best_intent = max(scores, key=scores.get)  # type: ignore[arg-type]

    # 3. Fallback: if nothing scores well, assume retrieval
    if scores[best_intent] < 0.35:
        return "retrieval"

    # Semantic escalation match → also ask for clarification first
    if best_intent == "human_escalation":
        return "clarify_escalation"

    return best_intent


def route_query(state: AgentState) -> AgentState:
    """LangGraph node: classify intent and update state.

    If the state already has awaiting_problem_description=True, the current
    message IS the problem description → skip classification, go straight to
    human_escalation and store the description.
    """
    query = state["query"]
    state["messages"] = state.get("messages") or []
    state["messages"].append(HumanMessage(content=query))

    # ── Two-turn path: second message is the problem description ──
    if state.get("awaiting_problem_description"):
        state["route"] = "human_escalation"
        state["problem_description"] = query
        state["awaiting_problem_description"] = False
        return state

    # ── First-pass classification ──────────────────────────
    intent = route_intent(query)
    state["route"] = intent
    return state
