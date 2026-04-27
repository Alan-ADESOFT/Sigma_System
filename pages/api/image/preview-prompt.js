/**
 * @fileoverview POST /api/image/preview-prompt
 * @description Mostra o prompt otimizado SEM criar image_job. Usado pelo
 * botão "Ver prompt antes de gerar" na UI.
 *
 * Sprint v1.1 — abril 2026.
 *
 * Roda o pipeline completo (Vision sobre refs + brandbook + smart/heur +
 * Prompt Engineer) e retorna o prompt final + decisão + custo estimado.
 *
 * Não persiste nada (exceto descrições de fixed refs no cache, que é benéfico).
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { requireAuth, handleAuthError } = require('../../../lib/api-auth');
const { sanitizePrompt } = require('../../../infra/promptSanitizer');
const { getOrCreate: getSettings } = require('../../../models/imageSettings.model');
const { getActiveBrandbook } = require('../../../models/brandbook.model');
const { describeReferencesByMode, describeFixedReference } = require('../../../models/agentes/imagecreator/referenceVision');
const { selectByHeuristic } = require('../../../models/agentes/imagecreator/heuristicSelector');
const { selectStrategy } = require('../../../models/agentes/imagecreator/smartSelector');
const { optimizePrompt } = require('../../../models/agentes/imagecreator/promptEngineer');
const { calculateCost, costLabel } = require('../../../models/agentes/imagecreator/costCalculator');
const { providerForModel } = require('../../../infra/api/imageProviders');
const { getMaxImageInputs } = require('../../../models/agentes/imagecreator/modelCapabilities');

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

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

  const {
    rawDescription, clientId,
    format, aspectRatio,
    model = 'auto',
    observations, negativePrompt,
    referenceImages,
    referenceImageUrls,
    useBrandbook = true,
  } = req.body || {};

  if (!rawDescription || typeof rawDescription !== 'string') {
    return res.status(400).json({ success: false, error: 'rawDescription obrigatório' });
  }
  const san = sanitizePrompt(rawDescription);
  if (!san.cleaned) {
    return res.status(400).json({ success: false, error: 'rawDescription vazia após sanitização' });
  }

  const settings = await getSettings(tenantId);
  let brandbook = null;
  if (clientId && useBrandbook !== false) {
    brandbook = await getActiveBrandbook(clientId, tenantId);
  }

  // Normaliza refs com mode
  const refs = (() => {
    if (Array.isArray(referenceImages)) {
      return referenceImages
        .filter(r => r && r.url && r.url.startsWith('/uploads/'))
        .map(r => ({
          url: r.url,
          mode: ['inspiration', 'character', 'scene'].includes(r.mode) ? r.mode : 'inspiration',
        }));
    }
    if (Array.isArray(referenceImageUrls)) {
      return referenceImageUrls
        .filter(u => typeof u === 'string' && u.startsWith('/uploads/'))
        .map(url => ({ url, mode: 'inspiration' }));
    }
    return [];
  })();

  // Vision (igual ao worker — pode ser custoso, mas o user pediu preview)
  let referenceDescriptionsByMode = { inspiration: [], character: [], scene: [] };
  if (refs.length > 0) {
    const result = await describeReferencesByMode({
      refs, tenantId, clientId,
    });
    referenceDescriptionsByMode = result.byMode;
  }

  // Fixed refs (pega cache se disponível)
  let fixedRefDescriptions = [];
  if (brandbook) {
    const cached = (() => {
      try {
        return Array.isArray(brandbook.fixed_references_descriptions)
          ? brandbook.fixed_references_descriptions
          : JSON.parse(brandbook.fixed_references_descriptions || '[]');
      } catch { return []; }
    })();
    if (cached.length > 0) fixedRefDescriptions = cached;
  }

  // Decisão de modelo
  let smartDecision = null;
  let chosenModel = model;
  if (model === 'auto') {
    if (settings.smart_mode_enabled) {
      try {
        smartDecision = await selectStrategy({
          rawDescription: san.cleaned, brandbook,
          format, refs, observations,
          enabledModels: settings.enabled_models || [],
          settings, tenantId, userId: user.id, clientId,
        });
      } catch {
        smartDecision = selectByHeuristic({
          rawDescription: san.cleaned, format, refs,
          enabledModels: settings.enabled_models || [],
        });
      }
    } else {
      smartDecision = selectByHeuristic({
        rawDescription: san.cleaned, format, refs,
        enabledModels: settings.enabled_models || [],
      });
    }
    chosenModel = smartDecision.primary_model;
  }

  // Imagem inputs (pra pro hint do prompt engineer)
  const maxImages = await getMaxImageInputs(chosenModel);
  const imageInputs = refs.slice(0, maxImages).map((r, i) => ({
    role: r.mode, referenceId: i + 1,
  }));

  // Prompt
  const optResult = await optimizePrompt({
    rawDescription: san.cleaned,
    brandbook,
    format,
    aspectRatio: aspectRatio || '1:1',
    model: chosenModel,
    observations: observations || null,
    negativePrompt: negativePrompt || null,
    referenceDescriptionsByMode,
    fixedBrandReferencesDescriptions: fixedRefDescriptions,
    smartDecision,
    imageInputs,
    tenantId, userId: user.id, clientId,
    jobId: 'preview',
  });

  const provider = providerForModel(chosenModel);
  const costEstimate = calculateCost({
    provider,
    model: chosenModel,
    width: 1024, height: 1024,
    tokensInput: optResult.tokensInput,
    tokensOutput: optResult.tokensOutput,
    llmModel: settings.prompt_engineer_model,
    quality: 'medium',
  });

  return res.json({
    success: true,
    data: {
      optimizedPrompt: optResult.prompt,
      hash: optResult.hash,
      fromCache: optResult.fromCache,
      tokens: { input: optResult.tokensInput, output: optResult.tokensOutput },
      modelChosen: chosenModel,
      provider,
      smartDecision,
      costEstimate,
      costLabel: costLabel(chosenModel),
      brandbookInjected: !!brandbook,
      fixedRefsCount: fixedRefDescriptions.length,
      refsByMode: {
        inspiration: referenceDescriptionsByMode.inspiration.length,
        character:   referenceDescriptionsByMode.character.length,
        scene:       referenceDescriptionsByMode.scene.length,
      },
    },
  });
}
