-- ============================================================
--  Supplement: extend the existing profiles table &
--  run this SQL in the Supabase SQL Editor to add the
--  full project schema alongside the profiles table.
-- ============================================================

-- ── 1. Extend profiles (already created via Table Editor) ──
-- id / primary key already exists – only add missing columns
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS email       TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS role        TEXT NOT NULL DEFAULT 'agent',
    ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── 2. Extensions (idempotent) ─────────────────────────────
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector is pre-installed on Supabase
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 3. Documents table (RAG) ───────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content     TEXT        NOT NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    embedding   vector(384),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_embedding
    ON documents USING hnsw (embedding vector_cosine_ops);

-- ── 4. Tickets table ───────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM ('open','in_progress','awaiting_human','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tickets (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query             TEXT            NOT NULL,
    response          TEXT,
    status            ticket_status   NOT NULL DEFAULT 'open',
    priority          ticket_priority NOT NULL DEFAULT 'medium',
    assigned_to       TEXT,
    escalation_reason TEXT,
    metadata          JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ── 5. match_documents RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(384),
    match_threshold FLOAT DEFAULT 0.78,
    match_count     INT   DEFAULT 5
)
RETURNS TABLE (id UUID, content TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE sql STABLE AS $$
    SELECT d.id, d.content, d.metadata,
           1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ── 6. Enable Realtime on tickets ─────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
