const { query, queryOne } = require('../infra/db');

// ─── Stages ─────────────────────────────────────────────────────────────────

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

async function getStage(clientId, stageKey) {
  return queryOne(
    `SELECT * FROM marketing_stages
     WHERE client_id = $1 AND stage_key = $2`,
    [clientId, stageKey]
  );
}

/**
 * Upsert a stage for a client.
 * @param {string} clientId
 * @param {string} stageKey - 'diagnosis' | 'competitors' | 'audience' | 'avatar' | 'positioning' | 'offer'
 * @param {object|null} data - JSONB output to store
 * @param {string} status   - 'pending' | 'in_progress' | 'done'
 * @param {string|null} notes
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
 * Update only the notes of a stage.
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

module.exports = {
  getStagesByClient,
  getStage,
  upsertStage,
  updateStageNotes,
};
