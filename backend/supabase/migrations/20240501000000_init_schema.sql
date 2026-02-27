-- ============================================================
--  Agentic-Support-Automator · Initial Schema
--  Supabase / PostgreSQL + pgvector
--  Migration: 20240501000000_init_schema.sql
-- ============================================================

-- ──────────────────────────────────────────────
--  1. Extensions
-- ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector is pre-installed on Supabase
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────
--  2. RAG – documents table
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content     TEXT        NOT NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    embedding   vector(384),            -- all-MiniLM-L6-v2 dimension (local, free)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cosine-similarity index for fast ANN retrieval
CREATE INDEX IF NOT EXISTS idx_documents_embedding
    ON documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- GIN index for JSONB metadata filtering
CREATE INDEX IF NOT EXISTS idx_documents_metadata
    ON documents
    USING gin (metadata);

-- ──────────────────────────────────────────────
--  3. Tickets – Human-in-the-Loop dashboard
-- ──────────────────────────────────────────────
CREATE TYPE ticket_status AS ENUM (
    'open',
    'in_progress',
    'awaiting_human',
    'resolved',
    'closed'
);

CREATE TYPE ticket_priority AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
);

CREATE TABLE IF NOT EXISTS tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query           TEXT            NOT NULL,
    response        TEXT,
    status          ticket_status   NOT NULL DEFAULT 'open',
    priority        ticket_priority NOT NULL DEFAULT 'medium',
    assigned_to     TEXT,                               -- human agent email / id
    escalation_reason TEXT,                             -- why the agent escalated
    metadata        JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority   ON tickets (priority);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────
--  4. LangGraph Checkpointing – Postgres-backed
--     persistence for graph state snapshots
--     (matches langgraph-checkpoint-postgres schema)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id   TEXT        NOT NULL,
    checkpoint_ns TEXT      NOT NULL DEFAULT '',
    checkpoint_id TEXT      NOT NULL,
    parent_checkpoint_id TEXT,
    type        TEXT,
    checkpoint  JSONB       NOT NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread
    ON checkpoints (thread_id, checkpoint_ns, created_at DESC);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id       TEXT        NOT NULL,
    checkpoint_ns   TEXT        NOT NULL DEFAULT '',
    checkpoint_id   TEXT        NOT NULL,
    task_id         TEXT        NOT NULL,
    idx             INTEGER     NOT NULL,
    channel         TEXT        NOT NULL,
    type            TEXT,
    value           JSONB       NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE TABLE IF NOT EXISTS checkpoint_blobs (
    thread_id       TEXT        NOT NULL,
    checkpoint_ns   TEXT        NOT NULL DEFAULT '',
    channel         TEXT        NOT NULL,
    version         TEXT        NOT NULL,
    type            TEXT,
    blob            BYTEA,
    PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

-- ──────────────────────────────────────────────
--  5. RPC helper: similarity search
--     Called from the backend as:
--       supabase.rpc("match_documents", {...})
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(384),
    match_threshold FLOAT DEFAULT 0.78,
    match_count     INT   DEFAULT 5
)
RETURNS TABLE (
    id         UUID,
    content    TEXT,
    metadata   JSONB,
    similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        d.id,
        d.content,
        d.metadata,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;
