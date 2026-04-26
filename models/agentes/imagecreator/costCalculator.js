/**
 * @fileoverview Calculadora de custo USD do Gerador de Imagem
 * @description Tabela hardcoded de preços (atualizar manualmente quando os
 * provedores mudarem). Soma custo da imagem + custo do LLM (Prompt Engineer
 * + Brandbook Extractor) quando aplicável.
 *
 * Última atualização: abril 2026.
 */

// ── Preços de imagem (USD por imagem 1024x1024 ou equivalente) ──────────────
// Para tamanhos diferentes, escalamos proporcionalmente por megapixel.
const IMAGE_PRICES = {
  // provider key (do imageProviders/index)
  vertex: {
    'imagen-4':              0.04,
    'imagen-4-fast':         0.02,
    'imagen-3':              0.04,
  },
  openai: {
    // Variante por quality — precisamos do quality para resolver
    'gpt-image-1': {
      low:    0.04,
      medium: 0.08,
      high:   0.17,
    },
  },
  fal: {
    'flux-1.1-pro':          0.04,
  },
  gemini: {
    'nano-banana':                                0.02,
    'gemini-2.0-flash-preview-image-generation':  0.02,
  },
};

// ── Preços de LLM (USD por TOKEN) ───────────────────────────────────────────
const LLM_PRICES = {
  'gpt-4o':           { input: 0.000005,    output: 0.000015   },
  'gpt-4o-mini':      { input: 0.00000015,  output: 0.0000006  },
  'claude-haiku-4-5': { input: 0.0000008,   output: 0.000004   },
  'claude-sonnet-4-6':{ input: 0.000003,    output: 0.000015   },
  'claude-opus-4-7':  { input: 0.000015,    output: 0.000075   },
};

/**
 * Resolve preço da imagem com base em provider/model/qualidade/tamanho.
 *
 * @param {object} args
 * @param {string} args.provider
 * @param {string} args.model
 * @param {string} [args.quality] - 'low'|'medium'|'high' (apenas openai)
 * @param {number} [args.width=1024]
 * @param {number} [args.height=1024]
 * @returns {number} USD
 */
function priceImage({ provider, model, quality, width = 1024, height = 1024 }) {
  const providerTable = IMAGE_PRICES[provider];
  if (!providerTable) return 0;

  let baseEntry = providerTable[model];

  // Match parcial — útil quando o frontend passa nome curto e a tabela tem ID completo
  if (!baseEntry) {
    const key = Object.keys(providerTable).find(k => model.includes(k) || k.includes(model));
    if (key) baseEntry = providerTable[key];
  }
  if (baseEntry === undefined) return 0;

  // Caso openai: entrada é dict por quality
  let basePrice = baseEntry;
  if (typeof baseEntry === 'object') {
    basePrice = baseEntry[quality || 'medium'] || baseEntry.medium || 0;
  }

  // Escala por área (megapixels) — referência é 1024x1024 = 1.05 MP
  const refMP = 1024 * 1024 / 1_000_000;
  const actualMP = (width * height) / 1_000_000;
  const ratio = actualMP / refMP;
  return basePrice * ratio;
}

/**
 * Calcula custo do LLM em USD.
 */
function priceLlm({ llmModel, tokensInput = 0, tokensOutput = 0 }) {
  if (!llmModel) return 0;
  let table = LLM_PRICES[llmModel];
  if (!table) {
    const k = Object.keys(LLM_PRICES).find(k => llmModel.includes(k) || k.includes(llmModel));
    table = k ? LLM_PRICES[k] : null;
  }
  if (!table) return 0;
  return tokensInput * table.input + tokensOutput * table.output;
}

/**
 * Custo total da geração: imagem + LLM (quando aplicável).
 *
 * @param {object} args
 * @param {string} args.provider
 * @param {string} args.model
 * @param {string} [args.quality]
 * @param {number} [args.width]
 * @param {number} [args.height]
 * @param {number} [args.tokensInput=0]
 * @param {number} [args.tokensOutput=0]
 * @param {string} [args.llmModel]
 * @returns {number} USD com até 6 casas decimais
 */
function calculateCost(args) {
  const imageCost = priceImage(args);
  const llmCost = priceLlm(args);
  const total = imageCost + llmCost;
  // Arredonda pra 6 casas (compatível com NUMERIC(10,6) da tabela)
  return Math.round(total * 1_000_000) / 1_000_000;
}

module.exports = {
  calculateCost,
  priceImage,
  priceLlm,
  IMAGE_PRICES,
  LLM_PRICES,
};
