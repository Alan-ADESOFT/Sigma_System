/**
 * pages/api/instagram/scheduled-posts.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD da fila de publicação (instagram_scheduled_posts).
 *
 * @route GET    /api/instagram/scheduled-posts?clientId=&from=&to=
 * @route POST   /api/instagram/scheduled-posts            { ...post }
 * @route PUT    /api/instagram/scheduled-posts?postId=    { campos }
 * @route DELETE /api/instagram/scheduled-posts?postId=
 *
 * Multi-tenancy: TODA query filtra por tenant_id.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { query, queryOne } = require('../../../infra/db');
const { getInstagramAccount } = require('../../../models/instagram.model');

function mapPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    igAccountId: row.ig_account_id,
    mediaType: row.media_type,
    imageUrls: row.image_urls || [],
    videoUrl: row.video_url,
    caption: row.caption,
    scheduledAt: row.scheduled_at,
    status: row.status,
    publishedAt: row.published_at,
    igMediaId: row.ig_media_id,
    permalink: row.permalink,
    errorMessage: row.error_message,
    folderId: row.folder_id,
    copyContent: row.copy_content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const VALID_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed'];
const VALID_TYPES = ['IMAGE', 'REELS', 'CAROUSEL', 'STORIES'];
const MAX_CAPTION_LENGTH = 2200;
const MAX_CAROUSEL_ITEMS = 10;

/**
 * Valida URL: precisa ser http/https, sem caracteres de injeção,
 * tamanho razoável. Retorna { ok, error }.
 */
function validateUrl(url, label = 'URL') {
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: `${label} inválida` };
  }
  if (url.length > 2048) {
    return { ok: false, error: `${label} muito longa` };
  }
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: `${label} precisa ser http(s)` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `${label} mal formada` };
  }
}

function validatePostInput(body, { isUpdate = false } = {}) {
  const errors = [];

  if (!isUpdate && !body.clientId) errors.push('clientId obrigatório');
  if (!isUpdate && !body.scheduledAt) errors.push('scheduledAt obrigatório');

  if (body.scheduledAt !== undefined) {
    const d = new Date(body.scheduledAt);
    if (isNaN(d.getTime())) errors.push('scheduledAt inválido');
  }

  if (body.mediaType !== undefined && !VALID_TYPES.includes(body.mediaType)) {
    errors.push('mediaType inválido');
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push('status inválido');
  }

  if (body.caption !== undefined && body.caption !== null) {
    if (typeof body.caption !== 'string') errors.push('caption deve ser string');
    else if (body.caption.length > MAX_CAPTION_LENGTH) {
      errors.push(`caption excede ${MAX_CAPTION_LENGTH} caracteres`);
    }
  }

  if (body.imageUrls !== undefined && body.imageUrls !== null) {
    if (!Array.isArray(body.imageUrls)) {
      errors.push('imageUrls deve ser array');
    } else {
      if (body.imageUrls.length > MAX_CAROUSEL_ITEMS) {
        errors.push(`imageUrls excede ${MAX_CAROUSEL_ITEMS} itens`);
      }
      for (const u of body.imageUrls) {
        const v = validateUrl(u, 'imageUrl');
        if (!v.ok) { errors.push(v.error); break; }
      }
    }
  }

  if (body.videoUrl !== undefined && body.videoUrl !== null && body.videoUrl !== '') {
    const v = validateUrl(body.videoUrl, 'videoUrl');
    if (!v.ok) errors.push(v.error);
  }

  if (body.folderId !== undefined && body.folderId !== null) {
    if (typeof body.folderId !== 'string' || !/^[a-z0-9-]{8,}$/i.test(body.folderId)) {
      errors.push('folderId inválido');
    }
  }

  return errors;
}

