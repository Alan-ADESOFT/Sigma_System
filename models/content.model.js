/**
 * models/content.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD de conteúdos (posts, stories, reels, carrosseis, campanhas).
 * Alimenta o board Kanban e o scheduler de publicação automática.
 *
 * Tabela: contents
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parseia um valor que pode ser JSON array, string CSV ou null.
 * Garante que o retorno é sempre um Array limpo.
 * @param {string|null} value - Valor cru do banco (coluna TEXT)
 * @returns {string[]}
 */
function safeJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return value.split(/[,\s]+/).filter(Boolean);
  }
}

/**
 * Converte uma row do banco para o formato camelCase usado pelo frontend.
 * @param {Object} row - Row crua do PostgreSQL
 * @returns {Object}
 */
function mapContent(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    accountId: row.account_id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    scheduledAt: row.scheduled_at,
    hashtags: safeJsonArray(row.hashtags),
    mediaUrls: safeJsonArray(row.media_urls),
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Lista todos os conteúdos do tenant, ordenados por posição no board.
 * @param {string} tenantId
 * @returns {Promise<Array>}
 */
async function getContents(tenantId) {
  const rows = await query(
    `SELECT * FROM contents WHERE tenant_id = $1 ORDER BY sort_order ASC, created_at DESC`,
    [tenantId]
  );
  return rows.map(mapContent);
}

/**
 * Busca um conteúdo pelo id + tenant.
 * @param {string} tenantId
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getContentById(tenantId, id) {
  const row = await queryOne(
    `SELECT * FROM contents WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return row ? mapContent(row) : null;
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza um conteúdo (upsert por id).
 * Serializa hashtags e mediaUrls como JSON antes de gravar.
 * @param {string} tenantId
 * @param {Object} content - Dados do conteúdo vindos do frontend
 * @returns {Promise<{success: boolean, content?: Object, error?: string}>}
 */
async function saveContent(tenantId, content) {
  try {
    const hashtags = JSON.stringify(content.hashtags || []);
    const mediaUrls = JSON.stringify(content.mediaUrls || []);
    const scheduledAt = content.scheduledAt ? new Date(content.scheduledAt).toISOString() : null;

    const row = await queryOne(
      `INSERT INTO contents (id, tenant_id, account_id, title, description, type, status, scheduled_at, hashtags, media_urls, sort_order)
       VALUES (COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         account_id = $3, title = $4, description = $5, type = $6, status = $7,
         scheduled_at = $8, hashtags = $9, media_urls = $10, sort_order = $11
       RETURNING *`,
      [
        content.id || null, tenantId, content.accountId || null,
        content.title, content.description || null, content.type || 'post',
        content.status || 'draft', scheduledAt, hashtags, mediaUrls,
        content.order ?? 0,
      ]
    );
    return { success: true, content: row ? mapContent(row) : null };
  } catch (e) {
    console.error('Erro ao salvar conteudo:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Atualiza apenas o status de um conteúdo (ex: draft → approved).
 * @param {string} id
 * @param {string} status
 */
async function updateContentStatus(id, status) {
  await query(`UPDATE contents SET status = $1 WHERE id = $2`, [status, id]);
}

/**
 * Remove um conteúdo do tenant.
 * @param {string} tenantId
 * @param {string} id
 */
async function deleteContent(tenantId, id) {
  await query(`DELETE FROM contents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

/**
 * Busca posts com status 'scheduled' cuja data já passou.
 * Inclui access_token da conta para publicação via API do Instagram.
 * Chamado pelo cron de publicação automática.
 * @returns {Promise<Array>} Rows cruas (não mapeadas) com dados da conta
 */
async function getScheduledPosts() {
  const rows = await query(
    `SELECT c.*, a.access_token, a.provider_account_id
     FROM contents c
     LEFT JOIN accounts a ON a.id = c.account_id
     WHERE c.status = 'scheduled' AND c.scheduled_at <= now()
     ORDER BY c.scheduled_at ASC`
  );
  return rows;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  getContents, getContentById, saveContent,
  updateContentStatus, deleteContent, getScheduledPosts,
};
