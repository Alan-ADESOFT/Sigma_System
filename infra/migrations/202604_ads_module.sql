-- ============================================================
-- SPRINT ADS — Modulo Meta Marketing API (Etapa 1/3 · Banco de Dados)
-- ============================================================
-- Cria a estrutura completa do modulo de Ads:
--   1. client_ads_accounts        — 1 conta Meta Ads por cliente (1:1)
--   2. ads_insights_cache         — cache TTL das chamadas de insights
--   3. ads_ai_reports             — relatorios de IA (sob demanda + semanal)
--   4. ads_anomalies              — anomalias detectadas pelo cron diario
--   5. ads_public_report_tokens   — tokens publicos para compartilhar relatorios
--
-- Migra do modelo antigo (accounts.ads_token, 1 token por tenant) para
-- 1 conta de ads por marketing_client, espelhando o padrao de
-- instagram_accounts. Tabelas existentes NAO sao alteradas.
--
-- Idempotente — pode ser rodado N vezes sem erro.
-- Triggers de updated_at sao aplicadas pelo bloco DO $$ central de
-- infra/schema.sql (NAO incluir aqui).
-- ============================================================

-- ============================================================
-- 1. CLIENT_ADS_ACCOUNTS — conta Meta Ads por cliente (Sprint Ads)
-- ============================================================
-- 1 conta de Ads por marketing_clients (UNIQUE(client_id)).
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
-- 2. ADS_INSIGHTS_CACHE — cache TTL de chamadas a Insights API
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
-- 3. ADS_AI_REPORTS — relatorios de IA (on_demand, weekly_cron, anomaly)
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
-- 4. ADS_ANOMALIES — anomalias detectadas pelo cron diario
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
-- 5. ADS_PUBLIC_REPORT_TOKENS — tokens publicos de relatorio
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
