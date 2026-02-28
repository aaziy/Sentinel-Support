from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.api.v1.router import api_router
from app.core.config import settings

# ── Rate limiter ─────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="Agentic Support Automator",
    description="LangGraph-powered agentic support backend.",
    version="0.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}


@app.get("/debug/test-graph", tags=["Debug"])
async def debug_test_graph():
    """Quick diagnostic: invoke the graph with a trivial query to surface errors."""
    import traceback
    try:
        from app.core.graph.agent_graph import support_graph
        result = support_graph.invoke(
            {
                "messages": [],
                "query": "hello",
                "route": None,
                "retrieved_docs": [],
                "is_escalated": False,
                "response": None,
                "ticket_id": "debug-test",
                "escalation_reason": None,
                "customer_email": None,
                "problem_description": None,
                "awaiting_problem_description": False,
            },
            config={"configurable": {"thread_id": "debug-test"}},
        )
        return {"status": "ok", "route": result.get("route"), "response": result.get("response", "")[:200]}
    except Exception as e:
        return {"status": "error", "error": str(e), "traceback": traceback.format_exc()[-2000:]}
