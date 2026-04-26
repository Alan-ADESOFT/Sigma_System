/**
 * @fileoverview Provider Nano Banana via Gemini API REST
 * @description Endpoint:
 *   https://generativelanguage.googleapis.com/v1beta/models/
 *   gemini-2.0-flash-preview-image-generation:generateContent?key={api_key}
 *
 * Auth via query param `?key=`. Mais barato dos 4 providers.
 * Não suporta seed determinístico nem negative_prompt.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.0-flash-preview-image-generation';

function getApiKey(settings) {
  const key = settings?.gemini_api_key_decrypted || process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('Gemini: nenhuma API key disponível (tenant nem .env)');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return key;
}

/**
 * Gera imagem via Nano Banana (Gemini Image Generation).
 * @param {object} params
 * @returns {Promise<{imageBuffer: Buffer, mimeType: string, metadata: object}>}
 */
async function generate(params) {
  const { model, prompt, settings } = params;
  const apiKey = getApiKey(settings);
  const modelId = model && model !== 'nano-banana' ? model : DEFAULT_MODEL;
  const url = `${BASE}/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(`Gemini: ${resp.status} ${txt.slice(0, 300)}`);
    if (resp.status === 429) err.code = 'RATE_LIMITED';
    else if (resp.status === 400 && /safety|policy|block/i.test(txt)) err.code = 'CONTENT_BLOCKED';
    else err.code = 'PROVIDER_ERROR';
    throw err;
  }

  const data = await resp.json();
  const candidate = data.candidates?.[0];

  // Caso de bloqueio: candidate.finishReason === 'SAFETY' ou 'RECITATION'
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    const err = new Error(`Gemini: geração bloqueada (${candidate.finishReason})`);
    err.code = 'CONTENT_BLOCKED';
    throw err;
  }

  // A imagem vem como inlineData dentro das parts
  const parts = candidate?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.data);
  if (!imgPart) {
    const err = new Error('Gemini: resposta sem inlineData de imagem');
    err.code = 'PROVIDER_ERROR';
    throw err;
  }

  return {
    imageBuffer: Buffer.from(imgPart.inlineData.data, 'base64'),
    mimeType: imgPart.inlineData.mimeType || 'image/png',
    metadata: {
      provider: 'gemini',
      model: modelId,
      finish_reason: candidate?.finishReason || null,
      safety_ratings: candidate?.safetyRatings || null,
    },
  };
}

/**
 * Testa chave via listagem de modelos do Gemini.
 */
async function testKey(apiKey) {
  if (!apiKey) {
    const err = new Error('Gemini: chave vazia');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  const resp = await fetch(`${BASE}?key=${encodeURIComponent(apiKey)}`);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(`Gemini: chave inválida (${resp.status}): ${txt.slice(0, 200)}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return true;
}

module.exports = { generate, testKey };
