/**
 * @fileoverview Roteador unificado de geração de imagem
 * @description Despacha a chamada para o provider correto (vertex, openai,
 * fal, gemini) e padroniza erros via Error.code.
 *
 * Sprint v1.1 — abril 2026: nova interface unificada com `imageInputs`,
 * `referenceMode`, `quality`, `signal` (AbortController). Cada provider
 * implementa generate(params) e retorna { imageBuffer, mimeType, metadata }.
 *
 * Códigos de erro conhecidos (sempre setados em Error.code):
 *   · CONTENT_BLOCKED          — moderação do provider rejeitou
 *   · PROVIDER_ERROR           — falha genérica do provider
 *   · PROVIDER_UNAVAILABLE     — 5xx
 *   · TIMEOUT                  — passou do timeout (signal aborted)
 *   · INVALID_INPUT            — params inválidos
 *   · RATE_LIMITED             — provider retornou 429
 *   · AUTHENTICATION_FAILED    — 401/403
 *   · MODEL_UNAVAILABLE        — modelo não habilitado / deprecated
 *   · CONTENT_BLOCKED          — safety filter
 *   · IMAGE_INPUT_NOT_SUPPORTED — modelo não aceita imageInputs neste modo
 */

const vertex = require('./vertex');
const openai = require('./openai');
const fal = require('./fal');
const gemini = require('./gemini');

const PROVIDERS = { vertex, openai, fal, gemini };

// Mapeamento canônico model → provider (espelhado no worker e no generate.js)
const MODEL_TO_PROVIDER = {
  // Lineup v1.1
  'gemini-3.1-flash-image-preview': 'gemini',
  'gemini-3-pro-image-preview':     'gemini',
  'fal-ai/flux-pro/kontext':        'fal',
  'fal-ai/flux-pro/kontext/max':    'fal',
  'gpt-image-2':                    'openai',
  'imagen-3.0-capability-001':      'vertex',
  'imagen-4.0-generate-001':        'vertex',
  'imagen-4.0-fast-generate-001':   'vertex',
  // Compat reversa (jobs antigos no histórico)
  'imagen-4':       'vertex',
  'imagen-4-fast':  'vertex',
  'imagen-3':       'vertex',
  'gpt-image-1':    'openai',
  'flux-1.1-pro':   'fal',
  'nano-banana':    'gemini',
};

function providerForModel(model) {
  return MODEL_TO_PROVIDER[model] || null;
}

/**
 * @typedef {Object} ImageInput
 * @property {string} url - "/uploads/..." path interno
 * @property {Buffer} [buffer] - bytes pré-carregados (opcional)
 * @property {'character'|'scene'|'inspiration'} [role]
 * @property {number} [referenceId] - usado por Imagen 3 Capability
 * @property {string} [description] - útil pro Vertex subjectDescription
 * @property {string} [subjectType] - SUBJECT_TYPE_PERSON|PRODUCT|ANIMAL|DEFAULT
 */

/**
 * @typedef {Object} GenerateImageParams
 * @property {'vertex'|'openai'|'fal'|'gemini'} provider
 * @property {string} model
 * @property {string} prompt - Prompt otimizado
 * @property {string} [negativePrompt]
 * @property {number} [width=1024]
 * @property {number} [height=1024]
 * @property {string} [aspectRatio='1:1']
 * @property {Array<ImageInput>} [imageInputs]
 * @property {'text-only'|'image-edit'|'multi-image'} [referenceMode]
 * @property {'low'|'medium'|'high'|'auto'} [quality]
 * @property {number} [seed]
 * @property {object} settings - linha de image_settings com chaves DECRIPTOGRAFADAS
 * @property {AbortSignal} [signal] - timeout duro do worker
 */

/**
 * Despacha para o provider apropriado.
 * @param {GenerateImageParams} params
 */
async function generateImage(params) {
  const { provider: providerHint, model } = params;
  if (!model) {
    const err = new Error('model obrigatório');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  // Resolve provider — preferência: hint → MODEL_TO_PROVIDER → erro
  const provider = providerHint || providerForModel(model);
  if (!provider) {
    const err = new Error(`Não foi possível resolver provider pro modelo '${model}'`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  const impl = PROVIDERS[provider];
  if (!impl) {
    const err = new Error(`Provider desconhecido: ${provider}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }

  console.log('[INFO][ImageProvider:Router] Despachando geração', {
    provider, model,
    width: params.width, height: params.height,
    aspectRatio: params.aspectRatio,
    imageInputs: (params.imageInputs || []).length,
    referenceMode: params.referenceMode || 'text-only',
  });

  const t0 = Date.now();
  try {
    const result = await impl.generate({ ...params, provider });
    console.log('[SUCESSO][ImageProvider:Router] Imagem gerada', {
      provider, model, ms: Date.now() - t0,
      bytes: result.imageBuffer?.length || 0,
    });
    return result;
  } catch (err) {
    if (!err.code) err.code = 'PROVIDER_ERROR';
    console.error('[ERRO][ImageProvider:Router] Falha na geração', {
      provider, model, code: err.code, message: err.message,
    });
    throw err;
  }
}

/**
 * Helper para o endpoint /settings/test-key.
 */
async function testApiKey(provider, apiKey, extra = {}) {
  const impl = PROVIDERS[provider];
  if (!impl || typeof impl.testKey !== 'function') {
    return { valid: false, error: `Provider ${provider} não suporta teste de chave` };
  }
  try {
    await impl.testKey(apiKey, extra);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

module.exports = {
  generateImage,
  testApiKey,
  providerForModel,
  MODEL_TO_PROVIDER,
};
