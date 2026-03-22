/**
 * @fileoverview Análise de imagens via GPT-4o Vision
 * @description Ponto único de integração com a API de visão da OpenAI.
 * Nunca chamar a API de visão diretamente em outros módulos.
 *
 * Suporta 3 formas de input:
 *   1. URL pública da imagem
 *   2. Base64 (data URL: "data:image/png;base64,...")
 *   3. Buffer Node.js (convertido internamente para base64)
 *
 * Variáveis necessárias no .env:
 *   OPENAI_API_KEY       — chave da OpenAI (já existente)
 *   AI_MODEL_VISION      — modelo a usar (padrão: gpt-4o)
 *   AI_VISION_MAX_SIZE_BYTES — limite de tamanho em bytes (padrão: 10MB)
 */

const OPENAI_BASE = 'https://api.openai.com/v1';

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Headers padrão para requisições à OpenAI
 * @returns {Object}
 */
function getHeaders() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY não configurada no .env');
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Converte imageInput para o formato esperado pela API (URL ou data URL base64)
 * @param {string|Buffer} imageInput - URL, data URL base64 ou Buffer
 * @returns {string} URL válida para a API
 */
function resolveImageUrl(imageInput) {
  // Buffer → base64 data URL
  if (Buffer.isBuffer(imageInput)) {
    return `data:image/jpeg;base64,${imageInput.toString('base64')}`;
  }
  // Já é string (URL pública ou data URL base64)
  if (typeof imageInput === 'string') {
    return imageInput;
  }
  throw new Error('imageInput deve ser string (URL ou base64) ou Buffer');
}

/**
 * Calcula tamanho aproximado do input para validação
 * @param {string|Buffer} imageInput
 * @returns {number} Tamanho em bytes
 */
function estimateSize(imageInput) {
  if (Buffer.isBuffer(imageInput)) return imageInput.length;
  if (typeof imageInput === 'string' && imageInput.startsWith('data:')) {
    // Base64 data URL: tamanho real ≈ 75% do tamanho da string base64
    const base64Part = imageInput.split(',')[1] || '';
    return Math.floor(base64Part.length * 0.75);
  }
  return 0; // URL pública — tamanho desconhecido, API valida
}

/**
 * Valida tamanho da imagem contra o limite configurado
 * @param {string|Buffer} imageInput
 */
function validateSize(imageInput) {
  const maxSize = parseInt(process.env.AI_VISION_MAX_SIZE_BYTES) || 10485760; // 10MB
  const size = estimateSize(imageInput);
  if (size > 0 && size > maxSize) {
    throw new Error(
      `Imagem excede o limite de ${Math.round(maxSize / 1024 / 1024)}MB. ` +
      `Tamanho: ${Math.round(size / 1024 / 1024)}MB. ` +
      `Reduza a resolução ou comprima a imagem antes de enviar.`
    );
  }
}

// ─── Funções públicas ────────────────────────────────────────────────────────

/**
 * Analisa uma imagem via GPT-4o Vision
 * @param {string|Buffer} imageInput - URL pública, data URL base64, ou Buffer
 * @param {string} instructions - O que o agente deve extrair/analisar
 * @param {{ maxTokens?: number, detail?: 'low'|'high'|'auto' }} [options={}]
 * @returns {Promise<{ analysis: string, modelUsed: string, tokens: number }>}
 */
