"""Shared TypedDict state passed between LangGraph nodes."""
from __future__ import annotations

from typing import TypedDict, Optional
from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    """State that flows through every node in the support graph.

    Attributes:
        messages:        Chat history (LangChain message objects).
        query:           The original user question.
        route:           Routing decision – "retrieval" | "direct_response" | "human_escalation" | "clarify_escalation".
        retrieved_docs:  Document chunks returned by pgvector search.
        is_escalated:    True when the query should be handed to a human.
        response:        Final answer returned to the user.
        ticket_id:       Unique ID for this support thread.
        escalation_reason: Why the query was escalated.
        customer_email:  Optional email provided by the customer for follow-up.
        problem_description: Full problem context collected in two-turn escalation flow.
        awaiting_problem_description: True when bot asked for problem context and is waiting for reply.
    """
    messages: list[BaseMessage]
    query: str
    route: Optional[str]
    retrieved_docs: list[str]
    is_escalated: bool
    response: Optional[str]
    ticket_id: Optional[str]
    escalation_reason: Optional[str]
    customer_email: Optional[str]
    problem_description: Optional[str]
    awaiting_problem_description: Optional[bool]
