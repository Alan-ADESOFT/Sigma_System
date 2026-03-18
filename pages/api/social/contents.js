/**
 * GET  /api/social/contents?folderId=<id>  → lista conteúdos da pasta
 * POST /api/social/contents                → cria conteúdo na pasta
 *   body: { folderId, accountId, title?, body, hashtags?, type?, status? }
 * PUT  /api/social/contents?id=<id>        → atualiza conteúdo
 * DELETE /api/social/contents?id=<id>      → remove conteúdo
 */

const { query, queryOne } = require('../../../infra/db');
const { resolveTenantId }  = require('../../../infra/get-tenant-id');

export default async function handler(req, res) {
  console.log('[INFO][API:/api/social/contents] Requisição recebida', { method: req.method, query: req.query });
  const tenantId = await resolveTenantId(req);

  try {
    /* ── GET ── */
    if (req.method === 'GET') {
      const { folderId } = req.query;
      if (!folderId) return res.status(400).json({ success: false, error: 'folderId obrigatorio' });

      const rows = await query(
        `SELECT * FROM contents
         WHERE tenant_id = $1 AND folder_id = $2
         ORDER BY sort_order ASC, created_at DESC`,
        [tenantId, folderId]
      );

      const contents = rows.map(mapContent);
      console.log('[SUCESSO][API:/api/social/contents] Resposta enviada', { count: contents.length, folderId });
      return res.json({ success: true, contents });
    }

    /* ── POST ── */
    if (req.method === 'POST') {
      const { folderId, accountId, title, body, hashtags, type, status } = req.body;
      if (!folderId) return res.status(400).json({ success: false, error: 'folderId obrigatorio' });

      const hashtagsJson = JSON.stringify(
        (hashtags || [])
          .map(h => (h.startsWith('#') ? h : `#${h}`))
      );

      const content = await queryOne(
        `INSERT INTO contents
           (tenant_id, account_id, folder_id, title, description, type, status, hashtags, media_urls)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          tenantId,
          accountId || null,
          folderId,
          title?.trim() || 'Conteúdo sem título',
          body || null,
          type || 'post',
          status || 'draft',
          hashtagsJson,
          '[]',
        ]
      );

      console.log('[SUCESSO][API:/api/social/contents] Conteúdo criado', { contentId: content.id, folderId });
      return res.status(201).json({ success: true, content: mapContent(content) });
    }

    /* ── PUT ── */
    if (req.method === 'PUT') {
      const { id } = req.query;
      const { title, body, hashtags, type, status } = req.body;
      if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

      const hashtagsJson = hashtags
        ? JSON.stringify(hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)))
        : undefined;

      const content = await queryOne(
        `UPDATE contents SET
           title       = COALESCE($1, title),
           description = COALESCE($2, description),
           type        = COALESCE($3, type),
           status      = COALESCE($4, status),
           hashtags    = COALESCE($5, hashtags)
         WHERE id = $6 AND tenant_id = $7
         RETURNING *`,
        [title?.trim() || null, body || null, type || null, status || null, hashtagsJson || null, id, tenantId]
      );

      if (!content) return res.status(404).json({ success: false, error: 'Conteudo nao encontrado' });
      console.log('[SUCESSO][API:/api/social/contents] Conteúdo atualizado', { contentId: id });
      return res.json({ success: true, content: mapContent(content) });
    }

    /* ── DELETE ── */
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id obrigatorio' });

      await query(`DELETE FROM contents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      console.log('[SUCESSO][API:/api/social/contents] Conteúdo removido', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:/api/social/contents] Erro no endpoint', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}

function mapContent(row) {
  return {
    id: row.id,
    folderId: row.folder_id,
    accountId: row.account_id,
    title: row.title,
    body: row.description,
    type: row.type,
    status: row.status,
    hashtags: (() => { try { return JSON.parse(row.hashtags || '[]'); } catch { return []; } })(),
    mediaUrls: (() => { try { return JSON.parse(row.media_urls || '[]'); } catch { return []; } })(),
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
