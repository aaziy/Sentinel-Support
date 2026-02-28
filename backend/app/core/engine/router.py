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
import logging
from langchain_core.messages import HumanMessage

from app.core.engine.state import AgentState

logger = logging.getLogger(__name__)

# Hard keyword patterns for instant escalation-intent detection
_ESCALATION_PATTERNS = re.compile(
    r"\b(human|agent|person|manager|escalat|complain|refund|urgent|speak to|talk to)\b",
    re.IGNORECASE,
)

# Greeting / farewell patterns
_GREETING_PATTERNS = re.compile(
    r"^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy|sup|yo|greetings)\b",
    re.IGNORECASE,
)
_FAREWELL_PATTERNS = re.compile(
    r"\b(bye|goodbye|thanks|thank\s*you|see\s*you|take\s*care|cheers)\b",
    re.IGNORECASE,
)
_SIMPLE_PATTERNS = re.compile(
    r"^(who\s+are\s+you|what\s+are\s+you|what\s+time|tell\s+me\s+a\s+joke|how\s+are\s+you)\b",
    re.IGNORECASE,
)


def route_intent(query: str) -> str:
    """Classify a user query into retrieval / direct_response / human_escalation / clarify_escalation.

    Uses keyword-based matching (no ML model required — works on Render free tier
    where HuggingFace downloads are blocked).
    """
    q = query.strip()

    # 1. Escalation keywords
    if _ESCALATION_PATTERNS.search(q):
        return "clarify_escalation"

    # 2. Greetings / farewells / simple queries
    if _GREETING_PATTERNS.search(q) or _FAREWELL_PATTERNS.search(q) or _SIMPLE_PATTERNS.search(q):
        return "direct_response"

    # 3. Short vague queries (1-2 words, not a question) → direct
    words = q.split()
    if len(words) <= 2 and not q.endswith("?"):
        return "direct_response"

    # 4. Everything else → retrieval (KB lookup)
    return "retrieval"


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
