-- ============================================================
-- MIGRATION: Consolidar todos os dados sob o WORKSPACE_TENANT_ID
-- Roda UMA VEZ no Neon SQL Editor.
-- Idempotente: re-rodar não faz nada se tudo já estiver consolidado.
--
-- Estratégia:
-- 1. Para cada UNIQUE constraint (tenant_id, ...), deleta:
--    a) linhas fora do workspace cuja chave já existe no workspace
--    b) duplicatas entre tenants <> workspace (mantém uma)
-- 2. UPDATE remanescentes pra workspace_id.
--
-- Tabelas com FK referenciando as deletadas:
--   finance_categories <- company_finances.category_id (ON DELETE SET NULL) ✓
--   user_roles         <- tenants.custom_role_id       (ON DELETE SET NULL) ✓
-- Demais tabelas: nenhuma FK aponta pra elas → safe.
-- ============================================================

BEGIN;

DO $$
DECLARE
  workspace_id TEXT := 'a1e4526a-bb02-448f-879b-6e16a54b3afd';
  c RECORD;
  t RECORD;
  other_cols TEXT;
  rows_affected INTEGER;
  total_deleted INTEGER := 0;
  total_updated INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = workspace_id) THEN
    RAISE EXCEPTION 'workspace_id "%" não encontrado em tenants', workspace_id;
  END IF;

  RAISE NOTICE 'Iniciando consolidação para workspace_id = %', workspace_id;
  RAISE NOTICE '';
  RAISE NOTICE '─── ETAPA 1: resolver conflitos UNIQUE ───';

  FOR c IN
    SELECT tc.table_name,
           tc.constraint_name,
           string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
             FILTER (WHERE kcu.column_name <> 'tenant_id') AS other_cols
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
     WHERE tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
       AND tc.table_schema = 'public'
     GROUP BY tc.table_name, tc.constraint_name
     HAVING bool_or(kcu.column_name = 'tenant_id')
     ORDER BY tc.table_name
  LOOP
    IF c.other_cols IS NULL THEN
      -- UNIQUE/PK só em tenant_id (1 linha por tenant)
      -- Deleta as fora do workspace se workspace já tem uma
      EXECUTE format('
        DELETE FROM %I
         WHERE tenant_id <> $1
           AND EXISTS (SELECT 1 FROM %I WHERE tenant_id = $1)
      ', c.table_name, c.table_name) USING workspace_id;
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      IF rows_affected > 0 THEN
        RAISE NOTICE '  [DEL] %.%: % linhas removidas (conflito direto)',
          c.table_name, c.constraint_name, rows_affected;
        total_deleted := total_deleted + rows_affected;
      END IF;

      -- Deleta duplicatas restantes entre tenants <> workspace (mantém o primeiro)
      EXECUTE format('
        DELETE FROM %I WHERE ctid IN (
          SELECT ctid FROM (
            SELECT ctid, ROW_NUMBER() OVER (ORDER BY ctid) AS rn
              FROM %I WHERE tenant_id <> $1
          ) sub WHERE rn > 1
        )
      ', c.table_name, c.table_name) USING workspace_id;
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      IF rows_affected > 0 THEN
        RAISE NOTICE '  [DEL] %.%: % linhas removidas (duplicata entre tenants)',
          c.table_name, c.constraint_name, rows_affected;
        total_deleted := total_deleted + rows_affected;
      END IF;
    ELSE
      -- UNIQUE (tenant_id, other_cols)
      -- 1) deleta fora do workspace que conflitam com workspace
      EXECUTE format('
        DELETE FROM %I
         WHERE tenant_id <> $1
           AND (%s) IN (SELECT %s FROM %I WHERE tenant_id = $1)
      ', c.table_name, c.other_cols, c.other_cols, c.table_name) USING workspace_id;
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      IF rows_affected > 0 THEN
        RAISE NOTICE '  [DEL] %.%: % linhas removidas (conflito com workspace)',
          c.table_name, c.constraint_name, rows_affected;
        total_deleted := total_deleted + rows_affected;
      END IF;

      -- 2) deleta duplicatas entre tenants <> workspace (mantém primeiro ctid)
      EXECUTE format('
        DELETE FROM %I WHERE ctid IN (
          SELECT ctid FROM (
            SELECT ctid, ROW_NUMBER() OVER (PARTITION BY %s ORDER BY ctid) AS rn
              FROM %I WHERE tenant_id <> $1
          ) sub WHERE rn > 1
        )
      ', c.table_name, c.other_cols, c.table_name) USING workspace_id;
      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      IF rows_affected > 0 THEN
        RAISE NOTICE '  [DEL] %.%: % linhas removidas (duplicata entre tenants)',
          c.table_name, c.constraint_name, rows_affected;
        total_deleted := total_deleted + rows_affected;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '─── ETAPA 2: UPDATE tenant_id em todas as tabelas ───';

  FOR t IN
    SELECT table_name FROM information_schema.columns
     WHERE column_name = 'tenant_id' AND table_schema = 'public' AND table_name <> 'tenants'
     ORDER BY table_name
  LOOP
    EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id <> $1', t.table_name)
      USING workspace_id;
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    IF rows_affected > 0 THEN
      RAISE NOTICE '  [UPD] %: % linhas consolidadas', t.table_name, rows_affected;
      total_updated := total_updated + rows_affected;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '═══ Total: % linhas deletadas, % linhas atualizadas ═══',
    total_deleted, total_updated;
END $$;

-- Verificação final
DO $$
DECLARE
  t RECORD;
  distinct_count INTEGER;
  warnings INTEGER := 0;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
     WHERE column_name = 'tenant_id' AND table_schema = 'public' AND table_name <> 'tenants'
  LOOP
    EXECUTE format('SELECT COUNT(DISTINCT tenant_id) FROM %I', t.table_name) INTO distinct_count;
    IF distinct_count > 1 THEN
      RAISE WARNING 'Tabela % ainda tem % tenant_ids distintos', t.table_name, distinct_count;
      warnings := warnings + 1;
    END IF;
  END LOOP;

  IF warnings = 0 THEN
    RAISE NOTICE '✓ Verificação OK: todas as tabelas estão consolidadas sob o workspace.';
  END IF;
END $$;

COMMIT;
