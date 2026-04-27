/**
 * @fileoverview Model Capabilities — leitura de image_model_capabilities
 * @description Source of truth pra UI e backend sobre o que cada modelo aceita.
 * Cacheado por 1h em memória — capabilities mudam só quando schema é atualizado.
 *
 * Sprint v1.1 — abril 2026.
 */

const { query, queryOne } = require('../../../infra/db');
const cache = require('../../../infra/cache');

const CACHE_TTL = 3600; // 1h

/**
 * Lista todos os modelos com capabilities.
 * @returns {Promise<Array<object>>}
 */
async function listAll() {
  return cache.getOrSet('image:capabilities:all', async () => {
    return query(`SELECT * FROM image_model_capabilities ORDER BY display_name ASC`);
  }, CACHE_TTL);
}

/**
 * Busca uma capability específica.
 * @param {string} modelId
 * @param {string} [field] - se passado, retorna só o campo
 */
async function get(modelId, field) {
  if (!modelId) return null;
  const all = await listAll();
  const row = all.find(r => r.model_id === modelId);
  if (!row) return null;
  if (field) return row[field];
  return row;
}

/**
 * Atalho: max_image_inputs do modelo (default 0 quando não encontrado).
 */
async function getMaxImageInputs(modelId) {
  const v = await get(modelId, 'max_image_inputs');
  return typeof v === 'number' ? v : 0;
}

/**
 * Atalho: supports_image_input do modelo.
 */
async function supportsImageInput(modelId) {
  const v = await get(modelId, 'supports_image_input');
  return v === true;
}

/**
 * Invalida cache (raro — só quando schema muda).
 */
function invalidate() {
  cache.invalidate('image:capabilities:all');
}

module.exports = {
  listAll,
  get,
  getMaxImageInputs,
  supportsImageInput,
  invalidate,
};
