/**
 * @fileoverview Provider Flux Kontext Pro (fal.ai) — especialista em
 * preservar pessoa/personagem exato da referência.
 *
 * Sprint v1.1 — abril 2026:
 *   · Modelo default: fal-ai/flux-pro/kontext
 *   · Aceita 1 image_url (URL pública obrigatória — não aceita base64)
 *   · Quando há ref `character`, prioriza-a; senão usa `scene`
 *   · Fallback graceful: se não houver image_input, cai pra Flux Pro 1.1 (text-to-image)
 *
 * Endpoint síncrono:
 *   POST https://fal.run/fal-ai/flux-pro/kontext
 *   POST https://fal.run/fal-ai/flux-pro/v1.1   (fallback text-to-image)
 *
 * Auth: header `Authorization: Key {fal_key}` (não é Bearer).
 *
 * Compat reversa: model='flux-1.1-pro' continua mapeando pra v1.1 puro.
 */

const { loadInternalUpload, ensurePublicUrl, err, mapHttpStatus } = require('./_helpers');

const ENDPOINT_KONTEXT = 'https://fal.run/fal-ai/flux-pro/kontext';
const ENDPOINT_V11     = 'https://fal.run/fal-ai/flux-pro/v1.1';

/**
 * Mapeia aspect ratio do projeto → image_size aceito pelo Flux.
 */
function mapImageSize(aspectRatio) {
  switch (aspectRatio) {
    case '1:1':  return 'square_hd';
    case '9:16': return 'portrait_16_9';
    case '4:5':  return 'portrait_4_3';
    case '16:9': return 'landscape_16_9';
    case '3:2':  return 'landscape_4_3';
    case '3:4':  return 'portrait_4_3';
    case '4:3':  return 'landscape_4_3';
    default:     return 'square_hd';
  }
}

function getApiKey(settings) {
  const key = settings?.fal_api_key_decrypted || process.env.FAL_KEY;
  if (!key) throw err('AUTHENTICATION_FAILED', 'Fal: nenhuma API key disponível (tenant nem .env)');
  return key;
}

/**
 * Resolve qual endpoint usar baseado no model + presença de imageInputs.
 */
function pickEndpoint(model, hasImageInput) {
  // Compat reversa: flux-1.1-pro sempre vai pro v1.1 (text-to-image puro).
  if (model === 'flux-1.1-pro') return ENDPOINT_V11;
  // Kontext + tem ref → kontext endpoint
  if (hasImageInput) return ENDPOINT_KONTEXT;
  // Kontext sem ref → fallback v1.1 puro (kontext exige image_url)
  return ENDPOINT_V11;
}

/**
 * Baixa imagem do CDN do fal pra salvar localmente.
 */
async function downloadImage(url, signal) {
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw err('PROVIDER_ERROR', `Fal: falha ao baixar imagem (${resp.status})`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const mime = resp.headers.get('content-type') || 'image/jpeg';
  return { buffer: buf, mimeType: mime };
}

async function generate(params) {
  const { prompt, imageInputs, settings, signal, aspectRatio, model, seed } = params;
  const apiKey = getApiKey(settings);

  // Resolve image_url priorizando character > scene > primeira ref disponível.
  let imageUrl = null;
  let usedImageInput = false;

  if (Array.isArray(imageInputs) && imageInputs.length > 0) {
    const charImg = imageInputs.find(i => i.role === 'character');
    const sceneImg = imageInputs.find(i => i.role === 'scene');
    const chosen = charImg || sceneImg || imageInputs[0];

    // Tenta resolver URL pública. Em dev/local sem NEXT_PUBLIC_BASE_URL HTTPS
    // público, faz upload temporário pro storage do fal.
    imageUrl = await ensurePublicUrl(chosen.url, { falApiKey: apiKey });
    if (imageUrl) usedImageInput = true;
    else console.warn('[WARN][Fal] não pude resolver URL pública; caindo pra text-to-image puro', { url: chosen.url });
  }

  const endpoint = pickEndpoint(model, usedImageInput);

  const body = {
    prompt,
    ...(usedImageInput && endpoint === ENDPOINT_KONTEXT ? { image_url: imageUrl } : {}),
    image_size: mapImageSize(aspectRatio),
    num_inference_steps: 28,
    guidance_scale: 3.5,
    num_images: 1,
    enable_safety_checker: true,
    output_format: 'jpeg',
    ...(typeof seed === 'number' ? { seed } : {}),
  };

  let resp;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw err('TIMEOUT', 'Fal: timeout');
    throw err('PROVIDER_UNAVAILABLE', `Fal: falha de rede (${e.message})`);
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const code = mapHttpStatus(resp.status, txt);
    throw err(code, `Fal: ${resp.status} ${txt.slice(0, 300)}`);
  }

  const data = await resp.json();
  const img = data.images?.[0];
  if (!img?.url) throw err('PROVIDER_ERROR', 'Fal: resposta sem images[0].url');
  if (data.has_nsfw_concepts?.[0]) throw err('CONTENT_BLOCKED', 'Fal: imagem flagueada como NSFW');

  const { buffer, mimeType } = await downloadImage(img.url, signal);

  return {
    imageBuffer: buffer,
    mimeType,
    metadata: {
      provider: 'fal',
      model: endpoint === ENDPOINT_KONTEXT ? 'fal-ai/flux-pro/kontext' : 'fal-ai/flux-pro/v1.1',
      usedImageInput,
      seed: data.seed ?? null,
      num_inference_steps: body.num_inference_steps,
      guidance_scale: body.guidance_scale,
      image_size: body.image_size,
      timings: data.timings || null,
    },
  };
}

/**
 * Testa chave: chama o endpoint com payload inválido — 401/403 = chave ruim,
 * 422/400 = chave OK.
 */
async function testKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
    throw err('INVALID_INPUT', 'Fal: chave parece inválida');
  }
  const resp = await fetch(ENDPOINT_V11, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (resp.status === 401 || resp.status === 403) {
    throw err('AUTHENTICATION_FAILED', 'Fal: chave rejeitada (401/403)');
  }
  return true;
}

module.exports = { generate, testKey };
