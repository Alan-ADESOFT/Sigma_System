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

-- Coluna client_id em content_folders (pastas vinculadas a clientes de marketing)
ALTER TABLE content_folders ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE content_folders ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_folders_client ON content_folders(client_id);

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
    FOR t IN SELECT unnest(ARRAY['tenants','accounts','contents','collections','settings','analytics','content_folders','marketing_clients','marketing_stages','client_form_tokens','client_form_responses','copy_structures','copy_sessions'])
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
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS form_done           BOOLEAN NOT NULL DEFAULT false;
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
-- Categorias: marca, produto, persona, tom_de_voz, concorrentes (tenant-level)
--             diagnostico, concorrentes_raw, publico_alvo, avatar_raw, avatar,
--             posicionamento, oferta (client-level — output dos agentes)
--             prompt_override (tenant-level — prompts customizados)
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category   VARCHAR(100) NOT NULL,
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

-- Índice único para KB por cliente (permite mesmo key em clientes diferentes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_kb_client_unique
  ON ai_knowledge_base(tenant_id, client_id, category, key)
  WHERE client_id IS NOT NULL;

-- Índice único para KB sem cliente (prompt overrides, dados globais do tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_kb_tenant_unique
  ON ai_knowledge_base(tenant_id, category, key)
  WHERE client_id IS NULL;

-- Históricos de IA vinculados a clientes
ALTER TABLE ai_search_history ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL;
ALTER TABLE ai_agent_history  ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL;

-- ============================================================
-- CLIENT_FORM_TOKENS
-- Token único gerado por cliente para acesso ao formulário público.
-- Um token = um cliente = uso único = expira em 7 dias.
-- ============================================================
CREATE TABLE IF NOT EXISTS client_form_tokens (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,         -- UUID seguro gerado no backend
    status      TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'used' | 'expired'
    expires_at  TIMESTAMPTZ NOT NULL,         -- criado_at + 7 dias
    used_at     TIMESTAMPTZ,                  -- preenchido quando o form for enviado
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_tokens_client  ON client_form_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_form_tokens_token   ON client_form_tokens(token);
CREATE INDEX IF NOT EXISTS idx_form_tokens_status  ON client_form_tokens(status);
ALTER TABLE client_form_tokens ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ============================================================
-- CLIENT_FORM_RESPONSES
-- Respostas do formulário enviado pelo cliente.
-- Salva rascunho (status='draft') e resposta final (status='submitted').
-- ============================================================
CREATE TABLE IF NOT EXISTS client_form_responses (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token_id    TEXT NOT NULL REFERENCES client_form_tokens(id) ON DELETE CASCADE,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'submitted'
    data        JSONB NOT NULL DEFAULT '{}',  -- todas as respostas em JSON
    current_step INTEGER NOT NULL DEFAULT 1,  -- etapa atual do wizard (1-11)
    submitted_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(token_id)
);
CREATE INDEX IF NOT EXISTS idx_form_responses_client ON client_form_responses(client_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_status ON client_form_responses(status);

-- ============================================================
-- SYSTEM_NOTIFICATIONS
-- Notificações internas do sistema (ex: cliente preencheu formulário).
-- ============================================================
CREATE TABLE IF NOT EXISTS system_notifications (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    -- 'form_submitted' | 'form_started' | 'token_expired' | etc.
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    client_id   TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    read        BOOLEAN NOT NULL DEFAULT false,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON system_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read   ON system_notifications(tenant_id, read);

-- form_done já adicionado acima via ALTER na seção marketing_clients (linha 231)
CREATE INDEX IF NOT EXISTS idx_mkt_clients_form_done ON marketing_clients(tenant_id, form_done);

-- ============================================================
-- PIPELINE_JOBS (tracking de execução do pipeline completo)
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id        TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'running',
    -- 'running' | 'completed' | 'failed'
    total_agents     INTEGER NOT NULL DEFAULT 7,
    completed_agents INTEGER NOT NULL DEFAULT 0,
    current_agent    TEXT,
    logs             JSONB NOT NULL DEFAULT '[]',
    -- Array de { agentName, status, startedAt, finishedAt, error? }
    error            TEXT,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_client ON pipeline_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_status ON pipeline_jobs(status);

-- stage_quality_scores removido (sistema de score descontinuado)
DROP TABLE IF EXISTS stage_quality_scores;

-- ============================================================
-- STAGE_VERSIONS (snapshots manuais — criados ao "Marcar Concluído")
-- ============================================================
CREATE TABLE IF NOT EXISTS stage_versions (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    stage_key   TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1,
    content     TEXT NOT NULL,
    word_count  INTEGER,
    created_by  TEXT NOT NULL DEFAULT 'user',
    -- 'user' (clicou "Marcar Concluído") | 'pipeline' (pipeline automático)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stage_versions_client ON stage_versions(client_id, stage_key);

-- ============================================================
-- RATE_LIMIT_LOG (controle de limites por tenant/acao)
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limit_log (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    -- 'pipeline' | 'modification' | etc.
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_tenant_action ON rate_limit_log(tenant_id, action, created_at);

-- ============================================================
-- COPY_STRUCTURES (estruturas de copy configuraveis)
-- Cada estrutura tem um prompt base proprio e pode ser
-- adicionada/editada nas configuracoes do sistema.
-- ============================================================
CREATE TABLE IF NOT EXISTS copy_structures (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    prompt_base TEXT NOT NULL,
    -- Prompt injetado antes do prompt raiz do operador
    icon        VARCHAR(50) DEFAULT 'file',
    -- Nome do icone para a UI
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    -- true = veio do sistema, nao pode ser deletado (so editado)
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copy_structures_tenant
  ON copy_structures(tenant_id, active, sort_order);

-- ============================================================
-- COPY_SESSIONS (cada copy gerada em uma pasta/conteudo)
-- Vincula uma copy ao conteudo da pasta social existente.
-- Armazena o estado completo do workspace.
-- ============================================================
CREATE TABLE IF NOT EXISTS copy_sessions (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    content_id      TEXT REFERENCES contents(id) ON DELETE CASCADE,
    -- Vinculado ao conteudo da pasta social existente
    client_id       TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    -- Cliente cujas bases de dados sao usadas como contexto
    structure_id    TEXT REFERENCES copy_structures(id) ON DELETE SET NULL,
    -- Estrutura de copy selecionada
    model_used      VARCHAR(100),
    -- Modelo de IA usado (gpt-4o, claude-opus-4, etc.)
    prompt_raiz     TEXT,
    -- O prompt raiz atual (editado pelo operador)
    output_text     TEXT,
    -- A copy gerada (rascunho atual)
    tone            VARCHAR(100),
    -- Tom selecionado (direto, formal, descontraido, etc.)
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',
    -- 'draft' | 'saved' | 'published'
    metadata        JSONB NOT NULL DEFAULT '{}',
    -- { images: [], files: [], additionalPrompt: '' }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(content_id)
    -- Um conteudo tem exatamente uma sessao de copy ativa
);
CREATE INDEX IF NOT EXISTS idx_copy_sessions_tenant
  ON copy_sessions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_sessions_client
  ON copy_sessions(client_id);

-- ============================================================
-- COPY_HISTORY (historico de cada geracao/modificacao)
-- Sem sistema de versoes — apenas log de execucoes.
-- ============================================================
CREATE TABLE IF NOT EXISTS copy_history (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id      TEXT NOT NULL REFERENCES copy_sessions(id) ON DELETE CASCADE,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model_used      VARCHAR(100),
    prompt_sent     TEXT,
    -- Prompt completo enviado (system + raiz + complementos)
    output_text     TEXT NOT NULL,
    -- Output gerado nesta execucao
    action          VARCHAR(50) NOT NULL DEFAULT 'generate',
    -- 'generate' | 'improve' | 'modify'
    tokens_input    INTEGER,
    tokens_output   INTEGER,
    tokens_total    INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copy_history_session
  ON copy_history(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copy_history_tenant
  ON copy_history(tenant_id, created_at DESC);

-- ============================================================
-- AI_TOKEN_USAGE (log centralizado de uso de tokens)
-- Alimentado por TODA chamada de IA do sistema.
-- Fonte de dados para o dashboard de tokens.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_token_usage (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    model_used      VARCHAR(100) NOT NULL,
    provider        VARCHAR(50) NOT NULL DEFAULT 'openai',
    -- 'openai' | 'anthropic' | 'perplexity'
    operation_type  VARCHAR(100) NOT NULL,
    -- 'pipeline' | 'stage_modify' | 'copy_generate' | 'copy_modify'
    -- 'web_search' | 'apply_modification' | 'export'
    client_id       TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    session_id      TEXT,
    -- ID da sessao (pipeline_job_id, copy_session_id, etc.)
    tokens_input    INTEGER NOT NULL DEFAULT 0,
    tokens_output   INTEGER NOT NULL DEFAULT 0,
    tokens_total    INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6),
    -- Calculado no momento do registro
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_usage_tenant
  ON ai_token_usage(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_month
  ON ai_token_usage(tenant_id, date_trunc('month', created_at));
CREATE INDEX IF NOT EXISTS idx_token_usage_type
  ON ai_token_usage(tenant_id, operation_type);
