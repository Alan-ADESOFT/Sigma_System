-- ============================================================
-- Sprint J.A.R.V.I.S — Campos multi-usuário em client_tasks
-- + tabela de log de uso do Jarvis (jarvis_usage_log).
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.
-- ============================================================

-- ── client_tasks: assigned_to / created_by / description / tenant_id ────────
ALTER TABLE client_tasks
  ADD COLUMN IF NOT EXISTS assigned_to  TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by   TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id    TEXT REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_client_tasks_assigned ON client_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_client_tasks_created  ON client_tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_client_tasks_tenant   ON client_tasks(tenant_id);

-- ── jarvis_usage_log ────────────────────────────────────────────────────────
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
