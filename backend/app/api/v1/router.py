from fastapi import APIRouter
from app.api.v1.endpoints import query, tickets

api_router = APIRouter()
api_router.include_router(query.router, prefix="/query", tags=["Query"])
api_router.include_router(tickets.router, prefix="/tickets", tags=["Tickets"])