export default async function handler(req, res) {
  try {
    const tenantId = await resolveTenantId(req);

    /* ── GET ── */
    if (req.method === 'GET') {
      const { clientId, from, to } = req.query;
      if (!clientId) {
        return res.status(400).json({ success: false, error: 'clientId obrigatório' });
      }
      const params = [tenantId, clientId];
      let q = `SELECT * FROM instagram_scheduled_posts
               WHERE tenant_id = $1 AND client_id = $2`;
      if (from) {
        params.push(from);
        q += ` AND scheduled_at >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        q += ` AND scheduled_at <= $${params.length}`;
      }
      q += ` ORDER BY scheduled_at ASC`;

      const rows = await query(q, params);
      return res.json({ success: true, posts: rows.map(mapPost) });
    }

    /* ── POST ── */
    if (req.method === 'POST') {
      const {
        clientId, mediaType = 'IMAGE', imageUrls = [], videoUrl,
        caption, scheduledAt, status = 'draft', folderId, copyContent,
      } = req.body || {};

      const errs = validatePostInput({ clientId, mediaType, imageUrls, videoUrl, caption, scheduledAt, status, folderId });
      if (errs.length > 0) {
        return res.status(400).json({ success: false, error: errs.join('; ') });
      }

      // Vincula à conta IG do cliente (se houver)
      const account = await getInstagramAccount(tenantId, clientId);

      const row = await queryOne(
        `INSERT INTO instagram_scheduled_posts (
           tenant_id, client_id, ig_account_id, media_type, image_urls,
           video_url, caption, scheduled_at, status, folder_id, copy_content
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          tenantId, clientId, account?.id || null,
          mediaType,
          imageUrls.length > 0 ? imageUrls : null,
          videoUrl || null,
          caption || null,
          scheduledAt,
          status,
          folderId || null,
          copyContent || null,
        ]
      );

      console.log('[SUCESSO][API:scheduled-posts] post criado', { id: row.id, status });
      return res.status(201).json({ success: true, post: mapPost(row) });
    }

    /* ── PUT ── */
    if (req.method === 'PUT') {
      const { postId } = req.query;
      if (!postId) return res.status(400).json({ success: false, error: 'postId obrigatório' });

      const existing = await queryOne(
        `SELECT * FROM instagram_scheduled_posts WHERE id = $1 AND tenant_id = $2`,
        [postId, tenantId]
      );
      if (!existing) return res.status(404).json({ success: false, error: 'post não encontrado' });

      const errs = validatePostInput(req.body || {}, { isUpdate: true });
      if (errs.length > 0) {
        return res.status(400).json({ success: false, error: errs.join('; ') });
      }

      const fields = [];
      const params = [];
      const allowed = {
        mediaType: 'media_type',
        imageUrls: 'image_urls',
        videoUrl: 'video_url',
        caption: 'caption',
        scheduledAt: 'scheduled_at',
        status: 'status',
        folderId: 'folder_id',
        copyContent: 'copy_content',
      };

      for (const [key, col] of Object.entries(allowed)) {
        if (req.body[key] !== undefined) {
          params.push(req.body[key]);
          fields.push(`${col} = $${params.length}`);
        }
      }

      if (fields.length === 0) {
        return res.status(400).json({ success: false, error: 'nenhum campo para atualizar' });
      }

      fields.push(`updated_at = now()`);
      params.push(postId, tenantId);

      const row = await queryOne(
        `UPDATE instagram_scheduled_posts
            SET ${fields.join(', ')}
          WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
          RETURNING *`,
        params
      );

      console.log('[SUCESSO][API:scheduled-posts] post atualizado', { id: postId });
      return res.json({ success: true, post: mapPost(row) });
    }

    /* ── DELETE ── */
    if (req.method === 'DELETE') {
      const { postId } = req.query;
      if (!postId) return res.status(400).json({ success: false, error: 'postId obrigatório' });

      const result = await query(
        `DELETE FROM instagram_scheduled_posts
         WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [postId, tenantId]
      );
      if (result.length === 0) {
        return res.status(404).json({ success: false, error: 'post não encontrado' });
      }
      console.log('[SUCESSO][API:scheduled-posts] post removido', { id: postId });
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:scheduled-posts]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
