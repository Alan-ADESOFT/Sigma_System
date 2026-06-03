/**
 * models/ataFolder.model.js
 * Pastas que organizam as atas semanais. Hierarquia plana, escopo por tenant.
 * Espelha o padrão de models/imageFolder.model.js (sem cache).
 */

const { query, queryOne } = require('../infra/db');

async function listFolders(tenantId) {
  return query(
    `SELECT f.*,
            (SELECT COUNT(*)::int FROM atas a WHERE a.folder_id = f.id) AS ata_count
       FROM ata_folders f
      WHERE f.tenant_id = $1
      ORDER BY f.created_at DESC`,
    [tenantId]
  );
}

async function getFolderById(id, tenantId) {
  return queryOne(`SELECT * FROM ata_folders WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

async function createFolder(tenantId, { name, color, createdBy }) {
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length > 80) throw new Error('Nome da pasta precisa ter entre 1 e 80 caracteres');
  return queryOne(
    `INSERT INTO ata_folders (tenant_id, name, color, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, trimmed, color || '#6366F1', createdBy || null]
  );
}

async function updateFolder(id, tenantId, { name, color }) {
  const trimmed = name != null ? String(name).trim() : null;
  if (trimmed !== null && (trimmed.length < 1 || trimmed.length > 80)) {
    throw new Error('Nome da pasta precisa ter entre 1 e 80 caracteres');
  }
  return queryOne(
    `UPDATE ata_folders SET name = COALESCE($3, name), color = COALESCE($4, color), updated_at = now()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [id, tenantId, trimmed, color || null]
  );
}

async function deleteFolder(id, tenantId) {
  // Atas filhas ficam com folder_id = NULL (ON DELETE SET NULL).
  return queryOne(`DELETE FROM ata_folders WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenantId]);
}

module.exports = { listFolders, getFolderById, createFolder, updateFolder, deleteFolder };
