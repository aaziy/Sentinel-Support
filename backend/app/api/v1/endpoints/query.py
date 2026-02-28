"""POST /api/v1/query – run a support query through the LangGraph agent.

Endpoints:
  POST /           – start a new support query
  POST /resume     – resume an interrupted (escalated) thread after human review
  POST /email      – attach a customer email to an escalated ticket
  POST /save-to-kb – save a resolved ticket Q&A pair to the knowledge base
"""
import uuid
import re
import logging
import traceback
from typing import Optional

from fastapi import APIRouter, Request, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address
from langchain_core.messages import HumanMessage

from app.schemas.ticket import (
    QueryRequest,
    QueryResponse,
    ResumeRequest,
    UpdateEmailRequest,
    SaveToKBRequest,
)
from app.core.graph.agent_graph import support_graph  # shared graph + checkpointer
from app.services.supabase_service import _get_client, upsert_documents
from app.services.email_service import send_resolution_email

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger(__name__)

# ── Input sanitisation ─────────────────────────────────────
MAX_QUERY_LEN = 2000
MAX_FEEDBACK_LEN = 5000

def _sanitise(text: Optional[str], max_len: int = MAX_QUERY_LEN) -> Optional[str]:
    """Strip dangerous chars, cap length."""
    if text is None:
        return None
    # Remove null bytes and control characters (keep newlines, tabs)
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    return cleaned.strip()[:max_len] or None


def _initial_state(query: str, ticket_id: str, customer_email: Optional[str] = None,
                   problem_description: Optional[str] = None,
                   awaiting_problem_description: bool = False) -> dict:
    return {
        "messages": [HumanMessage(content=query)],
        "query": query,
        "route": None,
        "retrieved_docs": [],
        "is_escalated": False,
        "response": None,
        "ticket_id": ticket_id,
        "escalation_reason": None,
        "customer_email": customer_email,
        "problem_description": problem_description,
        "awaiting_problem_description": awaiting_problem_description,
    }


@router.post("/", response_model=QueryResponse)
@limiter.limit("15/minute")
async def run_query(request: Request, payload: QueryRequest):
    """Start a new support query through the agent graph.

    Two-turn escalation flow:
      - Turn 1: user says "speak to a human" → route=clarify_escalation,
                bot asks for problem description, awaiting_problem_description=True
      - Turn 2: user sends problem description with awaiting_problem_description=True
                → route=human_escalation, ticket created with full context
    """
    query = _sanitise(payload.query, MAX_QUERY_LEN)
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    ticket_id = payload.ticket_id or str(uuid.uuid4())
    initial = _initial_state(
        query,
        ticket_id,
        payload.customer_email,
        awaiting_problem_description=bool(payload.awaiting_problem_description),
    )
    config = {"configurable": {"thread_id": ticket_id}}

    try:
        result = support_graph.invoke(initial, config=config)
    except Exception as e:
        logger.error("Graph invoke failed: %s\n%s", e, traceback.format_exc())
        # Return a graceful error instead of crashing with 500
        return QueryResponse(
            ticket_id=ticket_id,
            response="I'm sorry, something went wrong processing your request. Please try again.",
            route="error",
            is_escalated=False,
        )

    route = result.get("route", "unknown")
    is_escalated = result.get("is_escalated", False)
    awaiting_desc = result.get("awaiting_problem_description", False)

    # If turn 2: graph paused before escalate_to_human — create placeholder ticket
    # with the problem description already stored in metadata
    if route == "human_escalation" and not is_escalated:
        problem_desc = result.get("problem_description") or payload.query
        meta: dict = {"route": "human_escalation", "problem_description": problem_desc}
        if payload.customer_email:
            meta["customer_email"] = payload.customer_email
        try:
            _get_client().table("tickets").upsert({
                "id": ticket_id,
                "query": problem_desc,
                "status": "awaiting_human",
                "escalation_reason": "User requested human assistance.",
                "metadata": meta,
            }).execute()
        except Exception:
            pass  # Non-critical

    return QueryResponse(
        ticket_id=ticket_id,
        response=result.get("response") or "Escalated to human agent.",
        route=route,
        is_escalated=is_escalated,
        awaiting_problem_description=bool(awaiting_desc),
    )


