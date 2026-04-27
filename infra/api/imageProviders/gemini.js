/**
 * @fileoverview Provider Gemini (Nano Banana 2) — image generation com
 * suporte a múltiplas imagens de referência nativamente.
 *
 * Sprint v1.1 — abril 2026:
 *   · Modelo default: gemini-3.1-flash-image-preview (Nano Banana 2)
 *   · Aceita até 14 imagens de referência via inlineData base64
 *   · Mantém consistência de até 4 personagens em multi-imagem
 *   · Suporta web search nativo (não exposto via UI nesta sprint)
 *
 * Endpoint:
 *   https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}
 *
 * Compat reversa: gemini-2.0-flash-preview-image-generation (Nano Banana 1)
 * ainda funciona — chamada cai no mesmo handler.
 */

const { loadInternalUpload, detectMime, err, mapHttpStatus } = require('./_helpers');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.1-flash-image-preview';

function getApiKey(settings) {
  const key = settings?.gemini_api_key_decrypted || process.env.GEMINI_API_KEY;
  if (!key) throw err('AUTHENTICATION_FAILED', 'Gemini: nenhuma API key disponível (tenant nem .env)');
  return key;
}

/**
 * Resolve o model ID definitivo (compat com IDs antigos).
 */
function resolveModelId(model) {
  if (!model) return DEFAULT_MODEL;
  if (model === 'nano-banana') return 'gemini-2.0-flash-preview-image-generation';
  return model;
}

async function generate(params) {
  const { prompt, imageInputs, settings, signal, aspectRatio } = params;
  const apiKey = getApiKey(settings);
  const modelId = resolveModelId(params.model);

  // Carrega buffers das imagens (até 14 — limite do Nano Banana 2).
  const imageParts = [];
  for (const img of (imageInputs || []).slice(0, 14)) {
    const buffer = img.buffer || await loadInternalUpload(img.url);
    if (!buffer) {
      console.warn('[WARN][Gemini] ref ignorada (não pude carregar)', { url: img.url });
      continue;
    }
    imageParts.push({
      inlineData: {
        mimeType: detectMime(buffer),
        data: buffer.toString('base64'),
      },
    });
  }

  // v1.2: aspect ratio nativo via imageConfig.aspectRatio (Gemini 2.5+/3.x).
  // Valores aceitos: '1:1','2:3','3:2','3:4','4:3','9:16','16:9','21:9'.
  // Antes da v1.2, só o prompt mencionava o aspect — o que era ignorado pelo
  // modelo, gerando imagens em aspect default mesmo com formato 'square_post'.
  const VALID_ASPECTS = new Set(['1:1','2:3','3:2','3:4','4:3','9:16','16:9','21:9']);
  const aspectForApi = VALID_ASPECTS.has(aspectRatio) ? aspectRatio : null;

  const url = `${BASE}/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{
      role: 'user',
      parts: [
        // Reforça aspect ratio no início do prompt (defesa em profundidade —
        // imageConfig é honrado mas alguns prompts longos com refs sobrescrevem).
        { text: aspectForApi
            ? `[ASPECT RATIO: ${aspectForApi}] ${prompt}`
            : prompt },
        ...imageParts,
      ],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      ...(aspectForApi ? { imageConfig: { aspectRatio: aspectForApi } } : {}),
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw err('TIMEOUT', 'Gemini: timeout');
    throw err('PROVIDER_UNAVAILABLE', `Gemini: falha de rede (${e.message})`);
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const code = mapHttpStatus(resp.status, txt);
    throw err(code, `Gemini: ${resp.status} ${txt.slice(0, 300)}`);
  }

  const data = await resp.json();
  const candidate = data.candidates?.[0];

  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw err('CONTENT_BLOCKED', `Gemini: geração bloqueada (${candidate.finishReason})`);
  }

  const parts = candidate?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData?.data);
  if (!imgPart) throw err('PROVIDER_ERROR', 'Gemini: resposta sem inlineData de imagem');

  return {
    imageBuffer: Buffer.from(imgPart.inlineData.data, 'base64'),
    mimeType: imgPart.inlineData.mimeType || 'image/png',
    metadata: {
      provider: 'gemini',
      model: modelId,
      modelVersion: data.modelVersion || null,
      finish_reason: candidate?.finishReason || null,
      refsUsed: imageParts.length,
      aspectRatioRequested: aspectRatio || null,
    },
  };
}

/**
 * Testa chave via listagem de modelos.
 */
async function testKey(apiKey) {
  if (!apiKey) throw err('INVALID_INPUT', 'Gemini: chave vazia');
  const resp = await fetch(`${BASE}?key=${encodeURIComponent(apiKey)}`);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw err('INVALID_INPUT', `Gemini: chave inválida (${resp.status}): ${txt.slice(0, 200)}`);
  }
  return true;
}

module.exports = { generate, testKey };
