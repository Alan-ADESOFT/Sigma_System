-- ─────────────────────────────────────────────────────────────────────────────
-- 005_support_center_20260520.sql
-- Sprint Central de Suporte — área interna de tutoriais (módulos > aulas > mídias).
--
-- Por que essas 3 tabelas: a hierarquia mapeia bem o uso (admin cria módulo
-- temático, dentro dele cria aulas, em cada aula joga 1 ou N vídeos + anexos).
-- CASCADE em tudo: apagar módulo apaga aulas e mídias do banco — os arquivos
-- físicos em public/uploads/ ficam órfãos (dívida técnica documentada no README).
-- Idempotente — pode rodar 2x sem erro.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_modules (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    icon        TEXT DEFAULT 'book',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_modules_tenant_order
  ON support_modules(tenant_id, sort_order);

CREATE TABLE IF NOT EXISTS support_lessons (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_id   TEXT NOT NULL REFERENCES support_modules(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_lessons_module_order
  ON support_lessons(module_id, sort_order);

CREATE TABLE IF NOT EXISTS support_media (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lesson_id       TEXT NOT NULL REFERENCES support_lessons(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('video', 'attachment')),
    title           TEXT,
    description     TEXT,
    file_url        TEXT NOT NULL,
    file_name       TEXT,
    file_size_bytes BIGINT,
    mime_type       TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_by      TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_media_lesson_order
  ON support_media(lesson_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_support_media_lesson_kind
  ON support_media(lesson_id, kind);

-- Triggers de updated_at (a função update_updated_at já existe no schema base).
DROP TRIGGER IF EXISTS trg_support_modules_updated_at ON support_modules;
CREATE TRIGGER trg_support_modules_updated_at
  BEFORE UPDATE ON support_modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_support_lessons_updated_at ON support_lessons;
CREATE TRIGGER trg_support_lessons_updated_at
  BEFORE UPDATE ON support_lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
