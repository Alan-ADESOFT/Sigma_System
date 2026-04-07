-- ============================================================
-- Schema SQL — Sigma Platform (Neon PostgreSQL)
-- Multi-tenant com foco no Admin
--
-- Executar no Neon SQL Editor ou via:
--   psql $DATABASE_URL -f infra/schema.sql
--
-- Ordem: tabelas criadas por dependencia (quem referencia vem depois)
-- Todas as colunas inline — sem ALTERs dispersos
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    username    TEXT UNIQUE,
    password    TEXT,
    role        TEXT NOT NULL DEFAULT 'admin',
    avatar_url  TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. ACCOUNTS (contas Instagram vinculadas a um tenant)
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
-- 3. MARKETING_CLIENTS (clientes cadastrados por tenant)
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
    comm_objective       TEXT,
    comm_objective_other TEXT,
    email                TEXT,
    phone                TEXT,
    status               TEXT NOT NULL DEFAULT 'prospect',
    extra_data           JSONB,
    logo_url             TEXT,
    observations         TEXT,
    form_done            BOOLEAN NOT NULL DEFAULT false,
    important_links      JSONB DEFAULT '[]',
    services             JSONB DEFAULT '[]',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colunas adicionadas via ALTER (idempotente para bases ja existentes)
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS comm_objective_other TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS extra_data           JSONB;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS email                TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS phone                TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS status               TEXT NOT NULL DEFAULT 'prospect';
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS logo_url             TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS observations         TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS form_done            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS important_links      JSONB DEFAULT '[]';
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS services             JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_mkt_clients_tenant    ON marketing_clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mkt_clients_status    ON marketing_clients(status);
CREATE INDEX IF NOT EXISTS idx_mkt_clients_form_done ON marketing_clients(tenant_id, form_done);

