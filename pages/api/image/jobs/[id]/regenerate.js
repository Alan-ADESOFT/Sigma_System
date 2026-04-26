/**
 * @fileoverview POST /api/image/jobs/:id/regenerate — re-roda um job
 * @description Cria um novo job copiando os parâmetros do original mas
 * passando por toda a validação/rate limit de novo. Útil quando o resultado
 * não satisfez ou queremos uma nova "tentativa" com seed diferente.
 */

const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const { requireAuth, isAdmin, handleAuthError } = require('../../../../../lib/api-auth');
const { getJobById, createJob } = require('../../../../../models/imageJob.model');
const { checkImageRateLimit } = require('../../../../../infra/imageRateLimit');
const { getOrCreate: getSettings } = require('../../../../../models/imageSettings.model');
const { notifyNewJob } = require('../../../../../infra/imageJobEmitter');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  let user;
  try {
    user = await requireAuth(req);
  } catch (err) {
    if (handleAuthError(res, err)) return;
    throw err;
  }
  const tenantId = await resolveTenantId(req);
  const { id } = req.query;

  const orig = await getJobById(id, tenantId);
  if (!orig) {
    return res.status(404).json({ success: false, error: 'Job original não encontrado' });
  }

  // Rate limit
  const settings = await getSettings(tenantId);
  const rl = await checkImageRateLimit({
    tenantId, userId: user.id, isAdmin: isAdmin(user), settings, req,
  });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60));
    return res.status(429).json({
      success: false, error: rl.reason,
      retryAfter: rl.retryAfter, remaining: rl.remaining,
    });
  }

  // Pega overrides do body (opcional)
  const { observations, model, format } = req.body || {};

  const refUrls = (() => {
    try {
      return Array.isArray(orig.reference_image_urls)
        ? orig.reference_image_urls
        : JSON.parse(orig.reference_image_urls || '[]');
    } catch { return []; }
  })();

  const newJob = await createJob({
    tenantId,
    clientId:    orig.client_id,
    folderId:    orig.folder_id,
    userId:      user.id, // o regenerator vira "dono" do novo job
    format:      format || orig.format,
    aspectRatio: orig.aspect_ratio,
    width:       orig.width,
    height:      orig.height,
    model:       model || orig.model,
    provider:    orig.provider, // worker ajusta se model mudar de provider
    brandbookId:   orig.brandbook_id,
    brandbookUsed: orig.brandbook_used,
    templateId:    orig.template_id,
    rawDescription: orig.raw_description,
    observations:   observations !== undefined ? observations : orig.observations,
    negativePrompt: orig.negative_prompt,
    referenceImageUrls: refUrls,
  });

  console.log('[INFO][API:image/regenerate] novo job criado', {
    originalId: id, newId: newJob.id, userId: user.id,
  });

  try { notifyNewJob(newJob.id); } catch {}

  return res.status(202).json({
    success: true,
    data: { jobId: newJob.id, originalJobId: id, status: newJob.status },
  });
}
