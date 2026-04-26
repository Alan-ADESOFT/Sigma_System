/**
 * @fileoverview Roteador unificado de geração de imagem
 * @description Despacha a chamada para o provider correto (vertex, openai,
 * fal, gemini) e padroniza erros via Error.code.
 *
 * Códigos de erro conhecidos (sempre setados em Error.code):
 *   · CONTENT_BLOCKED  — moderação do provider rejeitou o prompt
 *   · PROVIDER_ERROR   — falha genérica do provider (HTTP 5xx, etc)
 *   · TIMEOUT          — passou do timeout local (default 120s)
 *   · INVALID_INPUT    — params inválidos antes de bater na API externa
 *   · RATE_LIMITED     — provider retornou 429
 */

const vertex = require('./vertex');
const openai = require('./openai');
const fal = require('./fal');
const gemini = require('./gemini');

const PROVIDERS = { vertex, openai, fal, gemini };

/**
 * @typedef {Object} GenerateImageParams
 * @property {'vertex'|'openai'|'fal'|'gemini'} provider
 * @property {string} model              - Model ID (imagen-4, gpt-image-1, ...)
 * @property {string} prompt             - Prompt otimizado
 * @property {string} [negativePrompt]
 * @property {number} [width=1024]
 * @property {number} [height=1024]
 * @property {string} [aspectRatio='1:1']
 * @property {Array<string>} [referenceImages] - URLs internas das refs
 * @property {number} [seed]             - Seed determinístico (quando suportado)
 * @property {object} settings           - Linha completa de image_settings
 *                                          (com chaves DECRIPTOGRAFADAS pelo caller)
 */

/**
 * @typedef {Object} GenerateImageResult
 * @property {Buffer} imageBuffer
 * @property {string} mimeType
 * @property {object} metadata           - { seed, model_version, provider, ... }
 */

/**
 * Despacha para o provider apropriado.
 * @param {GenerateImageParams} params
 * @returns {Promise<GenerateImageResult>}
 */
async function generateImage(params) {
  const { provider, model } = params;
  if (!provider) {
    const err = new Error('provider obrigatório');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  if (!model) {
    const err = new Error('model obrigatório');
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
  });

  const t0 = Date.now();
  try {
    const result = await impl.generate(params);
    console.log('[SUCESSO][ImageProvider:Router] Imagem gerada', {
      provider, model, ms: Date.now() - t0,
      bytes: result.imageBuffer?.length || 0,
    });
    return result;
  } catch (err) {
    // Garante que o caller sempre recebe Error.code preenchido
    if (!err.code) err.code = 'PROVIDER_ERROR';
    console.error('[ERRO][ImageProvider:Router] Falha na geração', {
      provider, model, code: err.code, message: err.message,
    });
    throw err;
  }
}

/**
 * Helper para o endpoint /settings/test-key — chama o provider com prompt
 * mínimo só para validar credenciais. Retorna boolean.
 *
 * @param {'vertex'|'openai'|'fal'|'gemini'} provider
 * @param {string} apiKey - Chave em texto puro (não criptografada)
 * @param {object} [extra] - Para Vertex: { project_id, location }
 * @returns {Promise<{ valid: boolean, error?: string }>}
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

module.exports = { generateImage, testApiKey };
