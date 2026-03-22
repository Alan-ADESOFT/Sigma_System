/**
 * @fileoverview Model de sessoes de copy e estruturas
 * @description CRUD para copy_sessions, copy_history e copy_structures.
 * Cada conteudo da pasta social tem exatamente uma sessao de copy.
 *
 * Tabelas: copy_sessions, copy_history, copy_structures
 */

const { query, queryOne } = require('../../infra/db');

// ── Sessoes ──────────────────────────────────────────────────

/**
 * Busca ou cria uma sessao de copy para um conteudo
 * @param {string} contentId - ID do conteudo (contents.id)
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<object>} Sessao completa
 */
async function getOrCreateSession(contentId, tenantId) {
  console.log('[INFO][CopySession] getOrCreateSession', { contentId, tenantId });

  // Tenta buscar sessao existente
  let session = await queryOne(
    `SELECT * FROM copy_sessions WHERE content_id = $1 AND tenant_id = $2`,
    [contentId, tenantId]
  );

  if (session) {
    console.log('[INFO][CopySession] Sessao encontrada', { sessionId: session.id });
    return session;
  }

  // Cria nova sessao com defaults
  session = await queryOne(
    `INSERT INTO copy_sessions (tenant_id, content_id, status)
     VALUES ($1, $2, 'draft') RETURNING *`,
    [tenantId, contentId]
  );

  console.log('[SUCESSO][CopySession] Sessao criada', { sessionId: session.id, contentId });
  return session;
}

/**
 * Atualiza campos de uma sessao existente
 * @param {string} sessionId - ID da sessao
 * @param {object} fields - Campos a atualizar
 * @param {string} [fields.client_id]
 * @param {string} [fields.structure_id]
 * @param {string} [fields.model_used]
 * @param {string} [fields.prompt_raiz]
 * @param {string} [fields.output_text]
 * @param {string} [fields.tone]
 * @param {string} [fields.status]
 * @param {object} [fields.metadata]
 * @returns {Promise<object>} Sessao atualizada
 */
async function updateSession(sessionId, fields) {
  console.log('[INFO][CopySession] updateSession', { sessionId, fields: Object.keys(fields) });

  const ALLOWED = ['client_id', 'structure_id', 'model_used', 'prompt_raiz', 'output_text', 'tone', 'status', 'metadata'];
  const sets = [];
  const vals = [];
  let idx = 1;

  for (const key of ALLOWED) {
    if (fields[key] !== undefined) {
      const col = key; // nomes ja correspondem as colunas
      if (key === 'metadata') {
        sets.push(`${col} = $${idx}::jsonb`);
        vals.push(JSON.stringify(fields[key]));
      } else {
        sets.push(`${col} = $${idx}`);
        vals.push(fields[key]);
      }
      idx++;
    }
  }

  if (sets.length === 0) {
    console.log('[INFO][CopySession] Nenhum campo para atualizar');
    return queryOne('SELECT * FROM copy_sessions WHERE id = $1', [sessionId]);
  }

  vals.push(sessionId);
  const session = await queryOne(
    `UPDATE copy_sessions SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );

  console.log('[SUCESSO][CopySession] Sessao atualizada', { sessionId });
  return session;
}

// ── Historico ────────────────────────────────────────────────

/**
 * Salva uma entrada no historico de geracoes/modificacoes
 * @param {string} sessionId - ID da sessao
 * @param {string} tenantId - ID do tenant
 * @param {string} modelUsed - Modelo utilizado
 * @param {string} promptSent - Prompt completo enviado
 * @param {string} outputText - Texto gerado
 * @param {string} action - 'generate' | 'improve' | 'modify'
 * @param {object} tokens - { input, output, total }
 * @returns {Promise<object>} Registro criado
 */
async function saveToHistory(sessionId, tenantId, modelUsed, promptSent, outputText, action, tokens = {}) {
  console.log('[INFO][CopySession] saveToHistory', { sessionId, action, modelUsed });

  const row = await queryOne(
    `INSERT INTO copy_history (session_id, tenant_id, model_used, prompt_sent, output_text, action, tokens_input, tokens_output, tokens_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      sessionId, tenantId, modelUsed, promptSent, outputText, action,
      tokens.input || null, tokens.output || null, tokens.total || null,
    ]
  );

  console.log('[SUCESSO][CopySession] Historico salvo', { historyId: row.id, action });
  return row;
}

/**
 * Busca historico de geracoes de uma sessao
 * @param {string} sessionId - ID da sessao
 * @param {number} [limit=20] - Limite de registros
 * @returns {Promise<Array>} Lista de entradas do historico
 */
async function getHistory(sessionId, limit = 20) {
  console.log('[INFO][CopySession] getHistory', { sessionId, limit });

  const rows = await query(
    `SELECT * FROM copy_history WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [sessionId, limit]
  );

  return rows;
}

// ── Estruturas ───────────────────────────────────────────────

/**
 * Busca todas as estruturas de copy ativas de um tenant
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<Array>} Lista de estruturas ordenadas por sort_order
 */
async function getStructures(tenantId) {
  console.log('[INFO][CopySession] getStructures', { tenantId });

  const rows = await query(
    `SELECT * FROM copy_structures WHERE tenant_id = $1 AND active = true ORDER BY sort_order ASC`,
    [tenantId]
  );

  return rows;
}

// ── Exports ──────────────────────────────────────────────────

module.exports = {
  getOrCreateSession,
  updateSession,
  saveToHistory,
  getHistory,
  getStructures,
};
