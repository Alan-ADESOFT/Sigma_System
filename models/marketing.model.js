/**
 * models/marketing.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD das etapas do pipeline de marketing por cliente.
 * Cada cliente passa por 6 etapas: diagnóstico, concorrentes, público,
 * avatar, posicionamento e oferta. Os dados de cada etapa são armazenados
 * como JSONB na coluna `data`.
 *
 * Tabela: marketing_stages  (unique: client_id + stage_key)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Retorna todas as etapas de um cliente, ordenadas pela sequência do pipeline.
 * @param {string} clientId
 * @returns {Promise<Array>}
 */
async function getStagesByClient(clientId) {
  return query(
    `SELECT * FROM marketing_stages
     WHERE client_id = $1
     ORDER BY CASE stage_key
       WHEN 'diagnosis'    THEN 1
       WHEN 'competitors'  THEN 2
       WHEN 'audience'     THEN 3
       WHEN 'avatar'       THEN 4
       WHEN 'positioning'  THEN 5
       WHEN 'offer'        THEN 6
       ELSE 99
     END`,
    [clientId]
  );
}

/**
 * Busca uma etapa específica de um cliente.
 * @param {string} clientId
 * @param {string} stageKey - 'diagnosis' | 'competitors' | 'audience' | 'avatar' | 'positioning' | 'offer'
 * @returns {Promise<Object|null>}
 */
async function getStage(clientId, stageKey) {
  return queryOne(
    `SELECT * FROM marketing_stages
     WHERE client_id = $1 AND stage_key = $2`,
    [clientId, stageKey]
  );
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Upsert a stage for a client.
 * Se a etapa já existir, atualiza status/data/notes sem apagar campos existentes
 * (COALESCE mantém o valor anterior quando o novo é null).
 * @param {string} clientId
 * @param {string} stageKey - 'diagnosis' | 'competitors' | 'audience' | 'avatar' | 'positioning' | 'offer'
 * @param {Object|null} data - JSONB output to store
 * @param {string} [status='in_progress'] - 'pending' | 'in_progress' | 'done'
 * @param {string|null} [notes=null]
 * @returns {Promise<Object>} Stage criada/atualizada
 */
async function upsertStage(clientId, stageKey, data, status = 'in_progress', notes = null) {
  return queryOne(
    `INSERT INTO marketing_stages (client_id, stage_key, status, data, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (client_id, stage_key)
     DO UPDATE SET
       status     = EXCLUDED.status,
       data       = COALESCE(EXCLUDED.data,  marketing_stages.data),
       notes      = COALESCE(EXCLUDED.notes, marketing_stages.notes),
       updated_at = now()
     RETURNING *`,
    [
      clientId, stageKey, status,
      data ? JSON.stringify(data) : null,
      notes
    ]
  );
}

/**
 * Atualiza apenas as notas de uma etapa, sem alterar status ou data.
 * @param {string} clientId
 * @param {string} stageKey
 * @param {string} notes
 * @returns {Promise<Object>} Stage atualizada
 */
async function updateStageNotes(clientId, stageKey, notes) {
  return queryOne(
    `UPDATE marketing_stages
     SET notes = $3, updated_at = now()
     WHERE client_id = $1 AND stage_key = $2
     RETURNING *`,
    [clientId, stageKey, notes]
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  getStagesByClient,
  getStage,
  upsertStage,
  updateStageNotes,
};
