const { getScheduledPosts, updateContentStatus } = require('./content.model');
const path = require('path');
const fs = require('fs');

async function optimizeImageForMeta(localRelPath, tunnelUrl, targetWidth, targetHeight, suffix = '_opt') {
  try {
    const localAbsPath = path.join(process.cwd(), 'public', localRelPath);
    if (!fs.existsSync(localAbsPath)) return null;
    const stats = fs.statSync(localAbsPath);
    const isPng = localAbsPath.toLowerCase().endsWith('.png');
    if (stats.size <= 1024 * 1024 && !isPng) return null;
    const sharp = (await import('sharp')).default;
    const optimizedRelPath = localRelPath.replace(/\.[^.]+$/, `${suffix}.jpg`);
    const optimizedAbsPath = path.join(process.cwd(), 'public', optimizedRelPath);
    await sharp(localAbsPath)
      .resize(targetWidth, targetHeight, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92, mozjpeg: true })
      .toFile(optimizedAbsPath);
    const newSize = fs.statSync(optimizedAbsPath).size;
    return {
      optimizedTunnelUrl: `${tunnelUrl.replace(/\/$/, '')}${optimizedRelPath}`,
      originalSize: stats.size,
      newSize,
    };
  } catch {
    return null;
  }
}

let isRunning = false;
const CHECK_INTERVAL = 1 * 60 * 1000;

async function checkAndPublish() {
  if (isRunning) return;
  isRunning = true;

  try {
    // Busca posts agendados com JOIN na conta (ja traz o token)
    const pendingPosts = await getScheduledPosts();

    if (pendingPosts.length === 0) { isRunning = false; return; }

    console.log(`[Scheduler] ${pendingPosts.length} post(s) para publicar.`);

    // Agrupar por conta
    const postsByAccount = {};
    for (const post of pendingPosts) {
      const key = post.account_id || 'unknown';
      if (!postsByAccount[key]) postsByAccount[key] = [];
      postsByAccount[key].push(post);
    }

    await Promise.all(Object.keys(postsByAccount).map(async (accountKey) => {
      const accountPosts = postsByAccount[accountKey];

      for (const post of accountPosts) {
        try {
          const metaToken = post.access_token;
          if (!metaToken) {
            console.warn(`[Scheduler] Post "${post.title}" sem token Meta.`);
            await updateContentStatus(post.id, 'failed');
            continue;
          }

          const mediaArr = post.media_urls ? JSON.parse(post.media_urls) : [];
          if (mediaArr.length === 0) {
            await updateContentStatus(post.id, 'failed');
            continue;
          }

          // Montar legenda
          const titleText = post.title ? `${post.title}\n\n` : '';
          const descText = post.description ? `${post.description}\n\n` : '';
          let tagsText = '';
          try {
            const parsedTags = post.hashtags ? JSON.parse(post.hashtags) : [];
            if (Array.isArray(parsedTags) && parsedTags.length > 0) {
              tagsText = parsedTags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
            }
          } catch {}
          const caption = `${titleText}${descText}${tagsText}`.trim();

          const { publishImage, publishCarousel, publishReel, publishStory, getInstagramUserId } = require('./instagram-graph.service');
          const userId = await getInstagramUserId(metaToken);
          if (!userId) {
            await updateContentStatus(post.id, 'failed');
            continue;
          }

          // Tunnel para midias locais
          const tunnelUrl = process.env.TUNNEL_URL || null;
          const hasLocalMedia = mediaArr.some((u) => u.startsWith('/uploads/') || u.startsWith('/creatives/'));

          if (!tunnelUrl && hasLocalMedia) {
            console.warn(`[Scheduler] Tunnel nao disponivel. Proximo ciclo.`);
            continue;
          }

          let finalMediaUrls = mediaArr;
          if (tunnelUrl) {
            finalMediaUrls = mediaArr.map((u) =>
              (u.startsWith('/uploads/') || u.startsWith('/creatives/'))
                ? `${tunnelUrl.replace(/\/$/, '')}${u}` : u
            );
          }

          if (hasLocalMedia && tunnelUrl) {
            for (let i = 0; i < finalMediaUrls.length; i++) {
              const origUrl = mediaArr[i];
              const isLocal = origUrl?.startsWith('/uploads/') || origUrl?.startsWith('/creatives/');
              const isVid = finalMediaUrls[i]?.toLowerCase().match(/\.(mp4|mov|avi|wmv|m4v)$/i);
              if (!isLocal || isVid) continue;
              const w = 1080;
              const h = (post.type || 'post').toLowerCase() === 'story' ? 1920 : 1350;
              const result = await optimizeImageForMeta(origUrl, tunnelUrl, w, h, `_opt${i}`);
              if (result) finalMediaUrls[i] = result.optimizedTunnelUrl;
            }
          }

          let success = false;
          const normalizedType = (post.type || 'post').toLowerCase();

          if (normalizedType === 'story') {
            success = (await publishStory(metaToken, userId, finalMediaUrls[0])).success;
          } else if (finalMediaUrls.length > 1) {
            success = (await publishCarousel(metaToken, userId, finalMediaUrls, caption)).success;
          } else {
            const url = finalMediaUrls[0];
            const isVideo = url.match(/\.(mp4|mov|avi|wmv|m4v)$/i);
            if (normalizedType === 'reel' || isVideo) {
              success = (await publishReel(metaToken, userId, url, caption)).success;
            } else {
              success = (await publishImage(metaToken, userId, url, caption)).success;
            }
          }

          await updateContentStatus(post.id, success ? 'published' : 'failed');
          console.log(`[Scheduler] "${post.title}" → ${success ? 'publicado' : 'falha'}`);
        } catch (err) {
          console.error(`[Scheduler] Erro ${post.id}:`, err.message);
          await updateContentStatus(post.id, 'failed');
        }
      }
    }));
  } catch (err) {
    console.error(`[Scheduler] Erro Geral:`, err.message);
  } finally {
    isRunning = false;
  }
}

let schedulerInterval = null;

function startScheduler() {
  if (schedulerInterval) return;
  console.log(`[Scheduler] Iniciado (check a cada ${CHECK_INTERVAL / 60000}min)`);
  schedulerInterval = setInterval(checkAndPublish, CHECK_INTERVAL);
  checkAndPublish();
}

function stopScheduler() {
  if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
}

module.exports = { startScheduler, stopScheduler, checkAndPublish };
