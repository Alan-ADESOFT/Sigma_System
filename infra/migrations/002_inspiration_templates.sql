-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002 — Image v2: Arte Guia (templates de inspiracao) + qualityCheck
-- ═══════════════════════════════════════════════════════════════════════════
-- Idempotente. Aplique com:
--   psql $DATABASE_URL -f infra/migrations/002_inspiration_templates.sql
-- O conteudo equivalente fica inline em infra/schema.sql conforme o padrao
-- do projeto (CLAUDE.md). Esta copia existe so pra quem prefere migrations
-- isoladas em ambientes multiplos.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Templates globais (galeria de inspiracao do tenant)
CREATE TABLE IF NOT EXISTS image_inspiration_templates (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category        TEXT NOT NULL,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    thumbnail_url   TEXT,
    description     TEXT,
    ai_description  TEXT,
    ai_described_at TIMESTAMPTZ,
    usage_count     INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspir_tpl_tenant_cat
    ON image_inspiration_templates(tenant_id, category, is_active);

-- 2. Templates por cliente
CREATE TABLE IF NOT EXISTS client_inspiration_templates (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    category        TEXT,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    thumbnail_url   TEXT,
    description     TEXT,
    ai_description  TEXT,
    ai_described_at TIMESTAMPTZ,
    usage_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspir_tpl_client
    ON client_inspiration_templates(client_id, created_at DESC);

-- 3. Flag de baixa qualidade pos-geracao
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS low_quality_warning BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS quality_check JSONB DEFAULT '{}';

-- 4. Subir TTL default do cache de prompt engineer pra 48h
-- Tenants que ainda estao no default antigo (24) ganham o novo default.
-- Tenants que customizaram pra outro valor sao preservados.
UPDATE image_settings
   SET prompt_reuse_window_hours = 48
 WHERE prompt_reuse_window_hours = 24;
ALTER TABLE image_settings ALTER COLUMN prompt_reuse_window_hours SET DEFAULT 48;
