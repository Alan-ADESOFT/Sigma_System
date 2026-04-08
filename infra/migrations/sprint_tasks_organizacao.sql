-- ============================================================
-- Sprint: Tasks e Organização
-- Migration 100% idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- 1. Novas colunas na tabela client_tasks existente
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE client_tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2);

-- 2. task_categories — categorias configuráveis por tenant
CREATE TABLE IF NOT EXISTS task_categories (
    id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366F1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, name)
);

-- 3. task_dependencies — dependências entre tasks
CREATE TABLE IF NOT EXISTS task_dependencies (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_id         TEXT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
    depends_on_id   TEXT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(task_id, depends_on_id)
);

-- 4. task_comments — comentários com suporte a @menções
CREATE TABLE IF NOT EXISTS task_comments (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_id     TEXT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    mentions    TEXT[] DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- 5. task_activity_log — histórico de alterações
CREATE TABLE IF NOT EXISTS task_activity_log (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_id     TEXT NOT NULL REFERENCES client_tasks(id) ON DELETE CASCADE,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_activity_task ON task_activity_log(task_id);

-- 6. meetings — calendário de reuniões
CREATE TABLE IF NOT EXISTS meetings (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    meeting_date  DATE NOT NULL,
    start_time    TIME NOT NULL,
    end_time      TIME,
    client_id     TEXT REFERENCES marketing_clients(id) ON DELETE SET NULL,
    participants  TEXT[] NOT NULL DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'scheduled',
    meet_link     TEXT,
    minutes_url   TEXT,
    obs           TEXT,
    created_by    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_tenant ON meetings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date   ON meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_meetings_client ON meetings(client_id);

-- 7. task_templates — automação de tasks por serviço ou novo cliente
CREATE TABLE IF NOT EXISTS task_templates (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    trigger     TEXT NOT NULL,
    tasks_json  JSONB NOT NULL DEFAULT '[]',
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. task_bot_config — configuração do bot de lembrete
CREATE TABLE IF NOT EXISTS task_bot_config (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone           TEXT NOT NULL,
    dispatch_time   TIME NOT NULL DEFAULT '08:00',
    active_days     INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
    message_morning TEXT,
    message_overdue TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- 9. Grupo WhatsApp na ficha do cliente
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS whatsapp_group_id   TEXT;
ALTER TABLE marketing_clients ADD COLUMN IF NOT EXISTS whatsapp_group_name TEXT;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_task_deps_task       ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies(depends_on_id);
CREATE INDEX IF NOT EXISTS idx_task_categories_tenant ON task_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_tenant ON task_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_bot_config_tenant ON task_bot_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_status ON client_tasks(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_client_tasks_category ON client_tasks(category_id);
