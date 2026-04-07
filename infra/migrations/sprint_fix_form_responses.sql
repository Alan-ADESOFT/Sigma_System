-- Sprint Correcoes — Respostas Editaveis + Resumo IA
-- Rodar no Neon SQL Editor ou via psql $DATABASE_URL -f infra/migrations/sprint_fix_form_responses.sql

-- 1. Tabela de resumos IA do formulario (upsert por client_id)
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

-- 2. Indice para busca rapida por client_id
CREATE INDEX IF NOT EXISTS idx_cfs_client_id
  ON client_form_summaries(client_id);

-- 3. Indice unico para upsert eficiente em onboarding_stage_responses
CREATE UNIQUE INDEX IF NOT EXISTS idx_osr_client_stage
  ON onboarding_stage_responses (client_id, stage_number);

-- 4. Trigger de updated_at para client_form_summaries
CREATE TRIGGER trg_client_form_summaries_updated_at
  BEFORE UPDATE ON client_form_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
