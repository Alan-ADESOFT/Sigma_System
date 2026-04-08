-- ============================================================
-- Sprint Financeiro — Categorias, Config Cobrança e Log
-- 100% idempotente — seguro para re-execução
-- ============================================================

-- 1. Categorias de gastos da empresa (fixos e variáveis)
CREATE TABLE IF NOT EXISTS finance_categories (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'variable',
    -- type: 'fixed' | 'variable'
    color      TEXT NOT NULL DEFAULT '#6366F1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_finance_categories_tenant ON finance_categories(tenant_id);

-- 2. Vincular category_id na tabela company_finances
ALTER TABLE company_finances ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES finance_categories(id) ON DELETE SET NULL;

-- 3. Configuração do bot de cobrança financeira (por tenant)
-- Persiste via tabela settings (chave/valor) — sem tabela nova.
-- Chaves utilizadas (prefixo finance_bot_):
--   finance_bot_active           → 'true' | 'false'
--   finance_bot_numbers          → JSON array de strings com números (ex: ["5511999999999"])
--   finance_bot_dispatch_time    → 'HH:MM' (padrão '08:00', horário BRT)
--   finance_bot_active_days      → JSON array de integers ISO weekday 1–7 (ex: [1,2,3,4,5])
--   finance_bot_charge_group     → 'true' | 'false' — cobrar no grupo do cliente
--   finance_bot_charge_personal  → 'true' | 'false' — cobrar no número pessoal do cliente
--   finance_bot_msg_1day_before  → texto da mensagem 1 dia antes do vencimento
--   finance_bot_msg_due_today    → texto da mensagem no dia do vencimento
--   finance_bot_msg_overdue_1    → texto da mensagem 1 dia após vencimento
--   finance_bot_msg_overdue_n    → texto da mensagem para atrasos > 1 dia
--   finance_bot_msg_summary      → texto do resumo de inadimplentes para o admin

-- 4. Log de disparos de cobrança (evita reenvio duplicado)
CREATE TABLE IF NOT EXISTS finance_charge_log (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    installment_id  TEXT NOT NULL REFERENCES client_installments(id) ON DELETE CASCADE,
    client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    stage           TEXT NOT NULL,
    -- stage: '1day_before' | 'due_today' | 'overdue_1' | 'overdue_n' | 'summary'
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    channel         TEXT NOT NULL DEFAULT 'personal',
    -- channel: 'personal' | 'group'
    success         BOOLEAN NOT NULL DEFAULT true,
    error_message   TEXT,
    UNIQUE(installment_id, stage, channel)
    -- UNIQUE garante que o mesmo estágio não é disparado duas vezes
);
CREATE INDEX IF NOT EXISTS idx_finance_charge_log_tenant      ON finance_charge_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_charge_log_installment ON finance_charge_log(installment_id);
CREATE INDEX IF NOT EXISTS idx_finance_charge_log_date        ON finance_charge_log(sent_at);
