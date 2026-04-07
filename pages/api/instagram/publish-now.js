/**
 * pages/api/instagram/publish-now.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/instagram/publish-now
 *
 * Publica imediatamente no Instagram do cliente, sem salvar agendamento.
 *
 * Body:
 *   { clientId, mediaType, imageUrl?, videoUrl?, imageUrls?, caption }
 *
 * Multi-tenancy: usa o token da conta vinculada AO PRÓPRIO clientId.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { queryOne } = require('../../../infra/db');
const { getInstagramAccount } = require('../../../models/instagram.model');
const { createNotification } = require('../../../models/clientForm');
const meta = require('../../../infra/api/meta');

const VALID_TYPES = ['IMAGE', 'REELS', 'CAROUSEL', 'STORIES'];
const MAX_CAPTION_LENGTH = 2200;
const MAX_CAROUSEL_ITEMS = 10;

function isValidUrl(s) {
  if (typeof s !== 'string' || s.length === 0 || s.length > 2048) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST' });
  }

  const {
    clientId,
    mediaType = 'IMAGE',
    imageUrl,
    videoUrl,
    imageUrls = [],
    caption,
  } = req.body || {};

  // ── Validação backend ──
  const errors = [];
  if (!clientId || typeof clientId !== 'string') errors.push('clientId obrigatório');
  if (!VALID_TYPES.includes(mediaType)) errors.push('mediaType inválido');
  if (caption !== undefined && caption !== null) {
    if (typeof caption !== 'string') errors.push('caption deve ser string');
    else if (caption.length > MAX_CAPTION_LENGTH) errors.push(`caption excede ${MAX_CAPTION_LENGTH} caracteres`);
  }
  if (imageUrl !== undefined && imageUrl !== '' && !isValidUrl(imageUrl)) errors.push('imageUrl inválida');
  if (videoUrl !== undefined && videoUrl !== '' && !isValidUrl(videoUrl)) errors.push('videoUrl inválida');
  if (Array.isArray(imageUrls)) {
    if (imageUrls.length > MAX_CAROUSEL_ITEMS) errors.push(`máximo ${MAX_CAROUSEL_ITEMS} itens`);
    for (const u of imageUrls) {
      if (!isValidUrl(u)) { errors.push('alguma imageUrls é inválida'); break; }
    }
  }
  if (errors.length > 0) {
    return res.status(400).json({ success: false, error: errors.join('; ') });
  }

  console.log('[INFO][API:publish-now]', { clientId, mediaType });

  try {
    const tenantId = await resolveTenantId(req);
    const account = await getInstagramAccount(tenantId, clientId);

    if (!account) {
      return res.status(404).json({
        success: false,
        error: 'Cliente não tem Instagram conectado',
      });
    }

    let containerId;

    if (mediaType === 'IMAGE') {
      const url = imageUrl || imageUrls[0];
      if (!url) return res.status(400).json({ success: false, error: 'imageUrl obrigatório' });
      containerId = await meta.createMediaContainer(account.igUserId, account.accessToken, {
        mediaType: 'IMAGE',
        imageUrl: url,
        caption,
      });
    } else if (mediaType === 'REELS') {
      if (!videoUrl) return res.status(400).json({ success: false, error: 'videoUrl obrigatório' });
      containerId = await meta.createMediaContainer(account.igUserId, account.accessToken, {
        mediaType: 'REELS',
        videoUrl,
        caption,
        shareToFeed: true,
      });
    } else if (mediaType === 'CAROUSEL') {
      const urls = imageUrls.length > 0 ? imageUrls : (imageUrl ? [imageUrl] : []);
      if (urls.length < 2) return res.status(400).json({ success: false, error: 'CAROUSEL exige 2+ imagens' });
      const childIds = [];
      for (const u of urls) {
        const cid = await meta.createMediaContainer(account.igUserId, account.accessToken, {
          mediaType: 'IMAGE',
          imageUrl: u,
          isCarouselItem: true,
        });
        childIds.push(cid);
      }
      containerId = await meta.createMediaContainer(account.igUserId, account.accessToken, {
        mediaType: 'CAROUSEL',
        children: childIds,
        caption,
      });
    } else if (mediaType === 'STORIES') {
      containerId = await meta.createMediaContainer(account.igUserId, account.accessToken, {
        mediaType: 'STORIES',
        imageUrl: imageUrl || imageUrls[0],
        videoUrl,
      });
    } else {
      return res.status(400).json({ success: false, error: `mediaType inválido: ${mediaType}` });
    }

    // Aguarda processamento do container
    const wait = await meta.waitForContainer(containerId, account.accessToken, 60000);
    if (!wait.ok) {
      return res.status(500).json({ success: false, error: wait.error });
    }

    // Publica
    const igMediaId = await meta.publishContainer(account.igUserId, account.accessToken, containerId);

    console.log('[SUCESSO][API:publish-now]', { igMediaId });

    // Notificação no sininho
    try {
      const client = await queryOne(
        `SELECT company_name FROM marketing_clients WHERE id = $1`,
        [clientId]
      );
      await createNotification(
        tenantId,
        'instagram_post_published',
        'Post publicado no Instagram',
        `${mediaType} de ${client?.company_name || 'cliente'} foi publicado em @${account.username || ''} (publicação imediata).`,
        clientId,
        { igMediaId, mediaType, source: 'publish_now' }
      );
    } catch (e) {
      console.warn('[WARN] notificação de publicação imediata falhou:', e.message);
    }

    return res.json({
      success: true,
      igMediaId,
      permalink: `https://www.instagram.com/p/${igMediaId}/`,
    });
  } catch (err) {
    console.error('[ERRO][API:publish-now]', { error: err.message });

    // Notificação de falha
    try {
      const tenantId = await resolveTenantId(req);
      await createNotification(
        tenantId,
        'instagram_post_failed',
        'Falha na publicação imediata',
        `Erro ao publicar agora: ${err.message.slice(0, 200)}`,
        clientId,
        { mediaType, error: err.message }
      );
    } catch {}

    return res.status(500).json({ success: false, error: err.message });
  }
}
