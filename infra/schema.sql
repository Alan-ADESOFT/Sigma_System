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

-- Sprint Usuários: coluna de telefone para perfil
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============================================================
-- 1b. USER_ROLES (cargos personalizados por tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    allowed_pages   JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);

-- Vincula usuário a um cargo personalizado (usado quando role = 'user')
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_role_id TEXT REFERENCES user_roles(id) ON DELETE SET NULL;

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

-- Sprint Jarvis: campos multi-usuário (atribuição + autoria + descrição)
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS assigned_to  TEXT REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS created_by   TEXT REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS tenant_id    TEXT REFERENCES tenants(id) ON DELETE CASCADE;

-- Sprint Jarvis: tasks PESSOAIS (sem cliente vinculado) — torna client_id nullable.
-- Antes era NOT NULL e o Jarvis quebrava ao criar task tipo "lembra de fazer X".
ALTER TABLE client_tasks ALTER COLUMN client_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_tasks_client   ON client_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_assigned ON client_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_client_tasks_created  ON client_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_client_tasks_tenant   ON client_tasks(tenant_id);

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
-- 15b. FINANCE_CATEGORIES (categorias de gastos fixos/variáveis)
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_categories (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'variable',
    color      TEXT NOT NULL DEFAULT '#6366F1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_finance_categories_tenant ON finance_categories(tenant_id);

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

ALTER TABLE company_finances ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES finance_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_finances_tenant ON company_finances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_finances_date   ON company_finances(date);

-- ============================================================
-- 16b. FINANCE_CHARGE_LOG (log de cobranças enviadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS finance_charge_log (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    installment_id  TEXT NOT NULL REFERENCES client_installments(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    stage           TEXT NOT NULL,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel         TEXT NOT NULL DEFAULT 'personal',
    success         BOOLEAN NOT NULL DEFAULT true,
    error_message   TEXT,
    UNIQUE(installment_id, stage, channel)
);
CREATE INDEX IF NOT EXISTS idx_finance_charge_log_tenant      ON finance_charge_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_charge_log_installment ON finance_charge_log(installment_id);
CREATE INDEX IF NOT EXISTS idx_finance_charge_log_date        ON finance_charge_log(sent_at);

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
    tone            TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_sessions_tenant ON copy_sessions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_sessions_folder ON copy_sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_copy_sessions_client ON copy_sessions(client_id);

-- Migração: tone era VARCHAR(100), mas usuários colam descrições longas de tom
-- de voz (>100 chars). Promovido para TEXT.
ALTER TABLE copy_sessions ALTER COLUMN tone TYPE TEXT;

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
-- 32. INSTAGRAM_ACCOUNTS — conta Instagram por cliente (Sprint Instagram)
-- Espelhado em infra/migrations/sprint_instagram_accounts.sql
-- 1 conta Instagram por marketing_clients (UNIQUE(client_id)).
-- Token long-lived da Meta (60 dias) — refresh diário via cron.
-- ============================================================
CREATE TABLE IF NOT EXISTS instagram_accounts (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    ig_user_id          TEXT NOT NULL,
    username            TEXT,
    access_token        TEXT NOT NULL,
    token_expires_at    TIMESTAMPTZ,
    profile_picture_url TEXT,
    followers_count     INTEGER NOT NULL DEFAULT 0,
    follows_count       INTEGER NOT NULL DEFAULT 0,
    media_count         INTEGER NOT NULL DEFAULT 0,
    biography           TEXT,
    account_type        TEXT NOT NULL DEFAULT 'BUSINESS',
    connected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_refreshed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_accounts_tenant ON instagram_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_client ON instagram_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_expiry ON instagram_accounts(token_expires_at);

-- ============================================================
-- 33. INSTAGRAM_SCHEDULED_POSTS — fila de publicação por cliente
-- ============================================================
CREATE TABLE IF NOT EXISTS instagram_scheduled_posts (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    ig_account_id   TEXT REFERENCES instagram_accounts(id) ON DELETE SET NULL,
    media_type      TEXT NOT NULL DEFAULT 'IMAGE',  -- IMAGE | REELS | CAROUSEL | STORIES
    image_urls      TEXT[],
    video_url       TEXT,
    caption         TEXT,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | publishing | published | failed
    published_at    TIMESTAMPTZ,
    ig_media_id     TEXT,
    permalink       TEXT,
    error_message   TEXT,
    folder_id       TEXT REFERENCES content_folders(id) ON DELETE SET NULL,
    copy_content    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_posts_tenant    ON instagram_scheduled_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ig_posts_client    ON instagram_scheduled_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_ig_posts_scheduled ON instagram_scheduled_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ig_posts_status    ON instagram_scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_ig_posts_due       ON instagram_scheduled_posts(status, scheduled_at);

-- ============================================================
-- 38. JARVIS_USAGE_LOG (histórico + base do rate limit do Jarvis)
-- ============================================================
CREATE TABLE IF NOT EXISTS jarvis_usage_log (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    command      TEXT NOT NULL,
    input_text   TEXT,
    response     TEXT,
    duration_ms  INTEGER,
    success      BOOLEAN NOT NULL DEFAULT true,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_log_user    ON jarvis_usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jarvis_log_tenant  ON jarvis_usage_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jarvis_log_command ON jarvis_usage_log(command, created_at);

-- ============================================================
-- 34. TASK_CATEGORIES (categorias configuráveis por tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_categories (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366F1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_task_categories_tenant ON task_categories(tenant_id);

-- Sprint Tasks: novas colunas em client_tasks
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS category_id     TEXT;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2);
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS subtasks        JSONB NOT NULL DEFAULT '[]';
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS subtasks_required BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_client_tasks_status   ON client_tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_client_tasks_category ON client_tasks(category_id);

-- ============================================================
-- 35. TASK_DEPENDENCIES (dependências entre tasks)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_dependencies (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_id         TEXT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
    depends_on_id   TEXT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(task_id, depends_on_id)
);
CREATE INDEX IF NOT EXISTS idx_task_deps_task       ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies(depends_on_id);

-- ============================================================
-- 36. TASK_COMMENTS (comentários com suporte a @menções)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_id     TEXT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    mentions    TEXT[] DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- ============================================================
-- 37. TASK_ACTIVITY_LOG (histórico de alterações)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_activity_log (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_id     TEXT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity_log(task_id);

-- ============================================================
-- 39. MEETINGS (calendário de reuniões)
-- ============================================================
CREATE TABLE IF NOT EXISTS meetings (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    meeting_date  DATE NOT NULL,
    start_time    TIME NOT NULL,
    end_time      TIME,
    client_id     TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    participants  TEXT[] NOT NULL DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'scheduled',
    meet_link     TEXT,
    minutes_url   TEXT,
    obs           TEXT,
    created_by    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant ON meetings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date   ON meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meetings_client ON meetings(client_id);

-- ============================================================
-- 40. TASK_TEMPLATES (automação de tasks)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_templates (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    trigger     TEXT NOT NULL,
    tasks_json  JSONB NOT NULL DEFAULT '[]',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_templates_tenant ON task_templates(tenant_id);

-- ============================================================
-- 41. TASK_BOT_CONFIG (configuração do bot de lembrete)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_bot_config (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone           TEXT NOT NULL,
    dispatch_time   TIME NOT NULL DEFAULT '08:00',
    active_days     INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
    message_morning TEXT,
    message_overdue TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_bot_config_tenant ON task_bot_config(tenant_id);

-- Sprint Tasks: grupo WhatsApp na ficha do cliente
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS whatsapp_group_id   TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS whatsapp_group_name TEXT;

-- ============================================================
-- 42. TASK_RECURRENCES (tasks recorrentes — geram tasks reais por cron)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_recurrences (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    priority        TEXT NOT NULL DEFAULT 'normal',
    category_id     TEXT REFERENCES task_categories(id) ON DELETE SET NULL,
    assigned_to     TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    client_id       TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    frequency       TEXT NOT NULL DEFAULT 'weekly', -- daily | weekly | monthly
    weekday         INTEGER, -- 0..6 (apenas se frequency=weekly)
    day_of_month    INTEGER, -- 1..31 (apenas se frequency=monthly)
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_run_at     DATE,
    created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE task_recurrences ADD COLUMN IF NOT EXISTS subtasks          JSONB NOT NULL DEFAULT '[]';
ALTER TABLE task_recurrences ADD COLUMN IF NOT EXISTS subtasks_required BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_task_recurrences_tenant ON task_recurrences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_recurrences_active ON task_recurrences(is_active);

-- ============================================================
-- 43. CONTENT PLANNING (planejamento mensal de conteúdo)
-- ============================================================
-- Migration espelhada em infra/migrations/sprint_content_planning.sql
-- Tabelas:
--   · content_plan_statuses     — colunas configuráveis do Kanban
--   · content_plans             — planejamento mensal por cliente
--   · content_plan_creatives    — peças/criativos do planejamento
--   · content_plan_share_tokens — links públicos de aprovação (PIN opcional)
--   · content_plan_versions     — histórico de versões (snapshots)
--   · content_plan_activity     — log de atividades (sininho)
-- ============================================================

CREATE TABLE IF NOT EXISTS content_plan_statuses (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#94A3B8',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_cp_statuses_tenant ON content_plan_statuses(tenant_id, sort_order);

CREATE TABLE IF NOT EXISTS content_plans (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  month_reference DATE,
  objective       TEXT,
  central_promise TEXT,
  strategy_notes  TEXT,
  status_id       TEXT REFERENCES content_plan_statuses(id) ON DELETE SET NULL,
  owner_id        TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  due_date        DATE,
  is_template     BOOLEAN NOT NULL DEFAULT false,
  template_source TEXT REFERENCES content_plans(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_plans_tenant   ON content_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cp_plans_client   ON content_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_cp_plans_status   ON content_plans(status_id);
CREATE INDEX IF NOT EXISTS idx_cp_plans_template ON content_plans(tenant_id, is_template);
CREATE INDEX IF NOT EXISTS idx_cp_plans_kanban   ON content_plans(tenant_id, status_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS content_plan_creatives (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  type            TEXT NOT NULL DEFAULT 'post',
  scheduled_for   DATE,
  scheduled_time  TEXT,
  media_urls      JSONB NOT NULL DEFAULT '[]',
  video_url       TEXT,
  cover_url       TEXT,
  caption         TEXT,
  cta             TEXT,
  hashtags        TEXT,
  internal_notes  TEXT,
  copy_session_id TEXT,
  client_decision TEXT,
  client_rating   INTEGER,
  client_reason   TEXT,
  client_notes    TEXT,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_creatives_plan   ON content_plan_creatives(plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cp_creatives_tenant ON content_plan_creatives(tenant_id);

CREATE TABLE IF NOT EXISTS content_plan_share_tokens (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  password_hash   TEXT,
  status          TEXT NOT NULL DEFAULT 'active',
  expires_at      TIMESTAMPTZ NOT NULL,
  created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  first_opened_at TIMESTAMPTZ,
  last_opened_at  TIMESTAMPTZ,
  open_count      INTEGER NOT NULL DEFAULT 0,
  ip_first        TEXT,
  user_agent      TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_tokens_plan    ON content_plan_share_tokens(plan_id);
CREATE INDEX IF NOT EXISTS idx_cp_tokens_token   ON content_plan_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_cp_tokens_expires ON content_plan_share_tokens(expires_at);

CREATE TABLE IF NOT EXISTS content_plan_versions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id     TEXT NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
  version_no  INTEGER NOT NULL,
  label       TEXT,
  snapshot    JSONB NOT NULL,
  created_by  TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  trigger     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_cp_versions_plan ON content_plan_versions(plan_id, version_no DESC);

CREATE TABLE IF NOT EXISTS content_plan_activity (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id     TEXT NOT NULL REFERENCES content_plans(id) ON DELETE CASCADE,
  creative_id TEXT REFERENCES content_plan_creatives(id) ON DELETE SET NULL,
  actor_type  TEXT NOT NULL,
  actor_id    TEXT,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_activity_tenant ON content_plan_activity(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_activity_plan   ON content_plan_activity(plan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_activity_unread ON content_plan_activity(tenant_id, read, created_at DESC);

-- ============================================================
-- SPRINT REFERRAL — Sistema de Indicação (pós-onboarding)
-- ============================================================
-- Cliente termina onboarding → gera link único → indicado vê
-- página secreta mobile-only com VSL, oferta e timer 72h.
-- Migration espelhada em infra/migrations/003_referral_system.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS referrals (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    referrer_id     TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ref_code        TEXT NOT NULL UNIQUE,
    ref_link        TEXT NOT NULL,
    referred_name   TEXT,
    referred_phone  TEXT,
    referred_email  TEXT,
    status          TEXT NOT NULL DEFAULT 'link_created',
    video_progress  INTEGER NOT NULL DEFAULT 0,
    first_access_at TIMESTAMPTZ,
    timer_expires   TIMESTAMPTZ,
    purchased_at    TIMESTAMPTZ,
    purchase_value  NUMERIC(12,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_tenant   ON referrals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_ref_code ON referrals(ref_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status   ON referrals(status);

CREATE TABLE IF NOT EXISTS referral_config (
    id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vsl_video_url         TEXT,
    vsl_video_duration    INTEGER NOT NULL DEFAULT 240,
    offer_reveal_at       INTEGER NOT NULL DEFAULT 210,
    offer_price           NUMERIC(12,2) NOT NULL DEFAULT 997.00,
    offer_original        NUMERIC(12,2) NOT NULL DEFAULT 5000.00,
    offer_installments    INTEGER NOT NULL DEFAULT 12,
    timer_hours           INTEGER NOT NULL DEFAULT 72,
    checkout_url          TEXT,
    copy_warning_message  TEXT,
    whatsapp_message      TEXT,
    page_active           BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id)
);
ALTER TABLE referral_config ADD COLUMN IF NOT EXISTS offer_reveal_at      INTEGER NOT NULL DEFAULT 210;
ALTER TABLE referral_config ADD COLUMN IF NOT EXISTS copy_warning_message TEXT;
ALTER TABLE referral_config ADD COLUMN IF NOT EXISTS whatsapp_message     TEXT;
CREATE INDEX IF NOT EXISTS idx_referral_config_tenant ON referral_config(tenant_id);

-- ============================================================
-- SPRINT ADS — Modulo Meta Marketing API (Etapa 1/3)
-- Espelhado em infra/migrations/202604_ads_module.sql
-- ============================================================

-- ============================================================
-- 44. CLIENT_ADS_ACCOUNTS — conta Meta Ads por cliente (Sprint Ads)
-- ============================================================
-- 1 conta de Ads por marketing_clients (UNIQUE(client_id)), espelha
-- o padrao de instagram_accounts.
CREATE TABLE IF NOT EXISTS client_ads_accounts (
    id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id             TEXT NOT NULL UNIQUE REFERENCES marketing_clients(id) ON DELETE CASCADE,
    -- IDs Meta
    ads_account_id        TEXT NOT NULL,           -- act_XXXXXXXXX (com prefixo act_)
    business_id           TEXT,                    -- Business Manager ID (opcional)
    page_id               TEXT,                    -- Facebook Page ID (necessario para Ad Creative)
    instagram_actor_id    TEXT,                    -- IG User ID conectado a esta conta de ads
    -- Token
    access_token          TEXT NOT NULL,           -- long-lived (60d) ou system user (eterno)
    token_type            TEXT NOT NULL DEFAULT 'oauth',  -- 'oauth' | 'manual' | 'system_user'
    token_expires_at      TIMESTAMPTZ,             -- NULL = nao expira (system_user)
    -- Metadados da conta
    account_name          TEXT,
    currency              TEXT DEFAULT 'BRL',
    timezone_name         TEXT,
    account_status        INTEGER,                 -- 1=ACTIVE, 2=DISABLED, etc
    amount_spent          NUMERIC(14,2),
    balance               NUMERIC(14,2),
    -- Health
    last_health_check_at  TIMESTAMPTZ,
    health_status         TEXT DEFAULT 'unknown',  -- 'healthy' | 'expiring_soon' | 'expired' | 'invalid' | 'unknown'
    health_error          TEXT,
    -- Auditoria
    connected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_refreshed_at     TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_ads_accounts_tenant       ON client_ads_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_ads_accounts_client       ON client_ads_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_ads_accounts_expires      ON client_ads_accounts(token_expires_at) WHERE token_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_ads_accounts_health       ON client_ads_accounts(health_status);

-- ============================================================
-- 45. ADS_INSIGHTS_CACHE — cache TTL de chamadas a Insights API
-- ============================================================
-- TTL e gerenciado em codigo (expires_at). Lookup por (client_id, cache_key).
CREATE TABLE IF NOT EXISTS ads_insights_cache (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    cache_key       TEXT NOT NULL,                 -- hash do (level + target_id + range + breakdowns)
    level           TEXT NOT NULL,                 -- 'account' | 'campaign' | 'adset' | 'ad'
    target_id       TEXT NOT NULL,
    date_start      DATE NOT NULL,
    date_end        DATE NOT NULL,
    breakdowns      TEXT,                          -- 'age,gender' | 'publisher_platform' | NULL
    data            JSONB NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,          -- fetched_at + TTL
    UNIQUE(client_id, cache_key)
);
CREATE INDEX IF NOT EXISTS idx_ads_insights_cache_tenant    ON ads_insights_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ads_insights_cache_client    ON ads_insights_cache(client_id);
CREATE INDEX IF NOT EXISTS idx_ads_insights_cache_expires   ON ads_insights_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_ads_insights_cache_lookup    ON ads_insights_cache(client_id, cache_key);

-- ============================================================
-- 46. ADS_AI_REPORTS — relatorios de IA (on_demand, weekly_cron, anomaly)
-- ============================================================
-- Cada linha guarda input_snapshot + output completo para reproducibilidade.
CREATE TABLE IF NOT EXISTS ads_ai_reports (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    scope           TEXT NOT NULL,                 -- 'account' | 'campaign' | 'adset' | 'ad'
    target_id       TEXT,                          -- NULL para scope=account
    target_name     TEXT,
    date_start      DATE NOT NULL,
    date_end        DATE NOT NULL,
    trigger_type    TEXT NOT NULL DEFAULT 'on_demand',  -- 'on_demand' | 'weekly_cron' | 'anomaly'
    -- Snapshot dos dados que foram analisados (pra reproducibilidade)
    input_snapshot  JSONB NOT NULL,
    -- Output
    diagnosis       TEXT NOT NULL,                 -- Markdown
    recommendations JSONB,                         -- [{action, priority, reason}, ...]
    flowchart_path  JSONB,                         -- caminho percorrido no fluxograma
    -- Tracking
    model_used      TEXT,
    tokens_used     INTEGER,
    cost_usd        NUMERIC(10,6),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_ai_reports_tenant    ON ads_ai_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ads_ai_reports_client    ON ads_ai_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_ads_ai_reports_created   ON ads_ai_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads_ai_reports_trigger   ON ads_ai_reports(trigger_type);

-- ============================================================
-- 47. ADS_ANOMALIES — anomalias detectadas pelo cron diario
-- ============================================================
CREATE TABLE IF NOT EXISTS ads_anomalies (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    scope           TEXT NOT NULL,                 -- 'campaign' | 'adset' | 'ad'
    target_id       TEXT NOT NULL,
    target_name     TEXT,
    anomaly_type    TEXT NOT NULL,                 -- 'cpa_spike' | 'roas_drop' | 'frequency_high' | 'no_sales_3d' | 'budget_burn'
    severity        TEXT NOT NULL DEFAULT 'medium',-- 'low' | 'medium' | 'high'
    metric_name     TEXT NOT NULL,
    metric_value    NUMERIC(14,4) NOT NULL,
    baseline_value  NUMERIC(14,4),
    delta_pct       NUMERIC(10,2),
    description     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'acknowledged' | 'resolved'
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_anomalies_tenant     ON ads_anomalies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ads_anomalies_client     ON ads_anomalies(client_id);
CREATE INDEX IF NOT EXISTS idx_ads_anomalies_status     ON ads_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_ads_anomalies_detected   ON ads_anomalies(detected_at DESC);

-- ============================================================
-- 48. ADS_PUBLIC_REPORT_TOKENS — tokens publicos de relatorio
-- ============================================================
-- Espelha o padrao de client_form_tokens, com tracking de acessos.
CREATE TABLE IF NOT EXISTS ads_public_report_tokens (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    token           TEXT NOT NULL UNIQUE,          -- gerado via crypto.randomBytes(24).toString('hex')
    status          TEXT NOT NULL DEFAULT 'active',-- 'active' | 'revoked' | 'expired'
    expires_at      TIMESTAMPTZ,                   -- NULL = sem expiracao
    -- Configuracao do relatorio
    config          JSONB NOT NULL DEFAULT '{}',   -- { showCampaignList, showChart, defaultDateRange, allowExport }
    -- Tracking de acessos
    views_count     INTEGER NOT NULL DEFAULT 0,
    last_viewed_at  TIMESTAMPTZ,
    last_viewed_ip  TEXT,
    -- Auditoria
    created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_public_tokens_tenant    ON ads_public_report_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ads_public_tokens_client    ON ads_public_report_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_ads_public_tokens_token     ON ads_public_report_tokens(token);
CREATE INDEX IF NOT EXISTS idx_ads_public_tokens_status    ON ads_public_report_tokens(status);

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
        'client_form_summaries',
        'instagram_accounts','instagram_scheduled_posts',
        'task_comments','meetings','task_templates','task_bot_config',
        'task_recurrences',
        'finance_categories',
        'content_plan_statuses','content_plans','content_plan_creatives','content_plan_share_tokens',
        'referrals','referral_config',
        'comercial_lead_lists','comercial_pipeline_columns','comercial_pipeline_leads',
        'comercial_prospects','comercial_proposals',
        'comercial_message_templates',
        'client_ads_accounts','ads_anomalies','ads_public_report_tokens'
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

-- ─────────────────────────────────────────────────────────────────────────────
-- SPRINT ADS — Chaves de configuração adicionadas (tabela: settings)
-- Não requerem migration estrutural — tabela settings é key-value por design.
-- ─────────────────────────────────────────────────────────────────────────────
-- ads_model_strong            → model ID para diagnostico on-demand (default: AI_MODEL_STRONG)
-- ads_model_medium            → model ID para explicacoes curtas (default: AI_MODEL_MEDIUM)
-- ads_model_weekly            → model ID do relatorio semanal automatico (default: 'claude-sonnet-4-5')
-- ads_ai_weekly_enabled       → 'true' | 'false' — ativa relatorio semanal automatico
-- ads_anomaly_detection       → 'true' | 'false' — ativa cron de deteccao
-- ads_anomaly_cpa_threshold   → multiplicador para alertar CPA (default: '3')
-- ads_anomaly_roas_drop_pct   → % de queda de ROAS pra alertar (default: '40')
-- ads_anomaly_frequency_max   → frequencia maxima antes de alertar (default: '3.5')
-- ads_cache_ttl_today_minutes → TTL do cache para dados de hoje (default: '60')
-- ads_cache_ttl_history_hours → TTL do cache para dados historicos (default: '24')
-- ads_token_refresh_days_ahead → quantos dias antes do expires_at refrescar (default: '15')
-- ads_meta_app_id             → INSTAGRAM_APP_ID (reutilizado, ja em .env)
-- ads_meta_app_secret         → INSTAGRAM_APP_SECRET (reutilizado, ja em .env)
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================
-- SPRINT LATENCIA — Indices de performance
-- Todas as operacoes sao idempotentes (IF NOT EXISTS)
-- ============================================================

-- marketing_clients: queries frequentes por status e tenant
CREATE INDEX IF NOT EXISTS idx_mc_tenant_status
  ON marketing_clients(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mc_tenant_name
  ON marketing_clients(tenant_id, company_name);
CREATE INDEX IF NOT EXISTS idx_mc_form_done
  ON marketing_clients(tenant_id, form_done)
  WHERE form_done = true;

-- client_tasks: queries frequentes por done, due_date
CREATE INDEX IF NOT EXISTS idx_ct_client_done
  ON client_tasks(client_id, done);
CREATE INDEX IF NOT EXISTS idx_ct_due_date
  ON client_tasks(due_date)
  WHERE done = false;
CREATE INDEX IF NOT EXISTS idx_ct_assigned_done
  ON client_tasks(assigned_to, done)
  WHERE assigned_to IS NOT NULL;

-- client_installments: queries de financeiro por due_date e status
CREATE INDEX IF NOT EXISTS idx_ci_tenant_status
  ON client_installments(client_id, status);
CREATE INDEX IF NOT EXISTS idx_ci_due_date
  ON client_installments(due_date, status);

-- pipeline_jobs: consultas de status por client
CREATE INDEX IF NOT EXISTS idx_pj_client_status
  ON pipeline_jobs(client_id, status);
CREATE INDEX IF NOT EXISTS idx_pj_tenant_recent
  ON pipeline_jobs(tenant_id, created_at DESC);

-- ai_agent_history: queries por tenant + cliente
CREATE INDEX IF NOT EXISTS idx_aah_tenant_client
  ON ai_agent_history(tenant_id, client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

-- system_notifications: queries de nao lidas
CREATE INDEX IF NOT EXISTS idx_sn_tenant_unread
  ON system_notifications(tenant_id, read, created_at DESC)
  WHERE read = false;

-- onboarding_progress: queries por status
CREATE INDEX IF NOT EXISTS idx_op_tenant_status
  ON onboarding_progress(tenant_id, status);

-- jarvis_usage_log: queries de hoje por usuario
CREATE INDEX IF NOT EXISTS idx_jl_user_today
  ON jarvis_usage_log(user_id, created_at DESC);

-- settings: lookup frequente por key
CREATE INDEX IF NOT EXISTS idx_settings_tenant_key
  ON settings(tenant_id, key);

-- rate_limit_log: queries de janela de tempo
CREATE INDEX IF NOT EXISTS idx_rll_tenant_action_time
  ON rate_limit_log(tenant_id, action, created_at DESC);

-- ============================================================
-- SPRINT COMERCIAL — Captação + Kanban (Sprint 1)
-- Espelhado em infra/migrations/20260425_comercial_sprint1.sql
-- ============================================================

-- ── 1. Listas geradas (TTL 5 dias) ──────────────────────────
CREATE TABLE IF NOT EXISTS comercial_lead_lists (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'apify',  -- 'apify' | 'csv' | 'manual'
    filters     JSONB DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'pending', -- pending|running|completed|failed
    total_leads INTEGER NOT NULL DEFAULT 0,
    apify_run_id   TEXT,
    error_message  TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_by  TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_lists_tenant  ON comercial_lead_lists(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_lists_expires ON comercial_lead_lists(expires_at) WHERE status != 'failed';

-- ── 2. Leads dentro das listas ──────────────────────────────
CREATE TABLE IF NOT EXISTS comercial_leads (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    list_id       TEXT NOT NULL REFERENCES comercial_lead_lists(id) ON DELETE CASCADE,
    company_name  TEXT NOT NULL,
    phone         TEXT,
    website       TEXT,
    google_rating NUMERIC(3,2),
    review_count  INTEGER DEFAULT 0,
    address       TEXT,
    city          TEXT,
    state         TEXT,
    niche         TEXT,
    has_website     BOOLEAN DEFAULT false,
    instagram_handle TEXT,
    sigma_score   INTEGER,
    raw_data      JSONB DEFAULT '{}',
    imported_to_pipeline BOOLEAN NOT NULL DEFAULT false,
    pipeline_lead_id  TEXT,  -- FK setada após import; sem REFERENCES pra evitar dependência circular
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_list      ON comercial_leads(list_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant    ON comercial_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_imported  ON comercial_leads(imported_to_pipeline);

-- ── 3. Colunas customizáveis do Kanban ──────────────────────
CREATE TABLE IF NOT EXISTS comercial_pipeline_columns (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#6366F1',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    system_role TEXT,  -- 'start' | 'won' | 'lost' | NULL
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_pipe_cols_tenant ON comercial_pipeline_columns(tenant_id, sort_order);

-- ── 4. Leads no pipeline (entidade autônoma do scraping) ─────
CREATE TABLE IF NOT EXISTS comercial_pipeline_leads (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id         TEXT REFERENCES comercial_leads(id) ON DELETE SET NULL,
    column_id       TEXT NOT NULL REFERENCES comercial_pipeline_columns(id) ON DELETE RESTRICT,
    assigned_to     TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    company_name    TEXT NOT NULL,
    contact_name    TEXT,
    phone           TEXT,
    email           TEXT,
    website         TEXT,
    instagram       TEXT,
    niche           TEXT,
    city            TEXT,
    state           TEXT,
    estimated_value NUMERIC(12,2),
    notes           TEXT,
    links           JSONB DEFAULT '[]',
    google_rating   NUMERIC(3,2),
    review_count    INTEGER,
    sigma_score     INTEGER,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipe_leads_tenant   ON comercial_pipeline_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipe_leads_column   ON comercial_pipeline_leads(column_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pipe_leads_assigned ON comercial_pipeline_leads(assigned_to);

-- ============================================================
-- SPRINT COMERCIAL 2 — Análise IA + Propostas + Tracking público
-- Espelhado em infra/migrations/20260426_comercial_sprint2.sql
-- ============================================================

-- ── 0. Colunas de cache em comercial_pipeline_leads ──────────
ALTER TABLE comercial_pipeline_leads
  ADD COLUMN IF NOT EXISTS ai_analysis     TEXT;
ALTER TABLE comercial_pipeline_leads
  ADD COLUMN IF NOT EXISTS ai_analyzed_at  TIMESTAMPTZ;
ALTER TABLE comercial_pipeline_leads
  ADD COLUMN IF NOT EXISTS ai_sigma_score  INTEGER;

-- ── 1. Histórico de análises IA ─────────────────────────────
CREATE TABLE IF NOT EXISTS comercial_lead_analyses (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pipeline_lead_id TEXT NOT NULL REFERENCES comercial_pipeline_leads(id) ON DELETE CASCADE,
    analysis_text   TEXT NOT NULL,
    sigma_score     INTEGER,
    citations       JSONB DEFAULT '[]',
    sources_used    JSONB DEFAULT '{}',
    model_used      TEXT,
    tokens_input    INTEGER,
    tokens_output   INTEGER,
    duration_ms     INTEGER,
    created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_analyses_lead   ON comercial_lead_analyses(pipeline_lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_analyses_tenant ON comercial_lead_analyses(tenant_id);

-- ── 2. Prospects ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comercial_prospects (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    company_name    TEXT NOT NULL,
    contact_name    TEXT,
    phone           TEXT,
    email           TEXT,
    website         TEXT,
    instagram       TEXT,
    niche           TEXT,
    city            TEXT,
    state           TEXT,
    source          TEXT NOT NULL DEFAULT 'manual',
    pipeline_lead_id TEXT REFERENCES comercial_pipeline_leads(id) ON DELETE SET NULL,
    created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospects_tenant   ON comercial_prospects(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_pipeline ON comercial_prospects(pipeline_lead_id);

-- ── 3. Propostas ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comercial_proposals (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    prospect_id     TEXT NOT NULL REFERENCES comercial_prospects(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL UNIQUE,
    data            JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'draft',
    expires_at      TIMESTAMPTZ,
    published_at    TIMESTAMPTZ,
    view_count      INTEGER NOT NULL DEFAULT 0,
    unique_view_count INTEGER NOT NULL DEFAULT 0,
    last_viewed_at  TIMESTAMPTZ,
    total_time_seconds INTEGER NOT NULL DEFAULT 0,
    max_scroll_pct  INTEGER NOT NULL DEFAULT 0,
    created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_slug    ON comercial_proposals(slug);
CREATE INDEX IF NOT EXISTS idx_proposals_tenant         ON comercial_proposals(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_prospect       ON comercial_proposals(prospect_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status_expires ON comercial_proposals(status, expires_at);

-- ── 4. Tracking de visualizações públicas ───────────────────
CREATE TABLE IF NOT EXISTS comercial_proposal_views (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proposal_id     TEXT NOT NULL REFERENCES comercial_proposals(id) ON DELETE CASCADE,
    visitor_hash    TEXT NOT NULL,
    user_agent      TEXT,
    referer         TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ping_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    time_seconds    INTEGER NOT NULL DEFAULT 0,
    max_scroll_pct  INTEGER NOT NULL DEFAULT 0,
    is_unique       BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_proposal_views_proposal ON comercial_proposal_views(proposal_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_views_visitor  ON comercial_proposal_views(proposal_id, visitor_hash);

-- ============================================================
-- SPRINT COMERCIAL 3 — Dashboard + WhatsApp + Extras
-- Espelhado em infra/migrations/20260427_comercial_sprint3.sql
-- ============================================================

-- ── 1. Timeline de atividades ───────────────────────────────
CREATE TABLE IF NOT EXISTS comercial_lead_activities (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pipeline_lead_id TEXT NOT NULL REFERENCES comercial_pipeline_leads(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    content         TEXT,
    metadata        JSONB DEFAULT '{}',
    created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead    ON comercial_lead_activities(pipeline_lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant  ON comercial_lead_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type    ON comercial_lead_activities(type);

-- ── 2. Templates de mensagem ────────────────────────────────
CREATE TABLE IF NOT EXISTS comercial_message_templates (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT 'custom',
    channel     TEXT NOT NULL DEFAULT 'whatsapp',
    content     TEXT NOT NULL,
    variables   JSONB DEFAULT '[]',
    is_default  BOOLEAN NOT NULL DEFAULT false,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_by  TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_msg_templates_tenant ON comercial_message_templates(tenant_id, category, sort_order);

-- ── 3. Colunas won/lost em pipeline_leads ───────────────────
ALTER TABLE comercial_pipeline_leads ADD COLUMN IF NOT EXISTS won_at      TIMESTAMPTZ;
ALTER TABLE comercial_pipeline_leads ADD COLUMN IF NOT EXISTS lost_at     TIMESTAMPTZ;
ALTER TABLE comercial_pipeline_leads ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE comercial_pipeline_leads ADD COLUMN IF NOT EXISTS client_id   TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT GERADOR DE IMAGEM
-- ═══════════════════════════════════════════════════════════════════════════
-- 6 tabelas: client_brandbooks, image_folders, image_jobs, image_templates,
--           image_settings, image_audit_log
-- Função: cleanup_image_jobs()
-- Multi-tenant: todas as tabelas filtram por tenant_id
-- ───────────────────────────────────────────────────────────────────────────
-- Mapeamento de tipos vs. spec original (consistência com schema atual):
--   · IDs em TEXT (gen_random_uuid()::text) — convenção do codebase
--   · "user_id"   → REFERENCES tenants(id)           (não existe tabela users)
--   · "client_id" → REFERENCES marketing_clients(id) (não existe tabela clients)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── CLIENT_BRANDBOOKS ─────────────────────────────────────────────────────
-- Brandbook estruturado por cliente (paleta, tipografia, tom, regras).
-- Origem: gerado por IA, extraído de PDF/HTML, ou criado manualmente.
-- Apenas 1 brandbook ativo por cliente (garantido por partial unique index).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_brandbooks (
    id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id         TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    source            TEXT NOT NULL CHECK (source IN ('ai_generated','pdf_upload','html_upload','manual')),
    file_url          TEXT,
    file_name         TEXT,
    file_size         INTEGER,
    mime_type         TEXT,
    extracted_text    TEXT,
    structured_data   JSONB NOT NULL DEFAULT '{}',
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_by        TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE client_brandbooks IS 'Brandbook estruturado por cliente (paleta, tipografia, tom). Apenas 1 ativo por cliente.';

CREATE INDEX IF NOT EXISTS idx_brandbooks_client_active
    ON client_brandbooks(client_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_brandbooks_tenant
    ON client_brandbooks(tenant_id);


-- ─── IMAGE_FOLDERS ─────────────────────────────────────────────────────────
-- Pastas planas (sem hierarquia) para organizar imagens dentro de cada cliente.
-- Estilo CopyCreator: o cliente é o escopo, a pasta agrupa gerações.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_folders (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    color       TEXT,
    created_by  TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, name)
);
COMMENT ON TABLE image_folders IS 'Pastas planas para organizar gerações de imagem dentro de cada cliente.';

CREATE INDEX IF NOT EXISTS idx_folders_client
    ON image_folders(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_folders_tenant
    ON image_folders(tenant_id);


-- ─── IMAGE_TEMPLATES ───────────────────────────────────────────────────────
-- Templates reutilizáveis criados a partir de uma geração existente.
-- Limite (20 por cliente) é validado na camada de aplicação, não no SQL.
-- A FK source_job_id → image_jobs(id) é adicionada via ALTER abaixo, pois
-- image_jobs é criada depois (referência circular: jobs.template_id ↔
-- templates.source_job_id).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_templates (
    id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id           TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    source_job_id       TEXT, -- FK definida via ALTER após criação de image_jobs
    name                TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    description         TEXT,
    format              TEXT NOT NULL,
    aspect_ratio        TEXT NOT NULL,
    model               TEXT NOT NULL,
    raw_description     TEXT NOT NULL,
    optimized_prompt    TEXT,
    observations        TEXT,
    negative_prompt     TEXT,
    preview_image_url   TEXT,
    usage_count         INTEGER NOT NULL DEFAULT 0,
    last_used_at        TIMESTAMPTZ,
    created_by          TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, name)
);
COMMENT ON TABLE image_templates IS 'Templates reutilizáveis para geração de imagem (clones de jobs existentes).';

CREATE INDEX IF NOT EXISTS idx_templates_client_recent
    ON image_templates(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_templates_tenant
    ON image_templates(tenant_id);


-- ─── IMAGE_JOBS ────────────────────────────────────────────────────────────
-- Fila e histórico de gerações. Cada chamada vira 1 registro.
-- Lifecycle: queued → running → done | error | cancelled.
-- O worker em background consome registros com status='queued' (idx_jobs_queue).
-- Soft delete via deleted_at (todos os índices "quentes" filtram IS NULL).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_jobs (
    id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id               TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    folder_id               TEXT REFERENCES image_folders(id) ON DELETE SET NULL,
    user_id                 TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status                  TEXT NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued','running','done','error','cancelled')),
    format                  TEXT NOT NULL,
    aspect_ratio            TEXT NOT NULL,
    width                   INTEGER,
    height                  INTEGER,
    model                   TEXT NOT NULL,
    provider                TEXT NOT NULL,
    brandbook_id            TEXT REFERENCES client_brandbooks(id) ON DELETE SET NULL,
    brandbook_used          BOOLEAN NOT NULL DEFAULT false,
    template_id             TEXT REFERENCES image_templates(id) ON DELETE SET NULL,
    raw_description         TEXT NOT NULL,
    optimized_prompt        TEXT,
    prompt_hash             TEXT,
    observations            TEXT,
    negative_prompt         TEXT,
    reference_image_urls    JSONB NOT NULL DEFAULT '[]',
    result_image_url        TEXT,
    result_thumbnail_url    TEXT,
    result_metadata         JSONB DEFAULT '{}',
    error_message           TEXT,
    error_code              TEXT,
    duration_ms             INTEGER,
    tokens_input            INTEGER DEFAULT 0,
    tokens_output           INTEGER DEFAULT 0,
    cost_usd                NUMERIC(10,6) DEFAULT 0,
    is_template_saved       BOOLEAN NOT NULL DEFAULT false,
    is_starred              BOOLEAN NOT NULL DEFAULT false,
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ
);
COMMENT ON TABLE image_jobs IS 'Fila e histórico de gerações de imagem. Status queued/running/done/error/cancelled.';

-- FK circular pendente: image_templates.source_job_id → image_jobs(id)
DO $$ BEGIN
    ALTER TABLE image_templates
        ADD CONSTRAINT fk_image_templates_source_job
        FOREIGN KEY (source_job_id) REFERENCES image_jobs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índices "quentes" (soft delete sempre filtrado)
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_user_recent
    ON image_jobs(tenant_id, user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_folder_recent
    ON image_jobs(folder_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_client_recent
    ON image_jobs(client_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_recent
    ON image_jobs(tenant_id, created_at DESC) WHERE deleted_at IS NULL;

-- Worker: pega o próximo job FIFO da fila
CREATE INDEX IF NOT EXISTS idx_jobs_queue
    ON image_jobs(status, created_at) WHERE status IN ('queued','running');

-- Reuso de prompt otimizado pelo Prompt Engineer (cache por hash)
CREATE INDEX IF NOT EXISTS idx_jobs_prompt_hash_recent
    ON image_jobs(prompt_hash, created_at DESC)
    WHERE optimized_prompt IS NOT NULL AND deleted_at IS NULL;

-- Cleanup cron: alvos finalizados ou já em soft delete
CREATE INDEX IF NOT EXISTS idx_jobs_cleanup
    ON image_jobs(created_at)
    WHERE deleted_at IS NOT NULL OR status IN ('done','error');


-- ─── IMAGE_SETTINGS ────────────────────────────────────────────────────────
-- Configuração singleton por tenant: modelos default, credenciais
-- criptografadas (AES-256-GCM), limites de uso e cleanup.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_settings (
    tenant_id                       TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    default_model                   TEXT NOT NULL DEFAULT 'imagen-4',
    prompt_engineer_model           TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    brandbook_extractor_model       TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    vertex_credentials_encrypted    TEXT,
    vertex_project_id               TEXT,
    vertex_location                 TEXT DEFAULT 'us-central1',
    openai_api_key_encrypted        TEXT,
    fal_api_key_encrypted           TEXT,
    gemini_api_key_encrypted        TEXT,
    enabled_models                  JSONB NOT NULL DEFAULT '["imagen-4","gpt-image-1","flux-1.1-pro","nano-banana"]',
    daily_limit_admin               INTEGER NOT NULL DEFAULT 50,
    daily_limit_user                INTEGER NOT NULL DEFAULT 30,
    hourly_limit_admin              INTEGER NOT NULL DEFAULT 30,
    hourly_limit_user               INTEGER NOT NULL DEFAULT 10,
    concurrent_limit_per_tenant     INTEGER NOT NULL DEFAULT 5,
    max_template_per_client         INTEGER NOT NULL DEFAULT 20,
    brandbook_required              BOOLEAN NOT NULL DEFAULT false,
    auto_cleanup_days               INTEGER NOT NULL DEFAULT 7,
    prompt_reuse_window_hours       INTEGER NOT NULL DEFAULT 24,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE image_settings IS 'Configuração singleton por tenant do gerador de imagem (modelos, credenciais, limites).';


-- ─── IMAGE_AUDIT_LOG ───────────────────────────────────────────────────────
-- Registro append-only de ações sensíveis: troca de chaves, alteração de
-- limites, conteúdo bloqueado, prompt suspeito, hit de rate limit, etc.
-- Não armazena dados sensíveis em "details" — apenas contexto da ação.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_audit_log (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,
    details      JSONB DEFAULT '{}',
    ip_address   TEXT,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE image_audit_log IS 'Auditoria append-only de ações sensíveis no módulo de geração de imagem.';

CREATE INDEX IF NOT EXISTS idx_audit_tenant_recent
    ON image_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
    ON image_audit_log(action, created_at DESC);


-- ─── FUNÇÃO: cleanup_image_jobs() ──────────────────────────────────────────
-- Não é chamada por trigger automático (Neon serverless não roda jobs
-- internos). Será invocada por cron externo (server/imageWorker.js).
--   · Remove jobs finalizados com mais de 7 dias
--   · Remove auditoria com mais de 90 dias
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_image_jobs()
RETURNS void AS $$
BEGIN
    DELETE FROM image_jobs
     WHERE created_at < now() - interval '7 days'
       AND status IN ('done','error','cancelled');

    DELETE FROM image_audit_log
     WHERE created_at < now() - interval '90 days';
END;
$$ LANGUAGE plpgsql;


-- ─── TRIGGERS updated_at ───────────────────────────────────────────────────
-- image_jobs e image_audit_log NÃO entram: o primeiro tem lifecycle próprio
-- (started_at/completed_at), o segundo é append-only.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'client_brandbooks','image_folders','image_templates','image_settings'
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


-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT GERADOR DE IMAGEM v1.1 — Reference Mode + lineup novo
-- ═══════════════════════════════════════════════════════════════════════════
-- Tudo idempotente (ALTER ... IF NOT EXISTS) — pode reaplicar a vontade.
-- Seguir o pattern: extender, nunca apagar colunas existentes (compat reversa
-- com jobs antigos e modelos descontinuados).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Título gerado por LLM, editável pelo usuário (3-5 palavras).
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS title_user_edited BOOLEAN NOT NULL DEFAULT false;

-- 2. Reference mode por imagem ([{url, mode}] onde mode ∈
--    'inspiration'|'character'|'scene'). Mantém reference_image_urls populado
--    pra compat com jobs antigos.
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS reference_image_metadata JSONB DEFAULT '[]';

-- 3. Decisão do Smart Mode (quando ativado em settings) ou heurística.
--    Inclui primary_model, confidence, reasoning, reference_mode.
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS smart_decision JSONB DEFAULT NULL;

-- 4. Multi-step (mantido — pipelines de várias etapas via Smart Mode).
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS parent_job_id TEXT REFERENCES image_jobs(id) ON DELETE SET NULL;
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS step_index SMALLINT DEFAULT 0;
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS step_purpose TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_parent ON image_jobs(parent_job_id) WHERE parent_job_id IS NOT NULL;

-- 5. Flag de timeout (job morto pelo controller após job_timeout_seconds).
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS timed_out BOOLEAN NOT NULL DEFAULT false;

-- 5b. Bypass do cache do Prompt Engineer (variação fresca / edição).
-- Quando true, ignora cache por hash e força nova chamada ao LLM —
-- gera prompt novo (e portanto resultado visualmente distinto mesmo
-- com mesmos inputs). Usado pelos botões "Variação fresca" e "Editar".
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS bypass_cache BOOLEAN NOT NULL DEFAULT false;

-- 6. Settings novos: smart mode, timeout customizável, gerador de títulos.
ALTER TABLE image_settings ADD COLUMN IF NOT EXISTS smart_mode_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE image_settings ADD COLUMN IF NOT EXISTS smart_mode_model TEXT NOT NULL DEFAULT 'gpt-4o-mini';
ALTER TABLE image_settings ADD COLUMN IF NOT EXISTS job_timeout_seconds INTEGER NOT NULL DEFAULT 90;
ALTER TABLE image_settings ADD COLUMN IF NOT EXISTS title_generator_model TEXT NOT NULL DEFAULT 'gpt-4o-mini';

-- 7. Default de enabled_models pro lineup novo. Tenants existentes mantêm o
--    array atual até alterarem manualmente em Configurações → Imagem.
--    v1.2: lineup reduzido a 3 (Nano Banana 2 / GPT Image 2 / Flux Kontext).
ALTER TABLE image_settings ALTER COLUMN enabled_models SET DEFAULT
  '["gemini-3.1-flash-image-preview","gpt-image-2","fal-ai/flux-pro/kontext"]'::jsonb;

-- 8. Brandbook fixed references (3-5 imagens da marca, sempre injetadas).
--    fixed_references: [{url, label}] (até 5)
--    fixed_references_descriptions: [{url, label, description}] (cache da Vision)
--    fixed_references_described_at: timestamp do último describe (TTL 30 dias).
ALTER TABLE client_brandbooks ADD COLUMN IF NOT EXISTS fixed_references JSONB DEFAULT '[]';
ALTER TABLE client_brandbooks ADD COLUMN IF NOT EXISTS fixed_references_descriptions JSONB DEFAULT '[]';
ALTER TABLE client_brandbooks ADD COLUMN IF NOT EXISTS fixed_references_described_at TIMESTAMPTZ;

-- 9. Tabela de capabilities por modelo (read-only, populada manualmente).
--    Útil pra UI mostrar/disable modelos baseado em features e pra validação
--    no backend antes de chamar o provider.
CREATE TABLE IF NOT EXISTS image_model_capabilities (
  model_id            TEXT PRIMARY KEY,
  provider            TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  description         TEXT,
  supports_text_to_image  BOOLEAN DEFAULT true,
  supports_image_input    BOOLEAN DEFAULT false,
  max_image_inputs        INTEGER DEFAULT 0,
  supports_mask           BOOLEAN DEFAULT false,
  supports_subject_types  BOOLEAN DEFAULT false,
  cost_per_image_low      NUMERIC(10,6),
  cost_per_image_med      NUMERIC(10,6),
  cost_per_image_high     NUMERIC(10,6),
  best_for                TEXT[],
  deprecated_at           DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE image_model_capabilities IS 'Capabilities por modelo de imagem (informacional). Populada manualmente nesta migration.';

-- Lineup v1.1 — abril 2026 (atualizado contra docs oficiais).
INSERT INTO image_model_capabilities VALUES
  ('gemini-3.1-flash-image-preview','gemini','Nano Banana 2',
   'Multi-imagem (até 14 refs), tipografia, web search nativo',
   true, true, 14, false, false,
   0.045, 0.067, 0.151,
   ARRAY['brand_work','multi_image','typography','versatile'],
   NULL, now()),
  ('fal-ai/flux-pro/kontext','fal','Flux Kontext Pro',
   'Especialista em preservar pessoa exata da referência',
   true, true, 1, false, false,
   0.04, 0.04, 0.04,
   ARRAY['character_consistency','editorial_photo','image_edit'],
   NULL, now()),
  ('gpt-image-2','openai','GPT Image 2',
   'Edição com máscara precisa, alta fidelidade facial',
   true, true, 4, true, false,
   0.04, 0.08, 0.17,
   ARRAY['image_edit','mask_edit','high_fidelity'],
   NULL, now()),
  ('imagen-3.0-capability-001','vertex','Imagen 3 Capability',
   'Subject types tipados (PERSON/PRODUCT/ANIMAL) + face mesh',
   true, true, 4, true, true,
   0.04, 0.04, 0.04,
   ARRAY['subject_types','product_shots','controlled_pose'],
   '2026-06-24', now()),
  ('imagen-4.0-generate-001','vertex','Imagen 4',
   'Geração pura text-to-image, fallback geral',
   true, false, 0, false, false,
   0.04, 0.04, 0.06,
   ARRAY['text_to_image','general'],
   NULL, now())
ON CONFLICT (model_id) DO UPDATE SET
  display_name        = EXCLUDED.display_name,
  description         = EXCLUDED.description,
  supports_image_input = EXCLUDED.supports_image_input,
  max_image_inputs    = EXCLUDED.max_image_inputs,
  supports_mask       = EXCLUDED.supports_mask,
  supports_subject_types = EXCLUDED.supports_subject_types,
  cost_per_image_low  = EXCLUDED.cost_per_image_low,
  cost_per_image_med  = EXCLUDED.cost_per_image_med,
  cost_per_image_high = EXCLUDED.cost_per_image_high,
  best_for            = EXCLUDED.best_for,
  deprecated_at       = EXCLUDED.deprecated_at;


-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT GERADOR DE IMAGEM v1.2 — Auto-classificação refs + autoMode
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Refs auto-classificadas via Vision (gpt-4o-mini). Persiste o output do
--    refClassifier por job pra debug e pra evitar reclassificar em retries.
ALTER TABLE image_jobs ADD COLUMN IF NOT EXISTS auto_classified_refs JSONB DEFAULT '[]';

-- 2. Resolved OpenAI image model (cache do probe runtime do worker).
--    Worker faz HEAD/dry-run pra gpt-image-2 → fallback gpt-image-1.5 → gpt-image-1.
--    Cacheado aqui pra não probrar a cada boot.
ALTER TABLE image_settings ADD COLUMN IF NOT EXISTS openai_image_model_resolved TEXT;


-- ═══════════════════════════════════════════════════════════════════════════
-- COPY GENERATION — fila de jobs assíncronos
-- ═══════════════════════════════════════════════════════════════════════════
-- Geração e modificação de copy passaram a rodar em background via setImmediate
-- pra não travar a UI. O endpoint /api/copy/jobs cria a linha aqui, dispara o
-- processamento no mesmo processo e retorna 202 + jobId. O frontend faz polling
-- em /api/copy/jobs/[id] e o sininho é alimentado por system_notifications
-- quando o job conclui.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS copy_generation_jobs (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id      TEXT NOT NULL REFERENCES copy_sessions(id) ON DELETE CASCADE,
    client_id       TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    kind            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    params          JSONB NOT NULL DEFAULT '{}',
    result_text     TEXT,
    history_id      TEXT,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_copy_jobs_session ON copy_generation_jobs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_jobs_active  ON copy_generation_jobs(status) WHERE status IN ('pending','running');
