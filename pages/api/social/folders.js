/**
 * @fileoverview Endpoint: Pastas de conteudo (vinculadas a cliente ou conta)
 * @route GET  /api/social/folders?accountId=<id>  → lista pastas (accountId = clientId ou account)
 * @route POST /api/social/folders                 → cria pasta
 *   body: { accountId, name, description?, color? }
 *   accountId pode ser um client_id (marketing_clients) ou account_id (accounts)
 */

const { query, queryOne } = require('../../../infra/db');
const { resolveTenantId }  = require('../../../infra/get-tenant-id');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/social/folders] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);

  try {
    /* ── GET: listar pastas ── */
    if (req.method === 'GET') {
      const { accountId } = req.query;
      if (!accountId) {
        return res.status(400).json({ success: false, error: 'accountId obrigatorio' });
      }

      // Tenta buscar como client_id primeiro, depois como account_id
      const rows = await query(
        `SELECT
           f.*,
           COUNT(c.id)::int AS content_count
         FROM content_folders f
         LEFT JOIN contents c ON c.folder_id = f.id
         WHERE f.tenant_id = $1 AND (f.client_id = $2 OR f.account_id = $2)
         GROUP BY f.id
         ORDER BY f.created_at DESC`,
        [tenantId, accountId]
      );

      console.log('[SUCESSO][API:/api/social/folders] Resposta enviada', { count: rows.length, accountId });
      return res.json({ success: true, folders: rows });
    }

    /* ── POST: criar pasta ── */
    if (req.method === 'POST') {
      const { accountId, name, description, color } = req.body;

      if (!accountId) return res.status(400).json({ success: false, error: 'accountId obrigatorio' });
      if (!name?.trim()) return res.status(400).json({ success: false, error: 'name obrigatorio' });

      // Detecta se o ID e de um cliente marketing ou de uma conta Instagram
      const isClient = await queryOne(
        'SELECT id FROM marketing_clients WHERE id = $1 AND tenant_id = $2',
        [accountId, tenantId]
      );

      let folder;
      if (isClient) {
        // Cria pasta vinculada ao cliente
        folder = await queryOne(
          `INSERT INTO content_folders (tenant_id, client_id, name, description, color)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [tenantId, accountId, name.trim(), description || null, color || '#ff0033']
        );
      } else {
        // Fallback: cria pasta vinculada a conta Instagram (compatibilidade)
        folder = await queryOne(
          `INSERT INTO content_folders (tenant_id, account_id, name, description, color)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [tenantId, accountId, name.trim(), description || null, color || '#ff0033']
        );
      }

      console.log('[SUCESSO][API:/api/social/folders] Pasta criada', { folderId: folder.id, name: name.trim(), isClient: !!isClient });
      return res.status(201).json({ success: true, folder });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/social/folders] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
