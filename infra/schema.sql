-- ============================================================
-- Schema SQL - Instagram Dashboard (Neon PostgreSQL)
-- Multi-tenant com foco no Admin
--
-- Executar no Neon SQL Editor ou via:
--   psql $DATABASE_URL -f infra/schema.sql
-- ============================================================

-- Extensao para gerar IDs unicos
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANT (Admin = dono do sistema, futuramente usuarios comuns)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    username    TEXT UNIQUE,                     -- login alternativo ao e-mail
    password    TEXT,                            -- hash scrypt: "salt:hash"
    role        TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'user' (futuro)
    avatar_url  TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CONTAS INSTAGRAM (vinculadas a um tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type                TEXT NOT NULL DEFAULT 'instagram',
    provider            TEXT NOT NULL DEFAULT 'instagram_business',
    provider_account_id TEXT NOT NULL,
    access_token        TEXT,
    ads_token           TEXT,
    ads_account_id      TEXT,
    expires_at          INTEGER,
    username            TEXT,
    picture             TEXT,
    password            TEXT,
    notes               TEXT,
    biography           TEXT,
    followers_count     INTEGER,
    follows_count       INTEGER,
    media_count         INTEGER,
    name                TEXT,
    website             TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(tenant_id, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);

-- ============================================================
-- CONTEUDOS (posts, stories, reels, carousels)
-- ============================================================
CREATE TABLE IF NOT EXISTS contents (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id   TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    type         TEXT NOT NULL DEFAULT 'post',
    status       TEXT NOT NULL DEFAULT 'draft',
    scheduled_at TIMESTAMPTZ,
    hashtags     TEXT NOT NULL DEFAULT '[]',
    media_urls   TEXT NOT NULL DEFAULT '[]',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contents_tenant ON contents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_scheduled ON contents(status, scheduled_at);

-- ============================================================
-- COLECOES / CAMPANHAS
-- ============================================================
CREATE TABLE IF NOT EXISTS collections (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT NOT NULL DEFAULT '#6366F1',
    icon        TEXT,
    start_date  TIMESTAMPTZ,
    end_date    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_tenant ON collections(tenant_id);

-- Relacao N:N entre contents e collections
CREATE TABLE IF NOT EXISTS content_collections (
    content_id    TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, collection_id)
);

-- ============================================================
-- CONFIGURACOES (por tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    value      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(tenant_id, key)
);

-- ============================================================
-- ANALYTICS CACHE
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    target_id  TEXT NOT NULL,
    type       TEXT NOT NULL,
    data       TEXT NOT NULL,
    period     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(tenant_id, target_id, type)
);

-- ============================================================
-- FUNCAO: atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['tenants','accounts','contents','collections','settings','analytics'])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
            CREATE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON %s
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        ', t, t, t, t);
    END LOOP;
END $$;
