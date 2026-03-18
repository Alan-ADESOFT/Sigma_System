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
-- PASTAS DE PLANEJAMENTO (semanas, por conta)
-- ============================================================
CREATE TABLE IF NOT EXISTS content_folders (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT NOT NULL DEFAULT '#ff0033',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folders_tenant  ON content_folders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_folders_account ON content_folders(account_id);

-- Coluna folder_id em contents (pode ser nula para conteúdos avulsos)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES content_folders(id) ON DELETE SET NULL;

-- ============================================================
-- PERMISSOES: usuario <-> conta Instagram
-- ============================================================
CREATE TABLE IF NOT EXISTS user_account_permissions (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_uap_user    ON user_account_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_uap_account ON user_account_permissions(account_id);

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
    FOR t IN SELECT unnest(ARRAY['tenants','accounts','contents','collections','settings','analytics','content_folders','marketing_clients','marketing_stages'])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
            CREATE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON %s
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        ', t, t, t, t);
    END LOOP;
END $$;

-- ============================================================
-- MARKETING CLIENTS (clientes cadastrados por tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_clients (
    id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    company_name         TEXT NOT NULL,
    niche                TEXT,
    main_product         TEXT,
    product_description  TEXT,
    transformation       TEXT,
    main_problem         TEXT,
    avg_ticket           TEXT,
    region               TEXT,
    comm_objective       TEXT,   -- 'sales' | 'leads' | 'authority' | 'other'
    comm_objective_other TEXT,
    email                TEXT,
    phone                TEXT,
    status               TEXT NOT NULL DEFAULT 'prospect', -- 'prospect' | 'active' | 'inactive'
    extra_data           JSONB,  -- campos adicionais livres
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colunas adicionadas via ALTER (idempotente para bases já existentes)
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS comm_objective_other TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS extra_data           JSONB;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS email                TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS phone                TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS status               TEXT NOT NULL DEFAULT 'prospect';
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS logo_url             TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS observations         TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS important_links      JSONB DEFAULT '[]';
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS services             JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_mkt_clients_tenant ON marketing_clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mkt_clients_status ON marketing_clients(status);

-- ============================================================
-- MARKETING STAGES (etapas por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_stages (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    stage_key   TEXT NOT NULL,
    -- 'diagnosis' | 'competitors' | 'audience' | 'avatar' | 'positioning' | 'offer'
    status      TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'in_progress' | 'done'
    data        JSONB,   -- output salvo da etapa (gerado pelos agentes)
    notes       TEXT,    -- anotacoes manuais do operador
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_mkt_stages_client ON marketing_stages(client_id);

-- ============================================================
-- CLIENT TASKS (afazeres por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_tasks (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    done        BOOLEAN NOT NULL DEFAULT false,
    priority    TEXT NOT NULL DEFAULT 'normal', -- 'low' | 'normal' | 'high'
    due_date    DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_tasks_client ON client_tasks(client_id);

-- ============================================================
-- CLIENT ATTACHMENTS (anexos por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_attachments (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    file_url    TEXT NOT NULL,
    file_name   TEXT NOT NULL,
    file_size   INTEGER,
    mime_type   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_attachments_client ON client_attachments(client_id);

-- ============================================================
-- CLIENT OBSERVATIONS (múltiplas observações por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_observations (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_observations_client ON client_observations(client_id);

-- ============================================================
-- CLIENT CONTRACTS (contrato financeiro por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_contracts (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    contract_value  NUMERIC(12,2) NOT NULL,       -- valor total (monthly_value * num_installments)
    monthly_value   NUMERIC(12,2),                -- valor mensal
    num_installments INTEGER NOT NULL DEFAULT 12,  -- quantidade de parcelas
    frequency       TEXT NOT NULL DEFAULT 'monthly',
    period_months   INTEGER NOT NULL DEFAULT 12,
    due_day         INTEGER NOT NULL DEFAULT 10,
    start_date      DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    services        JSONB DEFAULT '[]',            -- serviços vinculados ao contrato
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS monthly_value    NUMERIC(12,2);
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS num_installments INTEGER NOT NULL DEFAULT 12;
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS services         JSONB DEFAULT '[]';

-- ============================================================
-- COMPANY FINANCES (custos e ganhos da empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_finances (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,  -- 'income' | 'expense'
    category    TEXT,
    description TEXT NOT NULL,
    value       NUMERIC(12,2) NOT NULL,
    date        DATE NOT NULL,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_finances_tenant ON company_finances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_finances_date   ON company_finances(date);

CREATE INDEX IF NOT EXISTS idx_client_contracts_client ON client_contracts(client_id);

-- ============================================================
-- CLIENT INSTALLMENTS (parcelas geradas pelo contrato)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_installments (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    contract_id         TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
    client_id           TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    installment_number  INTEGER NOT NULL,
    due_date            DATE NOT NULL,
    value               NUMERIC(12,2) NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'paid' | 'overdue'
    paid_at             TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_installments_client   ON client_installments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_installments_contract ON client_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_client_installments_due      ON client_installments(due_date);

-- ============================================================
-- MÓDULO DE AGENTES IA — CopyCreator
-- ============================================================

-- Histórico de pesquisas web realizadas pelos agentes
CREATE TABLE IF NOT EXISTS ai_search_history (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    query       TEXT NOT NULL,
    result_text TEXT,
    citations   JSONB NOT NULL DEFAULT '[]',
    agent_name  VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_search_history_tenant ON ai_search_history(tenant_id, created_at DESC);

-- Histórico de respostas geradas pelos agentes
CREATE TABLE IF NOT EXISTS ai_agent_history (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_name    VARCHAR(100) NOT NULL,
    model_used    VARCHAR(100),
    prompt_sent   TEXT,
    response_text TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_history_tenant ON ai_agent_history(tenant_id, created_at DESC);

-- Rascunhos de conteúdo gerados pelos agentes
CREATE TABLE IF NOT EXISTS ai_drafts (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_name       VARCHAR(100),
    title            VARCHAR(255),
    content          TEXT,
    original_content TEXT,                              -- backup antes de edições
    status           VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | desenvolvendo | concluido
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_drafts_tenant_status ON ai_drafts(tenant_id, status);

-- Base de dados dinâmica (marca, produto, persona, etc.) por tenant
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category   VARCHAR(100) NOT NULL,  -- 'marca' | 'produto' | 'persona' | 'tom_de_voz' | 'concorrentes'
    key        VARCHAR(255) NOT NULL,
    value      TEXT NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_tenant_cat ON ai_knowledge_base(tenant_id, category);

-- Coluna client_id para KB por cliente (cada cliente tem sua própria base de conhecimento)
ALTER TABLE ai_knowledge_base ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_client ON ai_knowledge_base(client_id, category);

-- Históricos de IA vinculados a clientes
ALTER TABLE ai_search_history ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL;
ALTER TABLE ai_agent_history  ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL;