async function analyzeImage(imageInput, instructions, options = {}) {
  const model = process.env.AI_MODEL_VISION || 'gpt-4o';
  console.log('[INFO][Vision] Iniciando análise de imagem', { model, detail: options.detail || 'high' });

  validateSize(imageInput);
  const imageUrl = resolveImageUrl(imageInput);

  try {
    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: instructions },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: options.detail || 'high',
              },
            },
          ],
        }],
        max_tokens: options.maxTokens || 1000,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const status = response.status;
      // Erro 400 = imagem inválida — retorna análise vazia sem quebrar fluxo
      if (status === 400) {
        console.error('[ERRO][Vision] Imagem inválida (400)', { message: err?.error?.message });
        return { analysis: '', modelUsed: model, tokens: 0 };
      }
      throw new Error(`OpenAI Vision Error ${status}: ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;

    console.log('[SUCESSO][Vision] Análise concluída', { model, analysisLength: analysis.length, tokens });
    return { analysis, modelUsed: model, tokens };

  } catch (err) {
    console.error('[ERRO][Vision] Falha na análise', { error: err.message });
    throw err;
  }
}

/**
 * Analisa múltiplas imagens em uma única chamada (até 10)
 * @param {Array<string|Buffer>} imageInputs - Array de URLs, data URLs ou Buffers
 * @param {string} instructions - Instruções para análise
 * @param {{ maxTokens?: number, detail?: 'low'|'high'|'auto' }} [options={}]
 * @returns {Promise<{ analysis: string, modelUsed: string, tokens: number }>}
 */
async function analyzeMultipleImages(imageInputs, instructions, options = {}) {
  if (!imageInputs?.length) {
    return { analysis: '', modelUsed: '', tokens: 0 };
  }

  if (imageInputs.length > 10) {
    console.warn('[WARNING][Vision] Limite de 10 imagens excedido, usando apenas as 10 primeiras');
    imageInputs = imageInputs.slice(0, 10);
  }

  const model = process.env.AI_MODEL_VISION || 'gpt-4o';
  console.log('[INFO][Vision] Iniciando análise de múltiplas imagens', { model, count: imageInputs.length });

  // Valida tamanho de cada imagem
  imageInputs.forEach((img, i) => {
    try {
      validateSize(img);
    } catch (err) {
      throw new Error(`Imagem ${i + 1}: ${err.message}`);
    }
  });

  // Monta content array: texto + todas as imagens
  const content = [
    { type: 'text', text: instructions },
    ...imageInputs.map(img => ({
      type: 'image_url',
      image_url: {
        url: resolveImageUrl(img),
        detail: options.detail || 'high',
      },
    })),
  ];

  try {
    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        max_tokens: options.maxTokens || 1500,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const status = response.status;
      if (status === 400) {
        console.error('[ERRO][Vision] Imagens inválidas (400)', { message: err?.error?.message });
        return { analysis: '', modelUsed: model, tokens: 0 };
      }
      throw new Error(`OpenAI Vision Error ${status}: ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;

    console.log('[SUCESSO][Vision] Análise múltipla concluída', { model, count: imageInputs.length, analysisLength: analysis.length, tokens });
    return { analysis, modelUsed: model, tokens };

  } catch (err) {
    console.error('[ERRO][Vision] Falha na análise múltipla', { error: err.message });
    throw err;
  }
}

/**
 * Wrapper de alto nível para análise de logos de clientes
 * @param {string|Buffer} imageInput - Logo do cliente
 * @returns {Promise<{ analysis: string, modelUsed: string, tokens: number }>}
 */
async function extractLogoInfo(imageInput) {
  console.log('[INFO][Vision] Extraindo informações de logo');

  const instructions = `Analise esta logo e extraia:
1. Cores predominantes (com nome e aproximação HEX)
2. Tipografia: serifada, sem serifa, script, monospace?
3. Estilo visual: minimalista, corporativo, criativo, técnico, elegante?
4. Símbolo/ícone: tem? descreva brevemente
5. Sensação/emoção que transmite
6. Público percebido pela logo
7. Qualidade de produção: profissional, mediano, amador?
Seja objetivo e específico.`;

  return analyzeImage(imageInput, instructions, { detail: 'high' });
}

/**
 * Wrapper de alto nível para análise de criativos/anúncios
 * @param {string|Buffer} imageInput - Criativo ou anúncio
 * @returns {Promise<{ analysis: string, modelUsed: string, tokens: number }>}
 */
async function extractCreativeInfo(imageInput) {
  console.log('[INFO][Vision] Extraindo informações de criativo');

  const instructions = `Analise este criativo/anúncio e extraia:
1. Headline visível (texto principal em destaque)
2. Copy/texto secundário
3. CTA (chamada para ação) — botão ou frase de ação
4. Cores predominantes e paleta geral
5. Produto ou serviço mostrado
6. Público-alvo percebido
7. Formato: post feed, stories, banner, carrossel?
8. Estilo visual: profissional, casual, luxo, jovem, corporativo?
Seja objetivo e específico.`;

  return analyzeImage(imageInput, instructions, { detail: 'high' });
}

module.exports = {
  analyzeImage,
  analyzeMultipleImages,
  extractLogoInfo,
  extractCreativeInfo,
};
