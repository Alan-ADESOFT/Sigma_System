/**
 * @fileoverview POST /api/image/jobs/:id/edit — edita uma imagem gerada
 * @description Cria um novo job que usa a IMAGEM ANTERIOR como referência
 * de tipo `character` (pra preservar a composição) e adiciona o pedido
 * de mudança ao raw_description.
 *
 * Modelo escolhido: por padrão Flux Kontext Pro (especialista em preservar
 * composição) ou Nano Banana 2 (multi-imagem). User pode forçar via body.model.
 *
 *
 * Body:
 *   {
 *     editPrompt: "trocar fundo pra azul",   // obrigatório, descrição da mudança
 *     model: "fal-ai/flux-pro/kontext"        // opcional, default auto-escolha
 *   }
 */

const path = require('path');
const fs = require('fs').promises;
const { resolveTenantId } = require('../../../../../infra/get-tenant-id');
const { requireAuth, isAdmin, handleAuthError } = require('../../../../../lib/api-auth');
const { getJobById, createJob } = require('../../../../../models/imageJob.model');
const { checkImageRateLimit } = require('../../../../../infra/imageRateLimit');
const { getOrCreate: getSettings } = require('../../../../../models/imageSettings.model');
const { notifyNewJob } = require('../../../../../infra/imageJobEmitter');
const { providerForModel } = require('../../../../../infra/api/imageProviders');
const { isInternalUploadUrl } = require('../../../../../lib/url-validation');

const MAX_ADDITIONAL_REFS = 3;

// Modelos preferidos pra edição (em ordem). Worker escolhe o 1º que estiver
// no enabled_models do tenant.
// GPT Image 2 lidera (alta fidelidade + edit pontual). Flux Kontext
// continua segundo (preserva pessoa). Nano Banana 2 versátil.
const EDIT_PREFERRED_MODELS = [
  'gpt-image-2',                      // edição pontual com alta fidelidade
  'fal-ai/flux-pro/kontext',          // preserva pessoa/objeto
  'gemini-3.1-flash-image-preview',   // multi-imagem versátil
  'gpt-image-1',                      // legacy, fallback
];

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
  if (!orig.result_image_url) {
    return res.status(400).json({ success: false, error: 'Imagem original ainda não está pronta' });
  }

  const { editPrompt, model: requestedModel, additionalRefs } = req.body || {};
  if (!editPrompt || typeof editPrompt !== 'string' || !editPrompt.trim()) {
    return res.status(400).json({ success: false, error: 'editPrompt obrigatório (descreva a mudança)' });
  }

  // Refs adicionais que o user anexou no input de edit. Limite alinhado com
  // o cap do gpt-image-2 (4) menos a imagem original como base.
  const validatedAdditional = [];
  if (Array.isArray(additionalRefs)) {
    if (additionalRefs.length > MAX_ADDITIONAL_REFS) {
      return res.status(400).json({
        success: false,
        error: `máximo ${MAX_ADDITIONAL_REFS} imagens adicionais na edição`,
      });
    }
    for (const r of additionalRefs) {
      const url = typeof r === 'string' ? r : r?.url;
      if (!isInternalUploadUrl(url)) {
        return res.status(400).json({ success: false, error: `URL adicional inválida: ${url}` });
      }
      validatedAdditional.push({ url });
    }
  }

  // Verifica se o arquivo da imagem original existe
  if (!orig.result_image_url.startsWith('/uploads/')) {
    return res.status(400).json({ success: false, error: 'Imagem original em formato não suportado pra edição' });
  }
  const fullPath = path.join(process.cwd(), 'public', orig.result_image_url);
  try {
    await fs.access(fullPath);
  } catch {
    return res.status(404).json({ success: false, error: 'Arquivo da imagem original não encontrado em disco' });
  }

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

  // Resolve modelo: requested > primeiro preferido habilitado > fallback original
  const enabled = Array.isArray(settings.enabled_models) ? settings.enabled_models : [];
  let chosenModel = requestedModel;
  if (!chosenModel || !enabled.includes(chosenModel)) {
    chosenModel = EDIT_PREFERRED_MODELS.find(m => enabled.includes(m));
  }
  if (!chosenModel) {
    // Último recurso: 'auto' deixa heurística decidir no worker
    chosenModel = 'auto';
  }
  const chosenProvider = chosenModel === 'auto' ? 'auto' : (providerForModel(chosenModel) || 'auto');

  // Refs do novo job: imagem original (1ª, com mode='character' pra garantir
  // preservação de composição) + adicionais do user (sem mode — refClassifier
  // vai classificar) + refs originais com modes já estabelecidos. O classifier
  // pula refs que já têm mode válido.
  const origMetadata = (() => {
    try {
      const meta = Array.isArray(orig.reference_image_metadata)
        ? orig.reference_image_metadata
        : JSON.parse(orig.reference_image_metadata || '[]');
      return Array.isArray(meta) ? meta : [];
    } catch { return []; }
  })();
  const refMetadata = [
    { url: orig.result_image_url, mode: 'character' },
    ...validatedAdditional,
    ...origMetadata.slice(0, Math.max(0, 4 - validatedAdditional.length)),
  ].slice(0, 5);
  const refUrls = refMetadata.map(r => r.url);

  // rawDescription combina o original + edit
  const editedRaw = `${orig.raw_description}\n\nMUDANÇAS A APLICAR (preserve o resto):\n${editPrompt.trim()}`;

  const newJob = await createJob({
    tenantId,
    clientId:    orig.client_id,
    folderId:    orig.folder_id,
    userId:      user.id,
    format:      orig.format,
    aspectRatio: orig.aspect_ratio,
    width:       orig.width,
    height:      orig.height,
    model:       chosenModel,
    provider:    chosenProvider,
    brandbookId:   orig.brandbook_id,
    brandbookUsed: orig.brandbook_used,
    templateId:    orig.template_id,
    rawDescription: editedRaw,
    observations:   orig.observations,
    negativePrompt: orig.negative_prompt,
    referenceImageUrls: refUrls,
    referenceImageMetadata: refMetadata,
    parentJobId: orig.id,
    stepPurpose: 'edit',
    bypassCache: true,  // edição sempre fresca
  });

  console.log('[INFO][API:image/edit] novo job de edição criado', {
    originalId: id, newId: newJob.id, model: chosenModel,
    editPromptLength: editPrompt.length,
  });

  try { notifyNewJob(newJob.id); } catch {}

  return res.status(202).json({
    success: true,
    data: {
      jobId: newJob.id,
      originalJobId: id,
      status: newJob.status,
      model: chosenModel,
      message: 'Edição em fila — usando a imagem original como referência',
    },
  });
}
