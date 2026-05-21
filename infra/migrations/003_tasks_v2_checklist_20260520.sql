-- ─────────────────────────────────────────────────────────────────────────────
-- 003_tasks_v2_checklist_20260520.sql
-- Sprint Tasks v2 — Checklist, due_time, recurrence_id e preferência de view.
--
-- Por que: a view padrão do módulo de Tasks passa a ser um Checklist estilo
-- "doc" que precisa diferenciar tasks recorrentes vs avulsas (recurrence_id),
-- ordenar por horário (due_time) e respeitar a view preferida do usuário
-- (user_task_preferences). Mantemos idempotência total — pode rodar 2x.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Horário opcional da tarefa
ALTER TABLE client_tasks
  ADD COLUMN IF NOT EXISTS due_time TIME;

-- 2) FK para task_recurrences — identifica tasks geradas por recorrência.
--    ON DELETE SET NULL: se a recorrência for apagada, a task vira "avulsa".
ALTER TABLE client_tasks
  ADD COLUMN IF NOT EXISTS recurrence_id TEXT
  REFERENCES task_recurrences(id) ON DELETE SET NULL;

-- Índice para agrupamento Recorrente/Não-recorrente no Checklist
CREATE INDEX IF NOT EXISTS idx_client_tasks_recurrence
  ON client_tasks(recurrence_id);

-- 3) Preferência de view default por usuário (kanban | lista | checklist).
--    tenant_id mantido por consistência com o resto do schema; o isolamento
--    real é por user_id (single-workspace).
CREATE TABLE IF NOT EXISTS user_task_preferences (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    default_view TEXT NOT NULL DEFAULT 'checklist',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id),
    CHECK (default_view IN ('kanban', 'lista', 'checklist'))
);
CREATE INDEX IF NOT EXISTS idx_user_task_prefs_tenant
  ON user_task_preferences(tenant_id, user_id);

-- Trigger de updated_at (a função update_updated_at já existe no schema base).
-- Idempotente: dropa antes de criar.
DROP TRIGGER IF EXISTS trg_user_task_preferences_updated_at ON user_task_preferences;
CREATE TRIGGER trg_user_task_preferences_updated_at
  BEFORE UPDATE ON user_task_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
