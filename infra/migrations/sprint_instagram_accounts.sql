-- ============================================================
-- Sprint Instagram — Contas conectadas + posts agendados
-- ============================================================
-- Aplicar via Neon SQL Editor ou:
--   psql $DATABASE_URL -f infra/migrations/sprint_instagram_accounts.sql
--
-- Idempotente (CREATE IF NOT EXISTS).
-- IDs em TEXT para manter consistência com o resto do schema
-- (todas as outras tabelas usam gen_random_uuid()::text).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. instagram_accounts — uma conta Instagram por cliente
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id           TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
  ig_user_id          TEXT NOT NULL,
  username            TEXT,
  access_token        TEXT NOT NULL,
  token_expires_at    TIMESTAMPTZ,
  profile_picture_url TEXT,
  followers_count     INTEGER NOT NULL DEFAULT 0,
  follows_count       INTEGER NOT NULL DEFAULT 0,
  media_count         INTEGER NOT NULL DEFAULT 0,
  biography           TEXT,
  account_type        TEXT NOT NULL DEFAULT 'BUSINESS',
  connected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

CREATE INDEX IF NOT EXISTS idx_ig_accounts_tenant ON instagram_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_client ON instagram_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_ig_accounts_expiry ON instagram_accounts(token_expires_at);

-- ─────────────────────────────────────────────────────────────
-- 2. instagram_scheduled_posts — fila de publicação
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instagram_scheduled_posts (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES marketing_clients(id) ON DELETE CASCADE,
  ig_account_id   TEXT REFERENCES instagram_accounts(id) ON DELETE SET NULL,
  media_type      TEXT NOT NULL DEFAULT 'IMAGE',  -- IMAGE | REELS | CAROUSEL | STORIES
  image_urls      TEXT[],                          -- array de URLs (carousel ou single)
  video_url       TEXT,
  caption         TEXT,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',   -- draft | scheduled | publishing | published | failed
  published_at    TIMESTAMPTZ,
  ig_media_id     TEXT,                            -- ID retornado pela Meta após publicação
  permalink       TEXT,
  error_message   TEXT,
  folder_id       TEXT REFERENCES content_folders(id) ON DELETE SET NULL,
  copy_content    TEXT,                            -- snapshot da copy quando importada
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ig_posts_tenant    ON instagram_scheduled_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ig_posts_client    ON instagram_scheduled_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_ig_posts_scheduled ON instagram_scheduled_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ig_posts_status    ON instagram_scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_ig_posts_due       ON instagram_scheduled_posts(status, scheduled_at);

-- ─────────────────────────────────────────────────────────────
-- 3. Trigger updated_at (reaproveitando a função update_updated_at)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- só cria os triggers se a função existir (evita erro se schema.sql não foi rodado)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_instagram_accounts_updated_at ON instagram_accounts;
    CREATE TRIGGER trg_instagram_accounts_updated_at
      BEFORE UPDATE ON instagram_accounts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    DROP TRIGGER IF EXISTS trg_instagram_scheduled_posts_updated_at ON instagram_scheduled_posts;
    CREATE TRIGGER trg_instagram_scheduled_posts_updated_at
      BEFORE UPDATE ON instagram_scheduled_posts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
