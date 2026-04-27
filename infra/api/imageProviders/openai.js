/**
 * @fileoverview Provider GPT Image 2 (OpenAI Images API)
 * @description
 *   · Sem refs: POST /v1/images/generations (JSON)
 *   · Com refs: POST /v1/images/edits (multipart/form-data, image[] x N)
 *
 * Sprint v1.1 — abril 2026:
 *   · Modelo default: gpt-image-2
 *   · Aceita até 4 imagens em image[]
 *   · Suporta máscara opcional (não exposta na UI ainda)
 *   · Não tem `input_fidelity` (sempre roda em high automático)
 *
 * Compat reversa: model='gpt-image-1' continua funcionando, mesma API.
 */

// FormData/Blob são globais no Node 18+ — não precisa de pkg externo.
const { loadInternalUpload, err, mapHttpStatus } = require('./_helpers');

const ENDPOINT_GEN  = 'https://api.openai.com/v1/images/generations';
const ENDPOINT_EDIT = 'https://api.openai.com/v1/images/edits';

function getApiKey(settings) {
  const key = settings?.openai_api_key_decrypted || process.env.OPENAI_API_KEY;
  if (!key) throw err('AUTHENTICATION_FAILED', 'OpenAI: nenhuma API key disponível');
  return key;
}

/**
 * Mapeia aspectRatio → size aceito pela API.
 * GPT Image 2 aceita: '1024x1024', '1536x1024', '1024x1536', 'auto'.
 */
function mapSize(aspectRatio, width, height) {
  if (aspectRatio === '1:1') return '1024x1024';
  if (aspectRatio === '16:9' || aspectRatio === '3:2' || aspectRatio === '4:3') return '1536x1024';
  if (aspectRatio === '9:16' || aspectRatio === '4:5' || aspectRatio === '3:4') return '1024x1536';
  // Fallback por dimensões
  if (width && height) {
    if (width === height) return '1024x1024';
    return width > height ? '1536x1024' : '1024x1536';
  }
  return 'auto';
}

function resolveQuality(quality) {
  if (['low', 'medium', 'high', 'auto'].includes(quality)) return quality;
  return 'auto';
}

function resolveModelId(model) {
  if (!model) return 'gpt-image-2';
  return model;
}

async function generateFresh({ prompt, apiKey, signal, params }) {
  const body = {
    model: resolveModelId(params.model),
    prompt,
    size: mapSize(params.aspectRatio, params.width, params.height),
    quality: resolveQuality(params.quality),
    n: 1,
    output_format: 'png',
  };

  let resp;
  try {
    resp = await fetch(ENDPOINT_GEN, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw err('TIMEOUT', 'OpenAI: timeout');
    throw err('PROVIDER_UNAVAILABLE', `OpenAI: falha de rede (${e.message})`);
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${resp.status}`;
    const code = mapHttpStatus(resp.status, msg);
    throw err(code, `OpenAI Images: ${msg}`);
  }

  const data = await resp.json();
  const item = data.data?.[0];
  if (!item?.b64_json) throw err('PROVIDER_ERROR', 'OpenAI Images: resposta sem b64_json');

  return {
    imageBuffer: Buffer.from(item.b64_json, 'base64'),
    mimeType: 'image/png',
    metadata: {
      provider: 'openai',
      model: body.model,
      mode: 'fresh',
      size: body.size,
      quality: body.quality,
      revised_prompt: item.revised_prompt || null,
    },
  };
}

async function generateEdit({ prompt, apiKey, imageInputs, signal, params }) {
  // FormData global do Node 18+. fetch() seta Content-Type: multipart/form-data
  // com boundary automático — NÃO setar manualmente.
  const form = new FormData();
  form.append('model', resolveModelId(params.model));
  form.append('prompt', prompt);
  form.append('size', mapSize(params.aspectRatio, params.width, params.height));
  form.append('quality', resolveQuality(params.quality));
  form.append('n', '1');

  // Adiciona até 4 imagens em image[]
  let added = 0;
  for (const img of imageInputs.slice(0, 4)) {
    const buffer = img.buffer || await loadInternalUpload(img.url);
    if (!buffer) continue;
    // Buffer → Blob (Node 18+ Blob aceita Buffer/Uint8Array como source)
    const blob = new Blob([buffer], { type: 'image/png' });
    form.append('image[]', blob, `ref_${added}.png`);
    added++;
  }
  if (added === 0) {
    return generateFresh({ prompt, apiKey, signal, params });
  }

  let resp;
  try {
    resp = await fetch(ENDPOINT_EDIT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // NÃO setar Content-Type — fetch faz isso com boundary correto
      },
      body: form,
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw err('TIMEOUT', 'OpenAI: timeout');
    throw err('PROVIDER_UNAVAILABLE', `OpenAI: falha de rede (${e.message})`);
  }

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${resp.status}`;
    const code = mapHttpStatus(resp.status, msg);
    throw err(code, `OpenAI Edits: ${msg}`);
  }

  const data = await resp.json();
  const item = data.data?.[0];
  if (!item?.b64_json) throw err('PROVIDER_ERROR', 'OpenAI Edits: resposta sem b64_json');

  return {
    imageBuffer: Buffer.from(item.b64_json, 'base64'),
    mimeType: 'image/png',
    metadata: {
      provider: 'openai',
      model: resolveModelId(params.model),
      mode: 'edit',
      refsUsed: added,
      revised_prompt: item.revised_prompt || null,
    },
  };
}

async function generate(params) {
  const { prompt, imageInputs, settings, signal } = params;
  const apiKey = getApiKey(settings);

  if (Array.isArray(imageInputs) && imageInputs.length > 0) {
    return generateEdit({ prompt, apiKey, imageInputs, signal, params });
  }
  return generateFresh({ prompt, apiKey, signal, params });
}

/**
 * Testa chave via /v1/models.
 */
async function testKey(apiKey) {
  if (!apiKey) throw err('INVALID_INPUT', 'OpenAI: chave vazia');
  const resp = await fetch('https://api.openai.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw err('AUTHENTICATION_FAILED', `OpenAI: chave inválida (${resp.status}): ${txt.slice(0, 200)}`);
  }
  return true;
}

module.exports = { generate, testKey };
