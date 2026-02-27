"""Pydantic request / response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


# ── Enums matching the Postgres ENUM types ────────────────
class TicketStatus(str, Enum):
    open = "open"
    in_progress = "in_progress"
    awaiting_human = "awaiting_human"
    resolved = "resolved"
    closed = "closed"


class TicketPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


# ── Requests ──────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="User query (max 2000 chars)")
    ticket_id: Optional[str] = Field(None, max_length=100)
    customer_email: Optional[str] = Field(None, max_length=320)
    # Two-turn escalation: when True the backend treats this message as the problem description
    awaiting_problem_description: Optional[bool] = False


class ResumeRequest(BaseModel):
    ticket_id: str = Field(..., max_length=100)
    feedback: Optional[str] = Field(None, max_length=5000)
    query: Optional[str] = Field(None, max_length=2000)


class UpdateEmailRequest(BaseModel):
    ticket_id: str
    customer_email: str


class SaveToKBRequest(BaseModel):
    """Admin saves a resolved ticket Q&A pair into the knowledge base."""
    ticket_id: str = Field(..., max_length=100)
    content: str = Field(..., min_length=1, max_length=10000, description="Curated answer (max 10k chars)")
    metadata: Optional[dict] = None


# ── Responses ─────────────────────────────────────────────
class QueryResponse(BaseModel):
    ticket_id: str
    response: str
    route: str
    is_escalated: bool = False
    # True when bot asked for problem description and is waiting for the next message
    awaiting_problem_description: bool = False


class TicketOut(BaseModel):
    id: str
    query: str
    response: Optional[str] = None
    status: TicketStatus
    priority: TicketPriority = TicketPriority.medium
    assigned_to: Optional[str] = None
    escalation_reason: Optional[str] = None
    extra_metadata: dict = Field(default_factory=dict, alias="metadata")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True
