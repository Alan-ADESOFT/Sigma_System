/**
 * @fileoverview Handler real de POST /api/image/generate
 * @description Movido pra cá em sprint v1.1 pra evitar bug do Next dev:
 * o `pages/api/image/generate.js` era invalidado por HMR toda vez que o
 * worker rodava em paralelo (porque ambos compartilhavam imports). Aqui
 * está fora do `pages/`, então não é tracked pelo file watcher do Next
 * pra purga de páginas.
 *
 *   1. Auth + tenant
 *   2. Sanitiza prompt
 *   3. Valida referências (max 5, URLs internas, mode opcional)
 *   4. Carrega settings do tenant
 *   5. Verifica rate limit em 3 camadas + IP
 *   6. Carrega brandbook ativo (se clientId)
 *   7. Cria image_job (status='queued')
 *   8. Notifica worker via emitter
 *   9. Retorna 202 Accepted com jobId
 */

const { resolveTenantId } = require('../../infra/get-tenant-id');
const { requireAuth, isAdmin, handleAuthError } = require('../api-auth');
const { sanitizePrompt } = require('../../infra/promptSanitizer');
const { checkImageRateLimit } = require('../../infra/imageRateLimit');
const { checkRateLimit, logRateLimitEvent } = require('../../infra/rateLimit');
const { isInternalUploadUrl } = require('../url-validation');

const MODEL_TO_PROVIDER = {
  'gemini-3.1-flash-image-preview': 'gemini',
  'gemini-3-pro-image-preview':     'gemini',
  'fal-ai/flux-pro/kontext':        'fal',
  'fal-ai/flux-pro/kontext/max':    'fal',
  'gpt-image-2':                    'openai',
  'imagen-3.0-capability-001':      'vertex',
  'imagen-4.0-generate-001':        'vertex',
  'imagen-4.0-fast-generate-001':   'vertex',
  'imagen-4':       'vertex',
  'imagen-4-fast':  'vertex',
  'imagen-3':       'vertex',
  'gpt-image-1':    'openai',
  'flux-1.1-pro':   'fal',
  'nano-banana':    'gemini',
};
function providerForModel(model) { return MODEL_TO_PROVIDER[model] || null; }

const FORMAT_DEFAULTS = {
  square_post:  { aspect: '1:1',  width: 1024, height: 1024 },
  story:        { aspect: '9:16', width: 1080, height: 1920 },
  reels_cover:  { aspect: '9:16', width: 1080, height: 1920 },
  logo:         { aspect: '1:1',  width: 1024, height: 1024 },
  banner:       { aspect: '16:9', width: 1920, height: 1080 },
  thumbnail:    { aspect: '16:9', width: 1280, height: 720  },
  custom:       { aspect: '1:1',  width: 1024, height: 1024 },
};

const VALID_MODES = ['inspiration', 'character', 'scene'];

function extractIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

const IP_LIMIT_PER_MIN = 100;

