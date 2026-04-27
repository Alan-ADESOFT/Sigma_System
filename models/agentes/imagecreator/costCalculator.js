/**
 * @fileoverview Calculadora de custo USD do Gerador de Imagem
 * @description Tabela hardcoded de preços (atualizar manualmente quando os
 * provedores mudarem). Soma custo da imagem + custo do LLM (Prompt Engineer
 * + Brandbook Extractor + Smart Selector + Title Generator + Reference Vision)
 * quando aplicável.
 *
 * Última atualização: abril 2026 (sprint v1.1 — lineup novo).
 *
 * Modelos atuais: Nano Banana 2, Flux Kontext Pro, GPT Image 2,
 *                 Imagen 3 Capability, Imagen 4.
 *
 * Compatibilidade reversa: modelos descontinuados (gpt-image-1, flux-1.1-pro,
 * nano-banana, imagen-3) seguem na tabela pra que jobs antigos no histórico
 * exibam custo correto.
 */

// ── Preços de imagem (USD por imagem 1024x1024 ou equivalente) ──────────────
// Estrutura unificada: cada chave aceita tanto valor numérico (preço fixo
// independente de quality) quanto objeto {quality_low, quality_med, quality_high}.
// Para tamanhos diferentes, escalamos proporcionalmente por megapixel.
const IMAGE_PRICES = {
  // ── Lineup v1.1 (atual) ───────────────────────────────────────────────
  'gemini-3.1-flash-image-preview': { quality_low: 0.045, quality_med: 0.067, quality_high: 0.151 },
  'gemini-3-pro-image-preview':     { quality_low: 0.134, quality_med: 0.134, quality_high: 0.134 },
  'fal-ai/flux-pro/kontext':        { quality_low: 0.04,  quality_med: 0.04,  quality_high: 0.04  },
  'fal-ai/flux-pro/kontext/max':    { quality_low: 0.06,  quality_med: 0.06,  quality_high: 0.06  },
  'gpt-image-2':                    { quality_low: 0.04,  quality_med: 0.08,  quality_high: 0.17  },
  'imagen-3.0-capability-001':      { quality_low: 0.04,  quality_med: 0.04,  quality_high: 0.04  },
  'imagen-4.0-generate-001':        { quality_low: 0.04,  quality_med: 0.04,  quality_high: 0.06  },
  'imagen-4.0-fast-generate-001':   { quality_low: 0.02,  quality_med: 0.02,  quality_high: 0.02  },

  // ── Compat reversa (modelos descontinuados, ainda exibidos no histórico) ──
  'imagen-4':                                    0.04,
  'imagen-4-fast':                               0.02,
  'imagen-3':                                    0.04,
  'gpt-image-1':         { low: 0.04, medium: 0.08, high: 0.17 },
  'flux-1.1-pro':                                0.04,
  'nano-banana':                                 0.02,
  'gemini-2.0-flash-preview-image-generation':   0.02,
};

// ── Preços de LLM (USD por TOKEN) ───────────────────────────────────────────
// Usado pro Prompt Engineer, Smart Selector, Title Generator, Reference Vision.
const LLM_PRICES = {
  'gpt-4o':            { input: 0.0000025,   output: 0.00001    },
  'gpt-4o-mini':       { input: 0.00000015,  output: 0.0000006  },
  'claude-haiku-4-5':  { input: 0.0000008,   output: 0.000004   },
  'claude-sonnet-4-6': { input: 0.000003,    output: 0.000015   },
  'claude-opus-4-7':   { input: 0.000015,    output: 0.000075   },
};

/**
 * Resolve preço da imagem com base em provider/model/qualidade/tamanho.
 *
 * @param {object} args
 * @param {string} [args.provider] - opcional (model é a chave canônica)
 * @param {string} args.model
 * @param {string} [args.quality] - 'low'|'medium'|'high' ou 'quality_low'|'quality_med'|'quality_high'
 * @param {number} [args.width=1024]
 * @param {number} [args.height=1024]
 * @returns {number} USD
 */
function priceImage({ model, quality, width = 1024, height = 1024 }) {
  if (!model) return 0;

  let entry = IMAGE_PRICES[model];

  // Match parcial (legado) — útil quando frontend passa nome curto e a tabela
  // tem ID completo. Tenta primeiro match exato e depois substring.
  if (entry === undefined) {
    const key = Object.keys(IMAGE_PRICES).find(k => model.includes(k) || k.includes(model));
    if (key) entry = IMAGE_PRICES[key];
  }
  if (entry === undefined) return 0;

  // Resolve preço base pela quality
  let basePrice;
  if (typeof entry === 'number') {
    basePrice = entry;
  } else if (typeof entry === 'object') {
    // Aceita tanto a convenção nova (quality_low/med/high) quanto a antiga (low/medium/high)
    const q = quality || 'medium';
    const newConv = { low: 'quality_low', medium: 'quality_med', high: 'quality_high' }[q] || q;
    basePrice = entry[newConv] ?? entry[q] ?? entry.quality_med ?? entry.medium ?? Object.values(entry)[0] ?? 0;
  } else {
    basePrice = 0;
  }

  // Escala por área (megapixels) — referência é 1024x1024 = 1.05 MP
  const refMP = (1024 * 1024) / 1_000_000;
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
 * @param {object} args - vide priceImage e priceLlm
 * @returns {number} USD com até 6 casas decimais
 */
function calculateCost(args) {
  const imageCost = priceImage(args);
  const llmCost = priceLlm(args);
  const total = imageCost + llmCost;
  // Arredonda pra 6 casas (compatível com NUMERIC(10,6) da tabela)
  return Math.round(total * 1_000_000) / 1_000_000;
}

/**
 * Helper de UI: classifica preço base do modelo em $/$$/$$$ pra exibir
 * nos cards. Ignora variação por quality — usa o preço médio.
 *
 * @param {string} modelId
 * @returns {'$'|'$$'|'$$$'|'?'}
 */
function costLabel(modelId) {
  const entry = IMAGE_PRICES[modelId];
  if (entry === undefined) return '?';

  let p;
  if (typeof entry === 'number') p = entry;
  else if (typeof entry === 'object') p = entry.quality_med ?? entry.medium ?? entry.quality_low ?? Object.values(entry)[0] ?? 0;
  else p = 0;

  if (p <= 0.05) return '$';
  if (p <= 0.10) return '$$';
  return '$$$';
}

module.exports = {
  calculateCost,
  priceImage,
  priceLlm,
  costLabel,
  IMAGE_PRICES,
  LLM_PRICES,
};
