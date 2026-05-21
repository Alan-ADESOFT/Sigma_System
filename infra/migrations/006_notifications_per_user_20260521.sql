-- ─────────────────────────────────────────────────────────────────────────────
-- 006_notifications_per_user_20260521.sql
-- PATCH: notificações por usuário (single-workspace).
--
-- Contexto: a tabela system_notifications hoje tem `tenant_id` mas não tem
-- coluna de destinatário. Como o Sigma opera em modo single-workspace
-- (TODOS os usuários compartilham o mesmo tenant_id), filtrar só por
-- tenant_id significa que TODO MUNDO VÊ NOTIFICAÇÃO DE TODO MUNDO no
-- sininho — o que está errado pra notificações pessoais (ex: "task
-- atribuída a você").
--
-- Solução: adicionar user_id NULLABLE.
--   • user_id = NULL  → notificação broadcast (todo time vê).
--   • user_id = $X    → notificação pessoal (só $X vê).
--
-- NULLABLE garante compat com notificações antigas — elas viram broadcast
-- retroativo (aceitável: a maioria do histórico é operacional do sistema).
--
-- Idempotente — pode rodar 2x sem erro.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE system_notifications
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES tenants(id) ON DELETE CASCADE;

-- Índice composto pra o filtro padrão do sininho:
--   WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL) AND read = false
-- Coverage de tenant_id + user_id + read em uma estrutura só.
CREATE INDEX IF NOT EXISTS idx_system_notif_user
  ON system_notifications(user_id, read, created_at DESC);
