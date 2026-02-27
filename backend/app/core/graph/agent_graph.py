"""
LangGraph Agent Graph – Agentic Support Automator
==================================================

State Machine:
                          ┌─────────────┐
                          │   router     │
                          └──────┬──────┘
                 ┌───────────────┼──────────────────┐
                 ▼               ▼                  ▼
          ┌────────────┐  ┌────────────┐    ┌──────────────┐
          │ retriever   │  │  direct    │    │ escalate_to  │
          └──────┬─────┘  │ responder  │    │    human     │ ◄─ interrupt_before
                 │         └─────┬──────┘    └──────┬───────┘
                 ▼               │                  │
       ┌─ is_escalated? ─┐      │                  │
       │ yes         no   │      │                  │
       ▼              ▼   │      ▼                  ▼
  escalate_to    responder│     END                END
     human          │     │
       │            ▼     │
       ▼           END    │
      END                 │

Persistence: PostgresSaver checkpointer injected per-request.
HITL:        interrupt_before=["escalate_to_human"]
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from contextlib import contextmanager

# ── Monkey-patch for langgraph 0.1.5 / langgraph-checkpoint 1.0.x compat ──
# The checkpoint package rewrites pregel functions that assume
# checkpoint["versions_seen"] already contains keys like "__start__" and
# "__interrupt__", but langgraph 0.1.5's empty_checkpoint() returns a plain
# dict: versions_seen = {}.  Any [key] access raises KeyError.
#
# Fix: make empty_checkpoint() return versions_seen as a defaultdict(dict)
# so missing keys silently resolve to {}.
import langgraph.checkpoint.base as _ckpt_base
import langgraph.pregel as _pregel_mod

_orig_empty_checkpoint = _ckpt_base.empty_checkpoint

def _patched_empty_checkpoint() -> dict:
    cp = _orig_empty_checkpoint()
    cp["versions_seen"] = defaultdict(dict, cp.get("versions_seen", {}))
    return cp

# Patch everywhere the function is referenced
_ckpt_base.empty_checkpoint = _patched_empty_checkpoint
_pregel_mod.empty_checkpoint = _patched_empty_checkpoint

# Also patch create_checkpoint — the ckpt_base version imports a DIFFERENT
# EmptyChannelError class than the one channels actually raise, so its
# try/except never catches.  We capture the pregel module's own version
# (which imports the correct EmptyChannelError) and wrap it.
_orig_create_checkpoint = _pregel_mod.create_checkpoint  # the pregel-native one

def _patched_create_checkpoint(checkpoint, channels, step):
    cp = _orig_create_checkpoint(checkpoint, channels, step)
    if not isinstance(cp["versions_seen"], defaultdict):
        cp["versions_seen"] = defaultdict(dict, cp["versions_seen"])
    return cp

_ckpt_base.create_checkpoint = _patched_create_checkpoint
_pregel_mod.create_checkpoint = _patched_create_checkpoint

# Patch copy_checkpoint – the original does a dict comprehension that
# strips the defaultdict back to a plain dict.
_orig_copy_checkpoint = _ckpt_base.copy_checkpoint

def _patched_copy_checkpoint(checkpoint):
    cp = _orig_copy_checkpoint(checkpoint)
    if not isinstance(cp["versions_seen"], defaultdict):
        cp["versions_seen"] = defaultdict(dict, cp["versions_seen"])
    return cp

_ckpt_base.copy_checkpoint = _patched_copy_checkpoint
_pregel_mod.copy_checkpoint = _patched_copy_checkpoint
# ── End monkey-patch ─────────────────────────────────────

from langgraph.graph import StateGraph, END

from app.core.engine.state import AgentState
from app.core.engine.router import route_query
from app.core.engine.retriever import retrieve_context
from app.core.engine.responder import generate_response, generate_direct_response, generate_clarification_response
from app.core.config import settings
from app.services.supabase_service import _get_client
from app.core.graph.memory_saver import SimpleMemorySaver


# ── Escalation node ──────────────────────────────────────
def escalate_to_human(state: AgentState) -> AgentState:
    """Create a ticket in Supabase and mark the conversation as escalated.

    This node is protected by `interrupt_before` – the graph pauses
    *before* entering this node so a human can review/resume.
    """
    ticket_id = state.get("ticket_id") or str(uuid.uuid4())
    reason = state.get("escalation_reason") or "User requested human assistance."

    # Prefer the explicit problem description collected in turn 2;
    # fall back to the raw query.
    problem_desc = state.get("problem_description") or state["query"]

    # Build conversation summary for the admin (last 6 messages, human turns only)
    msgs = state.get("messages") or []
    conv_lines = []
    for m in msgs:
        role = "Customer" if m.__class__.__name__ == "HumanMessage" else "Bot"
        conv_lines.append(f"{role}: {m.content}")
    conversation_summary = "\n".join(conv_lines[-6:])  # last 6 exchanges

    # Build metadata with optional customer_email + full context
    meta = {
        "route": state.get("route", "human_escalation"),
        "problem_description": problem_desc,
        "conversation_summary": conversation_summary,
    }
    if state.get("customer_email"):
        meta["customer_email"] = state["customer_email"]

    # Persist the ticket to Supabase
    _get_client().table("tickets").upsert(
        {
            "id": ticket_id,
            "query": problem_desc,          # store problem description, not just "speak to a human"
            "status": "awaiting_human",
            "escalation_reason": reason,
            "metadata": meta,
        }
    ).execute()

    state["is_escalated"] = True
    state["ticket_id"] = ticket_id
    state["response"] = (
        "Your request has been escalated to a human support agent. "
        f"Your ticket ID is **{ticket_id}**. "
        "A member of our team will follow up shortly."
    )
    return state


# ── Conditional edge helpers ─────────────────────────────
def _after_router(state: AgentState) -> str:
    """Decide the next node based on the routing decision."""
    route = state.get("route", "retrieval")
    if route == "human_escalation":
        return "escalate_to_human"
    elif route == "clarify_escalation":
        return "clarify_responder"
    elif route == "direct_response":
        return "direct_responder"
    else:  # "retrieval" or fallback
        return "retriever"


def _after_retriever(state: AgentState) -> str:
    """After retrieval, escalate if no docs were found."""
    if state.get("is_escalated"):
        return "escalate_to_human"
    return "responder"


# ── Graph construction ───────────────────────────────────
def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # Nodes
    graph.add_node("router", route_query)
    graph.add_node("retriever", retrieve_context)
    graph.add_node("responder", generate_response)
    graph.add_node("direct_responder", generate_direct_response)
    graph.add_node("clarify_responder", generate_clarification_response)
    graph.add_node("escalate_to_human", escalate_to_human)

    # Entry
    graph.set_entry_point("router")

    # Edges from router (conditional)
    graph.add_conditional_edges(
        "router",
        _after_router,
        {
            "retriever": "retriever",
            "direct_responder": "direct_responder",
            "clarify_responder": "clarify_responder",
            "escalate_to_human": "escalate_to_human",
        },
    )

    # Edges from retriever (conditional – might escalate)
    graph.add_conditional_edges(
        "retriever",
        _after_retriever,
        {
            "responder": "responder",
            "escalate_to_human": "escalate_to_human",
        },
    )

    # Terminal edges
    graph.add_edge("responder", END)
    graph.add_edge("direct_responder", END)
    graph.add_edge("clarify_responder", END)
    graph.add_edge("escalate_to_human", END)

    return graph


def compile_graph(checkpointer=None):
    """Compile the graph with a checkpointer.

    When a checkpointer is provided the graph enables Human-in-the-Loop:
    it will pause *before* entering escalate_to_human so a human can
    inspect and resume the thread.
    """
    graph = build_graph()

    # Always use a checkpointer (in-memory if none given) because
    # langgraph-checkpoint 1.0.x requires one for _prepare_next_tasks.
    if checkpointer is None:
        checkpointer = SimpleMemorySaver()

    return graph.compile(
        checkpointer=checkpointer,
        interrupt_before=["escalate_to_human"],
    )


# Default graph instance (in-memory checkpointer, HITL enabled)
support_graph = compile_graph()

# Shared in-memory saver (persists across requests within the same process)
_memory_saver = SimpleMemorySaver()


@contextmanager
def get_checkpointer():
    """Context manager that yields a checkpointer for per-request use.

    Currently uses an in-memory saver.  To switch to Postgres persistence,
    upgrade langgraph to >=0.2.0 and uncomment the PostgresSaver block:

        from langgraph.checkpoint.postgres import PostgresSaver
        with PostgresSaver.from_conn_string(settings.DATABASE_URL) as cp:
            cp.setup()
            yield cp
    """
    yield _memory_saver
