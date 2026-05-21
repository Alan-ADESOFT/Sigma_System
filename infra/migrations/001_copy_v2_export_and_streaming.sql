-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 001 — Copy v2: streaming + export
-- ═══════════════════════════════════════════════════════════════════════════
-- Idempotente. Aplique com:
--   psql $DATABASE_URL -f infra/migrations/001_copy_v2_export_and_streaming.sql
-- O conteudo equivalente tambem ficou inline em infra/schema.sql conforme o
-- padrao do projeto (CLAUDE.md). Esta copia existe so para quem prefere
-- aplicar migrations isoladas em produtos com varios ambientes.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Streaming SSE de jobs de copy (texto parcial)
ALTER TABLE copy_generation_jobs ADD COLUMN IF NOT EXISTS partial_text TEXT;

-- 2. Tabela de jobs de export (PDF/DOCX em background)
CREATE TABLE IF NOT EXISTS copy_export_jobs (
    id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id         TEXT NOT NULL REFERENCES copy_sessions(id) ON DELETE CASCADE,
    client_id          TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    template           TEXT NOT NULL,            -- 'landing' | 'planning' | 'freeform'
    format             TEXT NOT NULL,            -- 'pdf' | 'docx'
    use_brandbook      BOOLEAN DEFAULT TRUE,
    status             TEXT NOT NULL DEFAULT 'pending',
    result_url         TEXT,
    result_size_bytes  INTEGER,
    error_message      TEXT,
    duration_ms        INTEGER,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at         TIMESTAMPTZ,
    finished_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_copy_export_jobs_session ON copy_export_jobs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_export_jobs_active  ON copy_export_jobs(status) WHERE status IN ('pending','running');
