/**
 * @fileoverview Provider gpt-image-1 via OpenAI Images API
 * @description Endpoint: POST /v1/images/generations
 * Auth: Bearer com chave do tenant (decriptada) ou fallback OPENAI_API_KEY.
 *
 * Tamanhos aceitos: 1024x1024 | 1024x1536 | 1536x1024 (auto-mapeado).
 * Quality: low | medium | high (afeta custo).
 */

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

/**
 * Mapeia (width, height) → size string aceito pelo OpenAI.
 */
function mapSize(width, height) {
  const w = width || 1024;
  const h = height || 1024;
  if (w === h) return '1024x1024';
  if (w > h) return '1536x1024';
  return '1024x1536';
}

/**
 * Resolve qualidade a partir das settings (default 'medium').
 */
function resolveQuality(settings) {
  const q = settings?.image_quality || 'medium';
  return ['low', 'medium', 'high'].includes(q) ? q : 'medium';
}

function getApiKey(settings) {
  const key = settings?.openai_api_key_decrypted || process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error('OpenAI: nenhuma API key disponível (tenant nem .env)');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return key;
}

/**
 * Gera imagem via gpt-image-1.
 * @param {object} params
 * @returns {Promise<{imageBuffer: Buffer, mimeType: string, metadata: object}>}
 */
async function generate(params) {
  const { model, prompt, width, height, settings } = params;
  const apiKey = getApiKey(settings);
  const size = mapSize(width, height);
  const quality = resolveQuality(settings);

  const body = {
    model: model || 'gpt-image-1',
    prompt,
    size,
    quality,
    n: 1,
    output_format: 'png',
  };

  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${resp.status}`;
    const err = new Error(`OpenAI Images: ${msg}`);
    if (resp.status === 429) err.code = 'RATE_LIMITED';
    else if (resp.status === 400 && /safety|policy|content/i.test(msg)) err.code = 'CONTENT_BLOCKED';
    else err.code = 'PROVIDER_ERROR';
    throw err;
  }

  const data = await resp.json();
  const item = data.data?.[0];
  if (!item?.b64_json) {
    const err = new Error('OpenAI Images: resposta sem b64_json');
    err.code = 'PROVIDER_ERROR';
    throw err;
  }

  return {
    imageBuffer: Buffer.from(item.b64_json, 'base64'),
    mimeType: 'image/png',
    metadata: {
      provider: 'openai',
      model: body.model,
      size,
      quality,
      revised_prompt: item.revised_prompt || null,
    },
  };
}

/**
 * Testa chave: tenta listar modelos (chamada barata, sem custo de geração).
 */
async function testKey(apiKey) {
  if (!apiKey) {
    const err = new Error('OpenAI: chave vazia');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  const resp = await fetch('https://api.openai.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    const err = new Error(`OpenAI: chave inválida (${resp.status}): ${txt.slice(0, 200)}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return true;
}

module.exports = { generate, testKey };
