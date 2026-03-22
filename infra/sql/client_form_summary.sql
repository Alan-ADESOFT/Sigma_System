-- ============================================================
-- CLIENT_FORM_SUMMARIES
-- Resumo gerado por IA a partir das respostas do formulário.
-- Um resumo por cliente — regenerável a qualquer momento.
--
-- Copie e cole no Neon SQL Editor para criar a tabela.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_form_summaries (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    client_id   TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    summary     TEXT NOT NULL,           -- resumo completo em markdown
    model_used  TEXT,                    -- modelo que gerou (ex: gpt-4o)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(client_id)
);

CREATE INDEX IF NOT EXISTS idx_form_summaries_client ON client_form_summaries(client_id);

-- Trigger de updated_at
DROP TRIGGER IF EXISTS trg_client_form_summaries_updated_at ON client_form_summaries;
CREATE TRIGGER trg_client_form_summaries_updated_at
BEFORE UPDATE ON client_form_summaries
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