@router.post("/resume", response_model=QueryResponse)
@limiter.limit("15/minute")
async def resume_query(request: Request, payload: ResumeRequest):
    """Resume an interrupted (escalated) thread after human intervention.

    After the graph completes, sends a resolution email to the customer
    if they provided an email address.
    """
    ticket_id = payload.ticket_id
    if not ticket_id:
        return QueryResponse(
            ticket_id="",
            response="ticket_id is required to resume a thread.",
            route="error",
            is_escalated=False,
        )

    config = {"configurable": {"thread_id": ticket_id}}

    # Resume – pass None to continue from the interrupt point.
    # The in-memory checkpointer loses state on server restart (Render
    # free-tier sleeps after inactivity), so handle the missing-thread
    # case gracefully instead of crashing with a 500.
    try:
        result = support_graph.invoke(None, config=config)
        response_text = result.get("response") or "Thread resumed."
        route = result.get("route", "unknown")
        is_escalated = result.get("is_escalated", False)
    except Exception:
        # Thread state was lost (server restarted).
        response_text = (
            payload.feedback
            or "Resolved by admin (thread state expired after server restart)."
        )
        route = "admin_resolved"
        is_escalated = True

    # Always mark the ticket as resolved in Supabase so it leaves
    # the admin queue on every browser (whether the graph resumed
    # successfully or the thread state was lost).
    try:
        client = _get_client()
        client.table("tickets").update(
            {"status": "resolved", "response": response_text}
        ).eq("id", ticket_id).execute()
    except Exception:
        pass

    # ── Send resolution email if customer provided one ─────
    try:
        client = _get_client()
        row = (
            client.table("tickets")
            .select("query, metadata")
            .eq("id", ticket_id)
            .single()
            .execute()
        )
        if row.data:
            meta = row.data.get("metadata") or {}
            customer_email = meta.get("customer_email") if isinstance(meta, dict) else None
            original_query = row.data.get("query", "")

            if customer_email:
                # Use admin's feedback if provided, else use the agent's response
                resolution = payload.feedback or response_text
                send_resolution_email(
                    to_email=customer_email,
                    ticket_id=ticket_id,
                    original_query=original_query,
                    resolution=resolution,
                )
    except Exception:
        pass  # Email failure should never break the resume flow

    return QueryResponse(
        ticket_id=ticket_id,
        response=response_text,
        route=route,
        is_escalated=is_escalated,
    )


@router.post("/resend-email")
async def resend_resolution_email(payload: ResumeRequest):
    """Manually re-send the resolution email to the customer.

    Uses ticket data from Supabase — no need to re-run the graph.
    """
    client = _get_client()
    try:
        row = (
            client.table("tickets")
            .select("query, response, metadata")
            .eq("id", payload.ticket_id)
            .single()
            .execute()
        )
    except Exception:
        return {"ok": False, "error": "Ticket not found"}

    if not row.data:
        return {"ok": False, "error": "Ticket not found"}

    meta = row.data.get("metadata") or {}
    customer_email = meta.get("customer_email") if isinstance(meta, dict) else None

    if not customer_email:
        return {"ok": False, "error": "No customer email on this ticket"}

    resolution = payload.feedback or row.data.get("response") or "Your ticket has been resolved."
    result = send_resolution_email(
        to_email=customer_email,
        ticket_id=payload.ticket_id,
        original_query=row.data.get("query", ""),
        resolution=resolution,
    )
    return result


@router.post("/email")
async def update_email(payload: UpdateEmailRequest):
    """Attach a customer email to an escalated ticket (stored in metadata)."""
    client = _get_client()

    try:
        # Fetch existing metadata
        row = (
            client.table("tickets")
            .select("metadata")
            .eq("id", payload.ticket_id)
            .single()
            .execute()
        )
    except Exception:
        return {"ok": False, "error": "Ticket not found"}

    existing_meta = row.data.get("metadata") if row.data else {}
    if not isinstance(existing_meta, dict):
        existing_meta = {}

    # Merge customer_email into metadata
    existing_meta["customer_email"] = payload.customer_email

    client.table("tickets").update(
        {"metadata": existing_meta}
    ).eq("id", payload.ticket_id).execute()

    return {"ok": True, "ticket_id": payload.ticket_id}


@router.post("/save-to-kb")
async def save_to_kb(payload: SaveToKBRequest):
    """Admin saves a curated Q&A pair from a resolved ticket into the knowledge base.

    Embeds the content and inserts it into the `documents` table for future RAG retrieval.
    """
    client = _get_client()

    # Fetch the original ticket for context
    try:
        ticket_row = (
            client.table("tickets")
            .select("query, response, metadata")
            .eq("id", payload.ticket_id)
            .single()
            .execute()
        )
    except Exception:
        return {"ok": False, "error": "Ticket not found"}

    original_query = ticket_row.data.get("query", "") if ticket_row.data else ""

    # Build the document content: combine original question + curated answer
    doc_content = f"Q: {original_query}\nA: {payload.content}"

    # Generate a zero embedding (text search is used instead of vector search
    # on Render free tier where HuggingFace is unreachable)
    embedding = [0.0] * 384  # placeholder 384-dim zero vector

    # Build metadata
    doc_meta = {
        "source": "admin_curated",
        "from_ticket": payload.ticket_id,
        "original_query": original_query,
        **(payload.metadata or {}),
    }

    # Insert into documents table
    doc_id = str(uuid.uuid4())
    upsert_documents([
        {
            "id": doc_id,
            "content": doc_content,
            "metadata": doc_meta,
            "embedding": embedding,
        }
    ])

    return {"ok": True, "document_id": doc_id, "ticket_id": payload.ticket_id}
