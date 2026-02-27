"""GET /api/v1/tickets – list all support tickets."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.db.models import Ticket
from app.schemas.ticket import TicketOut

router = APIRouter()


@router.get("/", response_model=List[TicketOut])
def list_tickets(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(Ticket).offset(skip).limit(limit).all()


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: str, db: Session = Depends(get_db)):
    return db.query(Ticket).filter(Ticket.id == ticket_id).first()
