/**
 * GET  /api/social/folders?accountId=<id>  → lista pastas da conta
 * POST /api/social/folders                 → cria pasta
 *   body: { accountId, name, description?, color? }
 */

const { query, queryOne } = require('../../../infra/db');
const { resolveTenantId }  = require('../../../infra/get-tenant-id');

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);

  try {
    /* ── GET: listar pastas de uma conta ── */
    if (req.method === 'GET') {
      const { accountId } = req.query;
      if (!accountId) {
        return res.status(400).json({ success: false, error: 'accountId obrigatorio' });
      }

      const rows = await query(
        `SELECT
           f.*,
           COUNT(c.id)::int AS content_count
         FROM content_folders f
         LEFT JOIN contents c ON c.folder_id = f.id
         WHERE f.tenant_id = $1 AND f.account_id = $2
         GROUP BY f.id
         ORDER BY f.created_at DESC`,
        [tenantId, accountId]
      );

      return res.json({ success: true, folders: rows });
    }

    /* ── POST: criar pasta ── */
    if (req.method === 'POST') {
      const { accountId, name, description, color } = req.body;

      if (!accountId) return res.status(400).json({ success: false, error: 'accountId obrigatorio' });
      if (!name?.trim()) return res.status(400).json({ success: false, error: 'name obrigatorio' });

      const folder = await queryOne(
        `INSERT INTO content_folders (tenant_id, account_id, name, description, color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, accountId, name.trim(), description || null, color || '#ff0033']
      );

      return res.status(201).json({ success: true, folder });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[/api/social/folders]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
