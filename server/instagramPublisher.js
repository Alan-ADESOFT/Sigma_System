/**
 * server/instagramPublisher.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cron interno de publicação no Instagram.
 *
 * Roda continuamente a cada 10 minutos via setInterval (em dev e em prod
 * single-instance). Em produção multi-instância (Vercel), use o endpoint
 * /api/cron/instagram-publisher chamado pelo Vercel Cron — esse arquivo
 * NÃO deve rodar em paralelo com o cron externo (você precisa escolher um).
 *
 * TIMEZONE — POR QUE FUNCIONA INDEPENDENTE DO HORÁRIO DO SERVIDOR
 *   Postgres armazena `scheduled_at` em UTC (TIMESTAMPTZ).
 *   A comparação `scheduled_at <= now()` é UTC vs UTC, então é consistente.
 *   O frontend converte do horário local do navegador (BRT) pra UTC via
 *   `new Date(scheduledAt).toISOString()` antes de enviar.
 *   Conclusão: o cron interno roda a cada 10 min independente do TZ do host
 *   e processa qualquer post devido, em qualquer hora do dia ou da noite.
 *
 * MULTI-TENANCY
 *   Cada post usa o token da conta vinculada ao SEU PRÓPRIO cliente.
 *   NUNCA reutiliza token entre clientes — guarda explícita no loop.
 *
 * NOTIFICAÇÕES
 *   Cada publicação (sucesso ou falha) gera uma entrada em system_notifications
 *   pra aparecer no sininho do dashboard.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../infra/db');
const meta = require('../infra/api/meta');
const { createNotification } = require('../models/clientForm');

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos
let schedulerInterval = null;
let isRunning = false;

/**
 * Busca posts agendados que já passaram do horário e ainda não foram publicados.
 * JOIN com instagram_accounts pra trazer o token sem consultas extras.
 */
async function getDuePosts() {
  return query(
    `SELECT
       p.*,
       ia.id              AS acc_id,
       ia.ig_user_id      AS acc_ig_user_id,
       ia.access_token    AS acc_access_token,
       ia.tenant_id       AS acc_tenant_id,
       ia.client_id       AS acc_client_id,
       ia.username        AS acc_username,
       mc.company_name    AS client_name
     FROM instagram_scheduled_posts p
     LEFT JOIN instagram_accounts ia ON ia.client_id = p.client_id
     LEFT JOIN marketing_clients mc ON mc.id = p.client_id
     WHERE p.status = 'scheduled'
       AND p.scheduled_at <= now()
     ORDER BY p.scheduled_at ASC
     LIMIT 25`
  );
}

async function markStatus(id, status, extra = {}) {
  const fields = ['status = $1', 'updated_at = now()'];
  const params = [status];
  if (extra.errorMessage !== undefined) {
    params.push(extra.errorMessage);
    fields.push(`error_message = $${params.length}`);
  }
  if (extra.igMediaId !== undefined) {
    params.push(extra.igMediaId);
    fields.push(`ig_media_id = $${params.length}`);
  }
  if (extra.permalink !== undefined) {
    params.push(extra.permalink);
    fields.push(`permalink = $${params.length}`);
  }
  if (extra.publishedAt !== undefined) {
    params.push(extra.publishedAt);
    fields.push(`published_at = $${params.length}`);
  }
  params.push(id);
  await query(
    `UPDATE instagram_scheduled_posts SET ${fields.join(', ')} WHERE id = $${params.length}`,
    params
  );
}

/**
 * Publica um único post (já com token resolvido).
 * Multi-tenancy: NUNCA chamada com token de outro cliente.
 */
async function publishOne(post) {
  const { id, media_type: mediaType, image_urls: imageUrls, video_url: videoUrl, caption } = post;
  const igUserId = post.acc_ig_user_id;
  const accessToken = post.acc_access_token;

  if (!igUserId || !accessToken) {
    throw new Error('Cliente sem conta Instagram conectada');
  }

  // 1. Marca como publishing
  await markStatus(id, 'publishing');

  // 2. Cria container — depende do tipo
  let containerId;
  if (mediaType === 'IMAGE') {
    if (!imageUrls || imageUrls.length === 0) throw new Error('imageUrls vazio');
    containerId = await meta.createMediaContainer(igUserId, accessToken, {
      mediaType: 'IMAGE',
      imageUrl: imageUrls[0],
      caption,
    });
  } else if (mediaType === 'REELS') {
    if (!videoUrl) throw new Error('videoUrl obrigatório para REELS');
    containerId = await meta.createMediaContainer(igUserId, accessToken, {
      mediaType: 'REELS',
      videoUrl,
      caption,
      shareToFeed: true,
    });
  } else if (mediaType === 'CAROUSEL') {
    if (!imageUrls || imageUrls.length < 2) throw new Error('CAROUSEL exige 2+ imagens');
    const childIds = [];
    for (const url of imageUrls) {
      const childId = await meta.createMediaContainer(igUserId, accessToken, {
        mediaType: 'IMAGE',
        imageUrl: url,
        isCarouselItem: true,
      });
      childIds.push(childId);
    }
    containerId = await meta.createMediaContainer(igUserId, accessToken, {
      mediaType: 'CAROUSEL',
      children: childIds,
      caption,
    });
  } else if (mediaType === 'STORIES') {
    containerId = await meta.createMediaContainer(igUserId, accessToken, {
      mediaType: 'STORIES',
      imageUrl: imageUrls?.[0],
      videoUrl,
    });
  } else {
    throw new Error(`mediaType desconhecido: ${mediaType}`);
  }

  // 3. Aguarda processamento
  const wait = await meta.waitForContainer(containerId, accessToken, 60000);
  if (!wait.ok) throw new Error(wait.error || 'falha no processamento do container');

  // 4. Publica
  const igMediaId = await meta.publishContainer(igUserId, accessToken, containerId);

  // 5. Marca como publicado
  await markStatus(id, 'published', {
    igMediaId,
    publishedAt: new Date().toISOString(),
    errorMessage: null,
  });

  return igMediaId;
}

