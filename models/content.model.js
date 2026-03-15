const { query, queryOne } = require('../infra/db');

function safeJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [value];
  } catch {
    return value.split(/[,\s]+/).filter(Boolean);
  }
}

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

async function getContents(tenantId) {
  const rows = await query(
    `SELECT * FROM contents WHERE tenant_id = $1 ORDER BY sort_order ASC, created_at DESC`,
    [tenantId]
  );
  return rows.map(mapContent);
}

async function getContentById(tenantId, id) {
  const row = await queryOne(
    `SELECT * FROM contents WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return row ? mapContent(row) : null;
}

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

async function updateContentStatus(id, status) {
  await query(`UPDATE contents SET status = $1 WHERE id = $2`, [status, id]);
}

async function deleteContent(tenantId, id) {
  await query(`DELETE FROM contents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
}

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

module.exports = {
  getContents, getContentById, saveContent,
  updateContentStatus, deleteContent, getScheduledPosts,
};
