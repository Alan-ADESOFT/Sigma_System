-- ============================================================
-- Sprint Latencia — Indices de performance
-- Todas as operacoes sao idempotentes (IF NOT EXISTS)
--
-- Executar:
--   psql $DATABASE_URL -f infra/migrations/sprint_latencia_indexes.sql
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
