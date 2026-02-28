"""GET /api/v1/tickets – list all support tickets (via Supabase)."""
from fastapi import APIRouter, HTTPException
from typing import List, Optional
from app.services.supabase_service import _get_client

router = APIRouter()


@router.get("/")
def list_tickets(skip: int = 0, limit: int = 50, status: Optional[str] = None):
    """List tickets from Supabase, optionally filtered by status."""
    try:
        client = _get_client()
        query = client.table("tickets").select("*").order("created_at", desc=True)
        if status:
            query = query.eq("status", status)
        query = query.range(skip, skip + limit - 1)
        result = query.execute()
        return result.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str):
    """Get a single ticket by ID."""
    try:
        client = _get_client()
        result = (
            client.table("tickets")
            .select("*")
            .eq("id", ticket_id)
            .single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Ticket not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
