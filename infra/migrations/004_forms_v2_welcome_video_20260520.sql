-- ─────────────────────────────────────────────────────────────────────────────
-- 004_forms_v2_welcome_video_20260520.sql
-- Sprint Forms v2 — nome do responsável + toggle de saudação.
--
-- Por que: o sistema hoje saúda o cliente como "Olá, {company_name}". A nova
-- política de comunicação prevê saudar pelo nome do responsável quando o
-- operador preferir — daí o toggle. responsible_name é texto livre opcional;
-- onboarding_greeting_with controla qual fonte usar nas mensagens
-- (cron diário, cron de incentivo, modal de envio, Jarvis).
--
-- As 4 chaves novas de settings (onboarding_welcome_video_url,
-- onboarding_welcome_video_filename, onboarding_welcome_video_description,
-- onboarding_msg_incentive) NÃO precisam de DDL — settings é key/value.
-- Idempotente — pode rodar 2x sem erro.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE marketing_clients
  ADD COLUMN IF NOT EXISTS responsible_name TEXT;

ALTER TABLE marketing_clients
  ADD COLUMN IF NOT EXISTS onboarding_greeting_with TEXT
  NOT NULL DEFAULT 'company';

-- Garante o domínio do toggle (idempotente — só cria a constraint se ela ainda
-- não existir; usar try/except em PL/pgSQL pra evitar erro em re-run).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_onboarding_greeting_with'
  ) THEN
    ALTER TABLE marketing_clients
      ADD CONSTRAINT chk_onboarding_greeting_with
      CHECK (onboarding_greeting_with IN ('company', 'responsible'));
  END IF;
END $$;
