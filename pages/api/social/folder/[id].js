/**
 * GET    /api/social/folder/:id  → detalhes da pasta + conteúdos
 * PUT    /api/social/folder/:id  → atualiza nome/cor/descrição
 * DELETE /api/social/folder/:id  → remove pasta (e conteúdos via ON DELETE SET NULL)
 */

const { query, queryOne } = require('../../../../infra/db');
const { resolveTenantId }  = require('../../../../infra/get-tenant-id');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/social/folder/:id] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);
  const { id }   = req.query;

  if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    if (req.method === 'GET') {
      const folder = await queryOne(
        `SELECT f.*, COUNT(c.id)::int AS content_count
         FROM content_folders f
         LEFT JOIN contents c ON c.folder_id = f.id
         WHERE f.id = $1 AND f.tenant_id = $2
         GROUP BY f.id`,
        [id, tenantId]
      );
      if (!folder) return res.status(404).json({ success: false, error: 'Pasta nao encontrada' });
      console.log('[SUCESSO][API:/api/social/folder/:id] Resposta enviada', { folderId: id });
      return res.json({ success: true, folder });
    }

    if (req.method === 'PUT') {
      const { name, description, color } = req.body;
      const folder = await queryOne(
        `UPDATE content_folders SET
           name        = COALESCE($1, name),
           description = COALESCE($2, description),
           color       = COALESCE($3, color)
         WHERE id = $4 AND tenant_id = $5
         RETURNING *`,
        [name?.trim() || null, description || null, color || null, id, tenantId]
      );
      if (!folder) return res.status(404).json({ success: false, error: 'Pasta nao encontrada' });
      console.log('[SUCESSO][API:/api/social/folder/:id] Pasta atualizada', { folderId: id });
      return res.json({ success: true, folder });
    }

    if (req.method === 'DELETE') {
      await query(
        `DELETE FROM content_folders WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      console.log('[SUCESSO][API:/api/social/folder/:id] Pasta removida', { folderId: id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/social/folder/:id] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
