/**
 * @fileoverview POST /api/image/generate — cria job de geração de imagem
 * @description
 *   1. Auth + tenant
 *   2. Sanitiza prompt
 *   3. Valida referências (max 5, URLs internas)
 *   4. Carrega settings do tenant
 *   5. Verifica rate limit em 3 camadas
 *   6. Carrega brandbook ativo (se clientId)
 *   7. Cria image_job (status='queued')
 *   8. Notifica worker via emitter
 *   9. Retorna 202 Accepted com jobId
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { requireAuth, isAdmin, handleAuthError } = require('../../../lib/api-auth');
const { sanitizePrompt } = require('../../../infra/promptSanitizer');
const { checkImageRateLimit } = require('../../../infra/imageRateLimit');
const { checkRateLimit, logRateLimitEvent } = require('../../../infra/rateLimit');
const { getOrCreate: getSettings } = require('../../../models/imageSettings.model');
const { getActiveBrandbook } = require('../../../models/brandbook.model');
const { createJob } = require('../../../models/imageJob.model');
const { logAudit } = require('../../../models/imageAudit.model');
const { notifyNewJob } = require('../../../infra/imageJobEmitter');

// Aspect ratio inferido do format (com fallback explícito do payload)
const FORMAT_DEFAULTS = {
  square_post:  { aspect: '1:1',  width: 1024, height: 1024 },
  story:        { aspect: '9:16', width: 1080, height: 1920 },
  reels_cover:  { aspect: '9:16', width: 1080, height: 1920 },
  logo:         { aspect: '1:1',  width: 1024, height: 1024 },
  banner:       { aspect: '16:9', width: 1920, height: 1080 },
  thumbnail:    { aspect: '16:9', width: 1280, height: 720  },
  custom:       { aspect: '1:1',  width: 1024, height: 1024 },
};

// Mapa: model amigável → provider
const MODEL_TO_PROVIDER = {
  'imagen-4':       'vertex',
  'imagen-4-fast':  'vertex',
  'imagen-3':       'vertex',
  'gpt-image-1':    'openai',
  'flux-1.1-pro':   'fal',
  'nano-banana':    'gemini',
};

// HARDENING (SSRF): aceita APENAS caminhos internos /uploads/. Rejeita
// explicitamente qualquer URL com esquema (http, https, ftp, file, data,
// blob...) para evitar SSRF caso a URL seja eventualmente baixada
// pelo backend (ex: futura feature de descrição via Vision).
function isInternalUploadUrl(url) {
  if (typeof url !== 'string') return false;
  if (!url.startsWith('/uploads/')) return false;
  if (url.includes('..')) return false;                  // path traversal
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;    // qualquer scheme
  if (url.includes('//')) return false;                  // protocol-relative
  if (url.includes('\0')) return false;                  // null byte
  return true;
}

// HARDENING: limite por IP (independente do user). Protege conta comprometida
// que poderia abusar de quota legítima fazendo burst de requests.
// Reusa rate_limit_log com action='image_generate_ip'.
function extractIp(req) {
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

const IP_LIMIT_PER_MIN = 100;

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
};

export default async function handler(req, res) {
  console.log('[INFO][API:image/generate] requisição recebida', {
    method: req.method,
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);

  // ── HARDENING: limite por IP antes do trabalho pesado ──────────────────────
  // 100 req/min por IP. Reusa rate_limit_log com action='image_generate_ip'.
  // Tenant id na chave evita que IPs compartilhados (escritório) bloqueiem
  // uns aos outros entre tenants.
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
  // Registra (best-effort, sem bloquear)
  logRateLimitEvent(ipKey, 'image_generate_ip', { ip, userId: user.id }).catch(() => {});

  // ── Body ──────────────────────────────────────────────────────────────────
  const {
    rawDescription,
    clientId, folderId, templateId,
    format, aspectRatio,
    width, height,
    model,
    observations, negativePrompt,
    referenceImageUrls,
    useBrandbook = true,
  } = req.body || {};

  if (!rawDescription || typeof rawDescription !== 'string') {
    return res.status(400).json({ success: false, error: 'rawDescription obrigatório' });
  }
  if (!format || !FORMAT_DEFAULTS[format]) {
    return res.status(400).json({ success: false, error: `format inválido (use ${Object.keys(FORMAT_DEFAULTS).join('|')})` });
  }
  if (!model || !MODEL_TO_PROVIDER[model]) {
    return res.status(400).json({ success: false, error: `model inválido (use ${Object.keys(MODEL_TO_PROVIDER).join('|')})` });
  }

  // ── Sanitização ───────────────────────────────────────────────────────────
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
    console.warn('[WARN][API:image/generate] padrão suspeito detectado (registrando, não bloqueando)', {
      userId: user.id, pattern: san.suspicious,
    });
  }

  // ── Validação de referências ──────────────────────────────────────────────
  let refs = [];
  if (Array.isArray(referenceImageUrls)) {
    if (referenceImageUrls.length > 5) {
      return res.status(400).json({ success: false, error: 'máximo 5 imagens de referência' });
    }
    for (const url of referenceImageUrls) {
      if (!isInternalUploadUrl(url)) {
        return res.status(400).json({ success: false, error: `URL de referência inválida (deve começar com /uploads/): ${url}` });
      }
      refs.push(url);
    }
  }

  // ── Settings + brandbook ──────────────────────────────────────────────────
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

  // ── Rate limit ────────────────────────────────────────────────────────────
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

  // ── Resolução de dimensões ────────────────────────────────────────────────
  const def = FORMAT_DEFAULTS[format];
  const resolvedAspect = aspectRatio || def.aspect;
  const resolvedW = Number(width) > 0 ? Number(width) : def.width;
  const resolvedH = Number(height) > 0 ? Number(height) : def.height;
  const provider = MODEL_TO_PROVIDER[model];

  if (!Array.isArray(settings.enabled_models) || !settings.enabled_models.includes(model)) {
    return res.status(400).json({
      success: false,
      error: `Modelo '${model}' não está habilitado nas configurações deste tenant`,
    });
  }

  // ── Cria job ──────────────────────────────────────────────────────────────
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
      referenceImageUrls: refs,
    });
  } catch (err) {
    console.error('[ERRO][API:image/generate] falha ao criar job', { error: err.message });
    return res.status(500).json({ success: false, error: 'Falha ao enfileirar geração' });
  }

  console.log('[SUCESSO][API:image/generate] job enfileirado', {
    jobId: job.id, tenantId, userId: user.id,
    clientId, model, provider, format,
  });

  // ── Notifica worker ───────────────────────────────────────────────────────
  try { notifyNewJob(job.id); } catch {}

  // Headers informativos pra cliente saber quanto resta
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
