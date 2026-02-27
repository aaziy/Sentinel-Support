# 🤖 Agentic Support Automator

> An AI-powered, end-to-end support ticketing system built on **LangGraph**, **LangChain**, **Pinecone**, and **FastAPI** (backend) with a **Next.js + Tailwind CSS** frontend.

---

## Architecture Overview

```
Agentic-Support-Automator/
├── backend/                  # FastAPI + LangGraph service
│   ├── app/
│   │   ├── api/v1/           # REST endpoints (query, tickets)
│   │   ├── core/
│   │   │   ├── graph/        # LangGraph StateGraph definition
│   │   │   └── engine/       # Nodes: router, retriever, responder, state
│   │   ├── db/               # SQLAlchemy models & session
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   └── services/         # Pinecone vector store service
│   ├── scripts/              # CLI utilities (e.g., seed_pinecone.py)
│   ├── requirements.txt
│   └── .env.example
└── frontend/                 # Next.js 14 App Router UI
    ├── src/app/              # Pages & layouts
    ├── src/components/       # Reusable UI components
    ├── src/hooks/            # Custom React hooks
    └── src/lib/              # API client helpers
```

---

## 6-Phase Implementation Plan

### Phase 1 — RAG Pipeline 🗂️
- Ingest knowledge-base articles into **Pinecone** using `scripts/seed_pinecone.py`.
- Implement OpenAI embedding generation via `langchain-openai`.
- Validate retrieval quality with similarity-score thresholds.
- **Exit criteria:** Top-5 retrieval precision ≥ 80 % on a 50-query evaluation set.

### Phase 2 — LangGraph Agent 🧠
- Define `AgentState` TypedDict with `query`, `route`, `context`, `response`.
- Build the `StateGraph` with three nodes: **Router → Retriever → Responder**.
- Add conditional routing: RAG path for knowledge-lookups, Direct path for simple intents.
- **Exit criteria:** Agent resolves 90 % of test queries without human escalation.

### Phase 3 — FastAPI Layer 🚀
- Expose `POST /api/v1/query/` and `GET /api/v1/tickets/` endpoints.
- Persist every query/response to **PostgreSQL** via SQLAlchemy.
- Add CORS, request validation (Pydantic), and structured error responses.
- **Exit criteria:** All endpoints return correct responses under load (100 RPS, p95 < 500 ms).

### Phase 4 — Integration Testing 🔗
- Write end-to-end tests using `pytest` + `httpx.AsyncClient`.
- Mock Pinecone and OpenAI calls for deterministic test runs.
- Achieve ≥ 90 % code coverage across `api/`, `core/`, and `services/`.
- **Exit criteria:** CI pipeline (GitHub Actions) passes on every PR.

### Phase 5 — Regression Testing 🔄
- Maintain a golden dataset of 200 query/expected-response pairs.
- Run regression suite after every model or prompt change.
- Track BLEU / ROUGE scores and flag regressions automatically.
- **Exit criteria:** No regression > 5 % on golden dataset between releases.

### Phase 6 — Frontend 🖥️
- Build the Next.js 14 App Router UI with Tailwind CSS + Lucide-React icons.
- Implement real-time query submission, ticket listing, and status badges.
- Add error handling, loading states, and accessible form controls.
- **Exit criteria:** Lighthouse score ≥ 90 (Performance, Accessibility, Best Practices).

---

## Quick Start

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in your API keys
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the API runs on [http://localhost:8000](http://localhost:8000).

---

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `OPENAI_API_KEY` | backend `.env` | OpenAI API key |
| `PINECONE_API_KEY` | backend `.env` | Pinecone API key |
| `PINECONE_ENVIRONMENT` | backend `.env` | Pinecone environment |
| `PINECONE_INDEX_NAME` | backend `.env` | Target index name |
| `DATABASE_URL` | backend `.env` | PostgreSQL connection string |
| `NEXT_PUBLIC_API_URL` | frontend `.env.local` | Backend base URL |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Orchestration | LangGraph, LangChain |
| LLM | OpenAI GPT-4o |
| Vector Store | Pinecone |
| Backend API | FastAPI, Uvicorn |
| Database | PostgreSQL, SQLAlchemy, Alembic |
| Frontend | Next.js 14, Tailwind CSS, Lucide-React |
| Testing | Pytest, pytest-asyncio, httpx |

---

## License
MIT
