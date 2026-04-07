-- ============================================================
-- MIGRATION 002 — Sistema de Onboarding por Etapas (15 dias)
-- ─────────────────────────────────────────────────────────────
-- Substitui o formulário monolítico de 11 etapas por uma jornada
-- diária de 15 etapas + 3 dias de descanso (4, 8 e 13).
--
-- Como aplicar:
--   psql $DATABASE_URL -f infra/migrations/002_onboarding_stages.sql
--   OU copiar/colar inteiro no Neon SQL Editor.
--
-- 100% idempotente. Pode rodar múltiplas vezes sem efeito colateral.
-- Já está consolidado em infra/schema.sql também.
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

ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS onboarding_status     TEXT DEFAULT 'not_started';
