"""ORM models matching the Supabase migration schema."""
import uuid

from sqlalchemy import Column, String, Text, DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.session import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query = Column(Text, nullable=False)
    response = Column(Text, nullable=True)
    status = Column(
        Enum("open", "in_progress", "awaiting_human", "resolved", "closed",
             name="ticket_status", create_type=False),
        nullable=False,
        server_default="open",
    )
    priority = Column(
        Enum("low", "medium", "high", "critical",
             name="ticket_priority", create_type=False),
        nullable=False,
        server_default="medium",
    )
    assigned_to = Column(String, nullable=True)
    escalation_reason = Column(Text, nullable=True)
    extra_metadata = Column("metadata", JSONB, nullable=False, server_default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