async function imageGenerateHandler(req, res) {
  console.log('[INFO][API:image/generate] requisição recebida', { method: req.method });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const { getOrCreate: getSettings } = require('../../models/imageSettings.model');
  const { getActiveBrandbook } = require('../../models/brandbook.model');
  const { createJob } = require('../../models/imageJob.model');
  const { logAudit } = require('../../models/imageAudit.model');
  const { notifyNewJob } = require('../../infra/imageJobEmitter');

  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);

  const ip = extractIp(req);
  const ipKey = `${tenantId}:${ip}`;
  const ipRl = await checkRateLimit(ipKey, 'image_generate_ip', IP_LIMIT_PER_MIN, 1);
  if (!ipRl.ok) {
    res.setHeader('Retry-After', String(ipRl.resetIn || 60));
    res.setHeader('X-RateLimit-Limit', String(IP_LIMIT_PER_MIN));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + (ipRl.resetIn || 60)));
    await logAudit({
      tenantId, userId: user.id, req,
      action: 'rate_limit_hit',
      details: { layer: 'ip', ip, used: ipRl.count, limit: IP_LIMIT_PER_MIN },
    });
    return res.status(429).json({
      success: false,
      error: `Muitas requisições deste IP (${ipRl.count}/${IP_LIMIT_PER_MIN} no último minuto). Aguarde.`,
      retryAfter: ipRl.resetIn,
    });
  }
  logRateLimitEvent(ipKey, 'image_generate_ip', { ip, userId: user.id }).catch(() => {});

  const {
    rawDescription,
    clientId, folderId, templateId,
    format, aspectRatio,
    width, height,
    model,
    quality,
    observations, negativePrompt,
    referenceImageUrls,
    referenceImages,
    useBrandbook = true,
    parentJobId, stepIndex, stepPurpose,
    bypassCache,
  } = req.body || {};

  if (!rawDescription || typeof rawDescription !== 'string') {
    return res.status(400).json({ success: false, error: 'rawDescription obrigatório' });
  }
  if (!format || !FORMAT_DEFAULTS[format]) {
    return res.status(400).json({ success: false, error: `format inválido (use ${Object.keys(FORMAT_DEFAULTS).join('|')})` });
  }
  const isAuto = model === 'auto';
  if (!model || (!isAuto && !MODEL_TO_PROVIDER[model])) {
    return res.status(400).json({
      success: false,
      error: `model inválido (use 'auto' ou um dos: ${Object.keys(MODEL_TO_PROVIDER).join(', ')})`,
    });
  }

  const san = sanitizePrompt(rawDescription);
  if (!san.cleaned) {
    return res.status(400).json({ success: false, error: 'rawDescription vazia após sanitização' });
  }
  if (san.suspicious) {
    await logAudit({
      tenantId, userId: user.id, req,
      action: 'suspicious_prompt',
      details: { pattern: san.suspicious, model, format, clientId },
    });
  }

  let refMetadata = [];
  let refUrls = [];

  if (Array.isArray(referenceImages) && referenceImages.length > 0) {
    if (referenceImages.length > 5) {
      return res.status(400).json({ success: false, error: 'máximo 5 imagens de referência' });
    }
    for (const r of referenceImages) {
      if (!r || typeof r !== 'object') {
        return res.status(400).json({ success: false, error: 'referenceImages: cada item deve ter { url } (mode é opcional)' });
      }
      if (!isInternalUploadUrl(r.url)) {
        return res.status(400).json({ success: false, error: `URL de referência inválida: ${r.url}` });
      }
      // v1.2: mode é OPCIONAL. Se vier inválido ou ausente, deixa null pro
      // worker chamar refClassifier (Vision) e classificar automaticamente.
      const mode = VALID_MODES.includes(r.mode) ? r.mode : null;
      refMetadata.push(mode ? { url: r.url, mode } : { url: r.url });
      refUrls.push(r.url);
    }
  } else if (Array.isArray(referenceImageUrls) && referenceImageUrls.length > 0) {
    if (referenceImageUrls.length > 5) {
      return res.status(400).json({ success: false, error: 'máximo 5 imagens de referência' });
    }
    for (const url of referenceImageUrls) {
      if (!isInternalUploadUrl(url)) {
        return res.status(400).json({ success: false, error: `URL de referência inválida: ${url}` });
      }
      refUrls.push(url);
      refMetadata.push({ url, mode: 'inspiration' });
    }
  }

  const settings = await getSettings(tenantId);

  let brandbook = null;
  if (clientId && useBrandbook !== false) {
    brandbook = await getActiveBrandbook(clientId, tenantId);
  }
  if (settings.brandbook_required && clientId && !brandbook) {
    return res.status(400).json({
      success: false,
      error: 'Este tenant exige brandbook ativo no cliente antes de gerar imagens',
    });
  }

  const rl = await checkImageRateLimit({
    tenantId, userId: user.id, isAdmin: isAdmin(user),
    settings, req,
  });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60));
    res.setHeader('X-RateLimit-Limit', String(rl.limits?.daily || 0));
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining?.daily || 0));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + (rl.retryAfter || 0)));
    return res.status(429).json({
      success: false,
      error: rl.reason,
      retryAfter: rl.retryAfter,
      remaining: rl.remaining,
      used: rl.used,
      limits: rl.limits,
    });
  }

  const def = FORMAT_DEFAULTS[format];
  const resolvedAspect = aspectRatio || def.aspect;
  const resolvedW = Number(width) > 0 ? Number(width) : def.width;
  const resolvedH = Number(height) > 0 ? Number(height) : def.height;
  const provider = isAuto ? 'auto' : providerForModel(model);

  if (!isAuto && Array.isArray(settings.enabled_models) && !settings.enabled_models.includes(model)) {
    return res.status(400).json({
      success: false,
      error: `Modelo '${model}' não está habilitado nas configurações deste tenant`,
    });
  }

  let job;
  try {
    job = await createJob({
      tenantId,
      clientId: clientId || null,
      folderId: folderId || null,
      userId: user.id,
      format,
      aspectRatio: resolvedAspect,
      width: resolvedW,
      height: resolvedH,
      model,
      provider,
      brandbookId: brandbook?.id || null,
      brandbookUsed: !!brandbook,
      templateId: templateId || null,
      rawDescription: san.cleaned,
      observations: observations || null,
      negativePrompt: negativePrompt || null,
      referenceImageUrls: refUrls,
      referenceImageMetadata: refMetadata,
      parentJobId: parentJobId || null,
      stepIndex: typeof stepIndex === 'number' ? stepIndex : 0,
      stepPurpose: stepPurpose || null,
      bypassCache: !!bypassCache,
    });
  } catch (err) {
    console.error('[ERRO][API:image/generate] falha ao criar job', { error: err.message });
    return res.status(500).json({ success: false, error: 'Falha ao enfileirar geração' });
  }

  console.log('[SUCESSO][API:image/generate] job enfileirado', {
    jobId: job.id, tenantId, userId: user.id,
    clientId, model, provider, format,
    refs: refMetadata.length,
    modes: refMetadata.reduce((acc, r) => { acc[r.mode] = (acc[r.mode] || 0) + 1; return acc; }, {}),
  });

  try { notifyNewJob(job.id); } catch {}

  res.setHeader('X-RateLimit-Limit', String(rl.limits?.daily || 0));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, (rl.remaining?.daily || 0) - 1)));

  return res.status(202).json({
    success: true,
    data: {
      jobId: job.id,
      status: job.status,
      message: 'Sua imagem está sendo gerada',
    },
    rateLimit: {
      remaining: rl.remaining,
      used:      rl.used,
      limits:    rl.limits,
    },
  });
}

module.exports = { imageGenerateHandler };
module.exports.default = imageGenerateHandler;
