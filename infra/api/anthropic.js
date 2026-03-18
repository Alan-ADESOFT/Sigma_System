/**
 * @fileoverview Conexão com a API da Anthropic (Claude)
 * @description Wrapper para Messages API — sem SDK externo, usa fetch nativo.
 */

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Retorna os headers padrão para requisições à Anthropic
 * @returns {Object} Headers HTTP
 */
function getHeaders() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada no .env');
  return {
    'x-api-key': key,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  };
}

/**
 * Gera texto usando Anthropic Messages API
 * @param {string} model - Model ID (ex: claude-opus-4-20250514)
 * @param {string} systemPrompt - Prompt do sistema
 * @param {string} userMessage - Mensagem do usuário
 * @param {number} [maxTokens=2000] - Limite de tokens
 * @returns {Promise<string>} Texto gerado
 */
async function generateCompletion(model, systemPrompt, userMessage, maxTokens = 2000) {
  const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic Error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

module.exports = { generateCompletion };
