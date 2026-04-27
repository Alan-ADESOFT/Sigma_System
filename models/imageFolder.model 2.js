/**
 * @fileoverview Model de pastas do Gerador de Imagem
 * @description CRUD da tabela image_folders. Hierarquia plana (sem subpastas).
 * UNIQUE(client_id, name) garante que não há duplicatas dentro do cliente.
 */

const { query, queryOne } = require('../infra/db');
// OTIMIZAÇÃO: cache 2min. Sidebar bate em listByClient a cada navegação;
// pastas são criadas raramente.
const cache = require('../infra/cache');

/**
 * Cria uma pasta. Lança erro se nome já existe no cliente.
 * @param {object} data - { tenantId, clientId, name, color, createdBy }
 */
async function createFolder(data) {
  const { tenantId, clientId, name, color, createdBy } = data;
  if (!tenantId || !clientId || !name) {
    throw new Error('createFolder: tenantId, clientId e name obrigatórios');
  }
  const trimmed = String(name).trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new Error('createFolder: nome precisa ter entre 1 e 80 caracteres');
  }
  const row = await queryOne(
    `INSERT INTO image_folders (tenant_id, client_id, name, color, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [tenantId, clientId, trimmed, color || null, createdBy || null]
  );
  invalidateFoldersCache(clientId, tenantId);
  return row;
}

/**
 * Lista pastas de um cliente, com contagem de jobs ativos por pasta.
 * @param {string} clientId
 * @param {string} tenantId
 */
async function listByClient(clientId, tenantId) {
  // OTIMIZAÇÃO: cache 120s. Subquery COUNT por pasta é O(N) no índice
  // idx_jobs_folder_recent, mas evitar repetição em UI nervosa vale a pena.
  return cache.getOrSet(
    cache.ImageKeys.foldersList(clientId, tenantId),
    () => query(
      `SELECT f.*,
              (SELECT COUNT(*)::int FROM image_jobs j
                WHERE j.folder_id = f.id AND j.deleted_at IS NULL) AS job_count
         FROM image_folders f
        WHERE f.client_id = $1 AND f.tenant_id = $2
        ORDER BY f.created_at DESC`,
      [clientId, tenantId]
    ),
    120 // 2 min
  );
}

function invalidateFoldersCache(clientId, tenantId) {
  cache.invalidate(cache.ImageKeys.foldersList(clientId, tenantId));
}

/**
 * Busca uma pasta específica (filtra tenant para multi-tenancy).
 */
async function getFolderById(id, tenantId) {
  return queryOne(
    `SELECT * FROM image_folders WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
}

/**
 * Atualiza nome e/ou cor.
 */
async function updateFolder(id, tenantId, fields) {
  const sets = [];
  const params = [id, tenantId];
  if (typeof fields.name === 'string') {
    const trimmed = fields.name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
      throw new Error('updateFolder: nome precisa ter entre 1 e 80 caracteres');
    }
    params.push(trimmed);
    sets.push(`name = $${params.length}`);
  }
  if (fields.color !== undefined) {
    params.push(fields.color || null);
    sets.push(`color = $${params.length}`);
  }
  if (sets.length === 0) return getFolderById(id, tenantId);
  sets.push(`updated_at = now()`);

  const updated = await queryOne(
    `UPDATE image_folders SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params
  );
  if (updated?.client_id) invalidateFoldersCache(updated.client_id, tenantId);
  return updated;
}

/**
 * Remove a pasta. Os jobs filhos têm folder_id = NULL via ON DELETE SET NULL.
 */
async function deleteFolder(id, tenantId) {
  const row = await queryOne(
    `DELETE FROM image_folders WHERE id = $1 AND tenant_id = $2 RETURNING id, client_id`,
    [id, tenantId]
  );
  if (row?.client_id) invalidateFoldersCache(row.client_id, tenantId);
  return !!row;
}

module.exports = {
  createFolder,
  listByClient,
  invalidateFoldersCache,
  getFolderById,
  updateFolder,
  deleteFolder,
};