-- ============================================================
-- 4. CONTENT_FOLDERS (pastas de planejamento)
-- ============================================================
CREATE TABLE IF NOT EXISTS content_folders (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id  TEXT REFERENCES accounts(id) ON DELETE CASCADE,
    client_id   TEXT REFERENCES marketing_clients(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT NOT NULL DEFAULT '#ff0033',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE content_folders ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE content_folders ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_folders_tenant  ON content_folders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_folders_account ON content_folders(account_id);
CREATE INDEX IF NOT EXISTS idx_folders_client  ON content_folders(client_id);

-- ============================================================
-- 5. CONTENTS (posts, stories, reels, carousels)
-- ============================================================
CREATE TABLE IF NOT EXISTS contents (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id   TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    folder_id    TEXT REFERENCES content_folders(id) ON DELETE SET NULL,
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

ALTER TABLE contents ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES content_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contents_tenant    ON contents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contents_status    ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_scheduled ON contents(status, scheduled_at);

-- ============================================================
-- 6. USER_ACCOUNT_PERMISSIONS
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
-- 7. COLLECTIONS / CAMPANHAS
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

CREATE TABLE IF NOT EXISTS content_collections (
    content_id    TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, collection_id)
);

-- ============================================================
-- 8. SETTINGS (por tenant)
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
-- 9. ANALYTICS CACHE
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
-- 10. MARKETING_STAGES (etapas por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS marketing_stages (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    stage_key   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    data        JSONB,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_mkt_stages_client ON marketing_stages(client_id);

-- ============================================================
-- 11. CLIENT_TASKS (afazeres por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_tasks (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    done        BOOLEAN NOT NULL DEFAULT false,
    priority    TEXT NOT NULL DEFAULT 'normal',
    due_date    DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_tasks_client ON client_tasks(client_id);

-- ============================================================
-- 12. CLIENT_ATTACHMENTS (anexos por cliente)
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
-- 13. CLIENT_OBSERVATIONS (multiplas observacoes por cliente)
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
-- 14. CLIENT_CONTRACTS (contrato financeiro por cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_contracts (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id        TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    contract_value   NUMERIC(12,2) NOT NULL,
    monthly_value    NUMERIC(12,2),
    num_installments INTEGER NOT NULL DEFAULT 12,
    frequency        TEXT NOT NULL DEFAULT 'monthly',
    period_months    INTEGER NOT NULL DEFAULT 12,
    due_day          INTEGER NOT NULL DEFAULT 10,
    start_date       DATE NOT NULL,
    status           TEXT NOT NULL DEFAULT 'active',
    services         JSONB DEFAULT '[]',
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS monthly_value    NUMERIC(12,2);
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS num_installments INTEGER NOT NULL DEFAULT 12;
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS services         JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_client_contracts_client ON client_contracts(client_id);

-- ============================================================
-- 15. CLIENT_INSTALLMENTS (parcelas geradas pelo contrato)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_installments (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    contract_id         TEXT NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
    client_id           TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    installment_number  INTEGER NOT NULL,
    due_date            DATE NOT NULL,
    value               NUMERIC(12,2) NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending',
    paid_at             TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_installments_client   ON client_installments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_installments_contract ON client_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_client_installments_due      ON client_installments(due_date);

-- ============================================================
-- 16. COMPANY_FINANCES (custos e ganhos da empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_finances (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
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

-- ============================================================
-- 17. AI_SEARCH_HISTORY (pesquisas web dos agentes)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_search_history (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id   TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    query       TEXT NOT NULL,
    result_text TEXT,
    citations   JSONB NOT NULL DEFAULT '[]',
    agent_name  VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_search_history ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_search_history_tenant ON ai_search_history(tenant_id, created_at DESC);

-- ============================================================
-- 18. AI_AGENT_HISTORY (respostas geradas pelos agentes)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_agent_history (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id     TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    agent_name    VARCHAR(100) NOT NULL,
    model_used    VARCHAR(100),
    prompt_sent   TEXT,
    response_text TEXT,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_agent_history ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_agent_history_tenant ON ai_agent_history(tenant_id, created_at DESC);

-- ============================================================
-- 19. AI_DRAFTS (rascunhos gerados pelos agentes)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_drafts (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_name       VARCHAR(100),
    title            VARCHAR(255),
    content          TEXT,
    original_content TEXT,
    status           VARCHAR(20) NOT NULL DEFAULT 'pendente',
    metadata         JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_drafts_tenant_status ON ai_drafts(tenant_id, status);

-- ============================================================
-- 20. AI_KNOWLEDGE_BASE (base de dados dinamica por tenant/cliente)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id  TEXT REFERENCES marketing_clients(id) ON DELETE CASCADE,
    category   VARCHAR(100) NOT NULL,
    key        VARCHAR(255) NOT NULL,
    value      TEXT NOT NULL,
    metadata   JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, category, key)
);

ALTER TABLE ai_knowledge_base ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_tenant_cat ON ai_knowledge_base(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_client     ON ai_knowledge_base(client_id, category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_kb_client_unique
  ON ai_knowledge_base(tenant_id, client_id, category, key)
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_kb_tenant_unique
  ON ai_knowledge_base(tenant_id, category, key)
  WHERE client_id IS NULL;

-- ============================================================
-- 21. CLIENT_FORM_TOKENS (token para acesso ao formulario publico)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_form_tokens (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    status      TEXT NOT NULL DEFAULT 'pending',
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_form_tokens ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_form_tokens_client ON client_form_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_form_tokens_token  ON client_form_tokens(token);
CREATE INDEX IF NOT EXISTS idx_form_tokens_status ON client_form_tokens(status);

-- ============================================================
-- 22. CLIENT_FORM_RESPONSES (respostas do formulario)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_form_responses (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token_id     TEXT NOT NULL REFERENCES client_form_tokens(id) ON DELETE CASCADE,
    client_id    TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'draft',
    data         JSONB NOT NULL DEFAULT '{}',
    current_step INTEGER NOT NULL DEFAULT 1,
    submitted_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(token_id)
);

CREATE INDEX IF NOT EXISTS idx_form_responses_client ON client_form_responses(client_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_status ON client_form_responses(status);

-- ============================================================
-- 23. SYSTEM_NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS system_notifications (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    client_id   TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    read        BOOLEAN NOT NULL DEFAULT false,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON system_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read   ON system_notifications(tenant_id, read);

-- ============================================================
-- 24. PIPELINE_JOBS (tracking de execucao do pipeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id        TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'running',
    total_agents     INTEGER NOT NULL DEFAULT 7,
    completed_agents INTEGER NOT NULL DEFAULT 0,
    current_agent    TEXT,
    logs             JSONB NOT NULL DEFAULT '[]',
    error            TEXT,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_client ON pipeline_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status ON pipeline_jobs(status);

-- ============================================================
-- 25. STAGE_VERSIONS (snapshots ao "Marcar Concluido")
-- ============================================================
CREATE TABLE IF NOT EXISTS stage_versions (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    stage_key   TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1,
    content     TEXT NOT NULL,
    word_count  INTEGER,
    created_by  TEXT NOT NULL DEFAULT 'user',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage_versions_client ON stage_versions(client_id, stage_key);

-- ============================================================
-- 26. RATE_LIMIT_LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limit_log (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_tenant_action ON rate_limit_log(tenant_id, action, created_at);

-- ============================================================
-- 27. COPY_STRUCTURES (estruturas de copy configuraveis)
-- ============================================================
CREATE TABLE IF NOT EXISTS copy_structures (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    prompt_base TEXT NOT NULL,
    icon        VARCHAR(50) DEFAULT 'file',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    active      BOOLEAN NOT NULL DEFAULT true,
    questions   JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE copy_structures ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_copy_structures_tenant
  ON copy_structures(tenant_id, active, sort_order);

-- ============================================================
-- 28. COPY_SESSIONS (chats de copy dentro de uma pasta)
-- ============================================================
CREATE TABLE IF NOT EXISTS copy_sessions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    folder_id       TEXT REFERENCES content_folders(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL DEFAULT 'Chat 1',
    client_id       TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    structure_id    TEXT REFERENCES copy_structures(id) ON DELETE SET NULL,
    model_used      VARCHAR(100),
    prompt_raiz     TEXT,
    output_text     TEXT,
    tone            VARCHAR(100),
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_sessions_tenant ON copy_sessions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_sessions_folder ON copy_sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_copy_sessions_client ON copy_sessions(client_id);

-- ============================================================
-- 29. COPY_HISTORY (log de cada geracao/modificacao)
-- ============================================================
CREATE TABLE IF NOT EXISTS copy_history (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id      TEXT NOT NULL REFERENCES copy_sessions(id) ON DELETE CASCADE,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model_used      VARCHAR(100),
    prompt_sent     TEXT,
    output_text     TEXT NOT NULL,
    action          VARCHAR(50) NOT NULL DEFAULT 'generate',
    tokens_input    INTEGER,
    tokens_output   INTEGER,
    tokens_total    INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_history_session ON copy_history(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_history_tenant  ON copy_history(tenant_id, created_at DESC);

-- ============================================================
-- 30. AI_TOKEN_USAGE (log centralizado de uso de tokens)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_token_usage (
    id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model_used         VARCHAR(100) NOT NULL,
    provider           VARCHAR(50) NOT NULL DEFAULT 'openai',
    operation_type     VARCHAR(100) NOT NULL,
    client_id          TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    session_id         TEXT,
    tokens_input       INTEGER NOT NULL DEFAULT 0,
    tokens_output      INTEGER NOT NULL DEFAULT 0,
    tokens_total       INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6),
    metadata           JSONB DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_tenant ON ai_token_usage(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_month  ON ai_token_usage(tenant_id, date_trunc('month', created_at));
CREATE INDEX IF NOT EXISTS idx_token_usage_type   ON ai_token_usage(tenant_id, operation_type);

-- ============================================================
-- 31. ONBOARDING — Sistema de jornada por etapas (15 dias)
-- Espelhado em infra/migrations/002_onboarding_stages.sql
-- Substitui o formulário monolítico por uma sequência diária
-- com vídeo + perguntas + controle por cron.
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_stages_config (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stage_number    INTEGER NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    video_url       TEXT,
    video_duration  INTEGER,
    questions_json  JSONB NOT NULL DEFAULT '[]',
    day_release     INTEGER NOT NULL,
    is_rest_day     BOOLEAN NOT NULL DEFAULT false,
    rest_message    TEXT,
    time_estimate   TEXT,
    insight_text    TEXT,
    active          BOOLEAN NOT NULL DEFAULT true,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, stage_number)
);
CREATE INDEX IF NOT EXISTS idx_onb_config_tenant ON onboarding_stages_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onb_config_day    ON onboarding_stages_config(tenant_id, day_release);

CREATE TABLE IF NOT EXISTS onboarding_rest_days_config (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    day_number      INTEGER NOT NULL,
    message         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, day_number)
);
CREATE INDEX IF NOT EXISTS idx_onb_rest_tenant ON onboarding_rest_days_config(tenant_id);

CREATE TABLE IF NOT EXISTS onboarding_progress (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    current_stage   INTEGER NOT NULL DEFAULT 0,
    current_day     INTEGER NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'not_started',
    last_stage_at   TIMESTAMPTZ,
    token           TEXT UNIQUE,
    token_expires   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id)
);
CREATE INDEX IF NOT EXISTS idx_onb_progress_client ON onboarding_progress(client_id);
CREATE INDEX IF NOT EXISTS idx_onb_progress_status ON onboarding_progress(status);
CREATE INDEX IF NOT EXISTS idx_onb_progress_token  ON onboarding_progress(token);

CREATE TABLE IF NOT EXISTS onboarding_stage_responses (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stage_number    INTEGER NOT NULL,
    responses_json  JSONB NOT NULL DEFAULT '{}',
    video_watched   BOOLEAN NOT NULL DEFAULT false,
    video_watched_at TIMESTAMPTZ,
    submitted       BOOLEAN NOT NULL DEFAULT false,
    submitted_at    TIMESTAMPTZ,
    time_spent_sec  INTEGER,
    ai_summary      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id, stage_number)
);
CREATE INDEX IF NOT EXISTS idx_onb_responses_client ON onboarding_stage_responses(client_id);

CREATE TABLE IF NOT EXISTS onboarding_audio_usage (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    stage_number    INTEGER NOT NULL,
    audio_duration  INTEGER NOT NULL,
    transcription   TEXT,
    parsed_answers  JSONB,
    usage_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onb_audio_client_date ON onboarding_audio_usage(client_id, usage_date);

CREATE TABLE IF NOT EXISTS onboarding_notifications_log (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    day_number      INTEGER NOT NULL,
    type            TEXT NOT NULL,
    message         TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id, day_number, type)
);
CREATE INDEX IF NOT EXISTS idx_onb_notif_client ON onboarding_notifications_log(client_id);

-- Colunas extras em marketing_clients para o sistema de onboarding
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS onboarding_status     TEXT DEFAULT 'not_started';

-- ============================================================
-- RESUMO IA DO FORMULÁRIO
-- ============================================================
CREATE TABLE IF NOT EXISTS client_form_summaries (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    summary         TEXT NOT NULL,
    model_used      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id)
);
CREATE INDEX IF NOT EXISTS idx_cfs_client_id ON client_form_summaries(client_id);

-- Índice para upsert eficiente em onboarding_stage_responses (client_id + stage_number)
-- Já existe como UNIQUE constraint, mas garantimos o índice explícito
CREATE UNIQUE INDEX IF NOT EXISTS idx_osr_client_stage
  ON onboarding_stage_responses (client_id, stage_number);

-- ============================================================
-- CLEANUP (tabelas descontinuadas)
-- ============================================================
DROP TABLE IF EXISTS stage_quality_scores;

-- ============================================================
-- FUNCAO + TRIGGERS: atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'tenants','accounts','contents','collections','settings','analytics',
        'content_folders','marketing_clients','marketing_stages',
        'client_form_tokens','client_form_responses',
        'copy_structures','copy_sessions',
        'onboarding_stages_config','onboarding_rest_days_config',
        'onboarding_progress','onboarding_stage_responses',
        'client_form_summaries'
    ])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
            CREATE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON %s
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        ', t, t, t, t);
    END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SPRINT 1 — Chaves de configuração adicionadas (tabela: settings)
-- Não requerem migration estrutural — tabela settings é key-value por design.
-- ─────────────────────────────────────────────────────────────────────────────
-- pipeline_model_weak          → model ID para agentes nível weak
-- pipeline_model_medium        → model ID para agentes nível medium
-- pipeline_model_strong        → model ID para agentes nível strong
-- pipeline_model_search        → model ID para agentes de pesquisa web
-- pipeline_fallback_enabled    → 'true' | 'false' — ativa fallback automático
-- pipeline_fallback_model      → model ID do fallback (ex: 'gpt-4o-mini')
-- copy_model                   → model ID padrão do gerador de copy
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- SPRINT 1.5 — Biblioteca de Prompts
-- Nenhuma migration estrutural necessária.
-- Usa estruturas existentes:
--   · ai_knowledge_base: overrides dos agentes do pipeline
--     (category='prompt_override', key=agentName, client_id IS NULL)
--   · settings: overrides dos prompts de copy, estruturas e utilitários
--     (key='prompt_library_{id}', ex: 'prompt_library_copy_generate')
--
-- Para listar todos os prompts customizados de um tenant:
-- SELECT 'pipeline' as source, key as id, LEFT(value,80) as preview
--   FROM ai_knowledge_base
--   WHERE tenant_id='<id>' AND category='prompt_override' AND client_id IS NULL
-- UNION ALL
-- SELECT 'settings' as source, key as id, LEFT(value,80) as preview
--   FROM settings
--   WHERE tenant_id='<id>' AND key LIKE 'prompt_library_%';
-- ─────────────────────────────────────────────────────────────────────────────
