/**
 * models/userPreferences.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Preferências por usuário do módulo de Tasks.
 *
 * Hoje guarda apenas a view default do dashboard de tasks (kanban/lista/checklist),
 * mas a tabela é genérica o suficiente pra crescer (ex: ordenação preferida,
 * agrupamento default, etc.) sem migration adicional.
 *
 * Modelo single-workspace: tenant_id sempre = WORKSPACE_TENANT_ID; user_id é
 * quem identifica de fato a pessoa. Mantemos o UNIQUE(tenant_id, user_id) pra
 * permitir um upsert direto via ON CONFLICT.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { queryOne } = require('../infra/db');

const ALLOWED_VIEWS = ['kanban', 'lista', 'checklist'];
const DEFAULT_VIEW = 'checklist';

function isValidView(v) {
  return ALLOWED_VIEWS.includes(v);
}

/**
 * Lê a preferência do usuário. Se nunca foi salva, devolve um objeto "virtual"
 * com o default — sem inserir no banco (a inserção acontece no primeiro PUT).
 */
async function getPreferences(tenantId, userId) {
  const row = await queryOne(
    `SELECT id, default_view, created_at, updated_at
       FROM user_task_preferences
      WHERE tenant_id = $1 AND user_id = $2
      LIMIT 1`,
    [tenantId, userId]
  );
  if (!row) {
    return { default_view: DEFAULT_VIEW, persisted: false };
  }
  return { ...row, persisted: true };
}

/**
 * Upsert. Aceita só campos validados — qualquer view fora do enum é rejeitada
 * lá em cima pra não chegar no CHECK do banco.
 */
async function upsertPreferences(tenantId, userId, patch) {
  if (patch.default_view && !isValidView(patch.default_view)) {
    throw new Error(`default_view inválido: ${patch.default_view}`);
  }
  const view = patch.default_view || DEFAULT_VIEW;

  return queryOne(
    `INSERT INTO user_task_preferences (tenant_id, user_id, default_view)
       VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET default_view = EXCLUDED.default_view,
            updated_at   = now()
     RETURNING id, default_view, created_at, updated_at`,
    [tenantId, userId, view]
  );
}

module.exports = {
  getPreferences,
  upsertPreferences,
  isValidView,
  ALLOWED_VIEWS,
  DEFAULT_VIEW,
};
