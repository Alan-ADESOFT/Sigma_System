/**
 * @fileoverview Roteador unificado de completion de texto
 * @description Decide automaticamente qual API usar (OpenAI ou Anthropic)
 * com base no model ID resolvido via variáveis de ambiente.
 */

const openai = require('../../infra/api/openai');
const anthropic = require('../../infra/api/anthropic');

/**
 * Mapa de níveis para variáveis de ambiente dos modelos
 * @type {Record<string, string>}
 */
const MODEL_LEVEL_MAP = {
  weak:   'AI_MODEL_WEAK',
  medium: 'AI_MODEL_MEDIUM',
  strong: 'AI_MODEL_STRONG',
};

/**
 * Resolve o model ID completo a partir de um nível semântico
 * @param {string} level - 'weak' | 'medium' | 'strong'
 * @returns {string} Model ID do .env
 */
function resolveModel(level) {
  const envKey = MODEL_LEVEL_MAP[level] || MODEL_LEVEL_MAP.medium;
  const model = process.env[envKey];
  if (!model) {
    throw new Error(`Variável de ambiente ${envKey} não configurada no .env`);
  }
  return model;
}

/**
 * Roteador de completion — decide OpenAI ou Anthropic pelo model ID
 * - model contém "claude" → Anthropic Messages API
 * - model contém "gpt" ou "o1" → OpenAI Chat Completions API
 *
 * @param {string} modelLevel - 'weak' | 'medium' | 'strong'
 * @param {string} systemPrompt - Prompt do sistema
 * @param {string} userMessage - Mensagem do usuário
 * @param {number} [maxTokens=2000] - Limite de tokens
 * @returns {Promise<{text: string, modelUsed: string}>}
 */
async function runCompletion(modelLevel, systemPrompt, userMessage, maxTokens = 2000) {
  const model = resolveModel(modelLevel);
  const provider = model.toLowerCase().includes('claude') ? 'Anthropic' : 'OpenAI';
  console.log('[INFO][Completion] Roteando para provider', { modelLevel, model, provider });

  let text;
  if (provider === 'Anthropic') {
    text = await anthropic.generateCompletion(model, systemPrompt, userMessage, maxTokens);
  } else {
    text = await openai.generateCompletion(model, systemPrompt, userMessage, maxTokens);
  }

  console.log('[SUCESSO][Completion] Texto gerado', { model, provider, responseLength: text.length });
  return { text, modelUsed: model };
}

module.exports = { runCompletion, resolveModel };
