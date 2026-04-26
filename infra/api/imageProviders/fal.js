/**
 * @fileoverview Provider Flux 1.1 Pro via fal.ai
 * @description Endpoint síncrono: POST https://fal.run/fal-ai/flux-pro/v1.1
 * Auth: header `Authorization: Key {fal_key}` (não é Bearer).
 * Timeout local: 120s (Flux costuma responder em 5–25s).
 *
 * Suporta: prompt, image_size, seed, num_inference_steps, guidance_scale,
 *          enable_safety_checker.
 */

const ENDPOINT = 'https://fal.run/fal-ai/flux-pro/v1.1';
const TIMEOUT_MS = 120 * 1000;

/**
 * Mapeia aspect ratio do projeto → image_size aceito pelo Flux.
 * Flux aceita: 'square_hd' | 'portrait_16_9' | 'portrait_4_3' |
 *              'landscape_16_9' | 'landscape_4_3' | 'square'.
 */
function mapImageSize(aspectRatio) {
  switch (aspectRatio) {
    case '1:1':  return 'square_hd';
    case '9:16': return 'portrait_16_9';
    case '4:5':  return 'portrait_4_3';
    case '16:9': return 'landscape_16_9';
    case '3:2':  return 'landscape_4_3';
    default:     return 'square_hd';
  }
}

function getApiKey(settings) {
  const key = settings?.fal_api_key_decrypted || process.env.FAL_KEY;
  if (!key) {
    const err = new Error('Fal: nenhuma API key disponível (tenant nem .env)');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return key;
}

/**
 * Wrapper de fetch com timeout via AbortController.
 */
async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error(`Fal: timeout após ${ms}ms`);
      e.code = 'TIMEOUT';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Baixa a imagem retornada pelo Flux (URL externa do fal.ai CDN).
 */
async function downloadImage(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    const err = new Error(`Fal: falha ao baixar imagem (${resp.status})`);
    err.code = 'PROVIDER_ERROR';
    throw err;
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  const mime = resp.headers.get('content-type') || 'image/jpeg';
  return { buffer: buf, mimeType: mime };
}

/**
 * Gera imagem via Flux 1.1 Pro.
 * @param {object} params
 * @returns {Promise<{imageBuffer: Buffer, mimeType: string, metadata: object}>}
 */
async function generate(params) {
  const { prompt, aspectRatio, seed, settings } = params;
  const apiKey = getApiKey(settings);

  const body = {
    prompt,
    image_size: mapImageSize(aspectRatio),
    num_inference_steps: 28,
    guidance_scale: 3.5,
    num_images: 1,
    enable_safety_checker: true,
    output_format: 'jpeg',
    ...(typeof seed === 'number' ? { seed } : {}),
  };

  const resp = await fetchWithTimeout(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, TIMEOUT_MS);

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(`Fal: ${resp.status} ${txt.slice(0, 300)}`);
    if (resp.status === 429) err.code = 'RATE_LIMITED';
    else if (resp.status === 400 && /nsfw|safety|content/i.test(txt)) err.code = 'CONTENT_BLOCKED';
    else err.code = 'PROVIDER_ERROR';
    throw err;
  }

  const data = await resp.json();
  const img = data.images?.[0];
  if (!img?.url) {
    const err = new Error('Fal: resposta sem images[0].url');
    err.code = 'PROVIDER_ERROR';
    throw err;
  }
  if (data.has_nsfw_concepts?.[0]) {
    const err = new Error('Fal: imagem flagueada como NSFW');
    err.code = 'CONTENT_BLOCKED';
    throw err;
  }

  const { buffer, mimeType } = await downloadImage(img.url);

  return {
    imageBuffer: buffer,
    mimeType,
    metadata: {
      provider: 'fal',
      model: 'flux-1.1-pro',
      seed: data.seed ?? null,
      num_inference_steps: body.num_inference_steps,
      guidance_scale: body.guidance_scale,
      image_size: body.image_size,
      timings: data.timings || null,
    },
  };
}

/**
 * Testa chave via endpoint barato — fal.ai não tem /me, então fazemos
 * um HEAD/GET na raiz do queue. Como Fal não disponibiliza endpoint de
 * validação, validamos minimamente o formato e devolvemos true.
 * Em produção, prefira o test-key com 1 geração real curta.
 */
async function testKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
    const err = new Error('Fal: chave parece inválida');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  // Fal não expõe endpoint de validação puro — fazemos uma chamada
  // intencionalmente inválida (sem prompt) e tratamos 401 como chave ruim.
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}), // payload inválido de propósito
  });
  if (resp.status === 401 || resp.status === 403) {
    const err = new Error('Fal: chave rejeitada (401/403)');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  // 422/400 = chave OK, payload inválido (esperado)
  return true;
}

module.exports = { generate, testKey };