/**
 * Roda 1 ciclo: busca posts devidos e tenta publicar cada um.
 * Re-entrant safe — pula a execução se outro ciclo já está rodando.
 */
async function runPublisherCycle() {
  if (isRunning) {
    console.log('[INFO][InstagramPublisher] ciclo anterior ainda rodando, pulando');
    return { skipped: true };
  }
  isRunning = true;

  console.log('[INFO][InstagramPublisher] iniciando ciclo');

  const results = { ok: 0, failed: 0, skipped: 0 };

  try {
    const due = await getDuePosts();
    console.log('[INFO][InstagramPublisher] posts a publicar', { count: due.length });

    for (const post of due) {
      try {
        // Multi-tenancy guard
        if (post.acc_client_id && post.acc_client_id !== post.client_id) {
          console.error('[ERRO][InstagramPublisher] token cross-tenant detectado — bloqueando', {
            postClient: post.client_id,
            accClient: post.acc_client_id,
          });
          await markStatus(post.id, 'failed', { errorMessage: 'token inconsistente' });
          results.failed++;
          continue;
        }

        if (!post.acc_access_token) {
          console.warn('[WARN][InstagramPublisher] post sem token', { postId: post.id });
          await markStatus(post.id, 'failed', { errorMessage: 'cliente sem Instagram conectado' });

          // Notificação de falha
          try {
            await createNotification(
              post.tenant_id,
              'instagram_post_failed',
              'Falha ao publicar',
              `Post agendado pra ${post.client_name || 'cliente'} não foi publicado: cliente sem Instagram conectado.`,
              post.client_id,
              { postId: post.id, mediaType: post.media_type }
            );
          } catch {}
          results.skipped++;
          continue;
        }

        const igMediaId = await publishOne(post);
        console.log('[SUCESSO][InstagramPublisher] post publicado', { postId: post.id, igMediaId });

        // Notificação de sucesso
        try {
          await createNotification(
            post.acc_tenant_id,
            'instagram_post_published',
            'Post publicado no Instagram',
            `${post.media_type} de ${post.client_name || 'cliente'} foi publicado em @${post.acc_username || ''}.`,
            post.client_id,
            { postId: post.id, igMediaId, mediaType: post.media_type }
          );
        } catch (e) {
          console.warn('[WARN] notificação de sucesso falhou:', e.message);
        }
        results.ok++;
      } catch (err) {
        console.error('[ERRO][InstagramPublisher] falha ao publicar', {
          postId: post.id,
          error: err.message,
        });
        try {
          await markStatus(post.id, 'failed', { errorMessage: err.message });
        } catch {}

        // Notificação de falha
        try {
          await createNotification(
            post.acc_tenant_id || post.tenant_id,
            'instagram_post_failed',
            'Falha ao publicar no Instagram',
            `Post de ${post.client_name || 'cliente'} falhou: ${err.message.slice(0, 200)}`,
            post.client_id,
            { postId: post.id, mediaType: post.media_type, error: err.message }
          );
        } catch {}
        results.failed++;
      }
    }

    console.log('[INFO][InstagramPublisher] ciclo concluído', results);
    return results;
  } catch (err) {
    console.error('[ERRO][InstagramPublisher] erro geral', { error: err.message });
    return { ok: 0, failed: 0, error: err.message };
  } finally {
    isRunning = false;
  }
}

/**
 * Inicia o cron interno (chamado pelo instrumentation.js no boot do Next).
 * Idempotente — chamadas repetidas não criam intervals duplicados.
 */
function startInstagramPublisher() {
  if (schedulerInterval) {
    console.log('[INFO][InstagramPublisher] já estava rodando — ignorado');
    return;
  }
  console.log(`[INFO][InstagramPublisher] iniciado (intervalo: ${CHECK_INTERVAL_MS / 60000} min)`);

  // Roda imediatamente uma vez no boot, depois a cada N min
  runPublisherCycle().catch((err) =>
    console.error('[ERRO][InstagramPublisher] ciclo inicial falhou', { error: err.message })
  );

  schedulerInterval = setInterval(() => {
    runPublisherCycle().catch((err) =>
      console.error('[ERRO][InstagramPublisher] ciclo periódico falhou', { error: err.message })
    );
  }, CHECK_INTERVAL_MS);
}

function stopInstagramPublisher() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[INFO][InstagramPublisher] parado');
  }
}

module.exports = {
  runPublisherCycle,
  publishOne,
  startInstagramPublisher,
  stopInstagramPublisher,
  CHECK_INTERVAL_MS,
};
