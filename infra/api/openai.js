/**
 * @fileoverview Conexão com a API da OpenAI
 * @description Wrapper para Chat Completions e Web Search (Responses API)
 * Usa fetch nativo — sem SDK externo.
 */

const OPENAI_BASE = 'https://api.openai.com/v1';

/**
 * Retorna os headers padrão para requisições à OpenAI
 * @returns {Object} Headers HTTP
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
 * Gera texto usando OpenAI Chat Completions API
 * @param {string} model - Model ID (ex: gpt-4o-mini)
 * @param {string} systemPrompt - Prompt do sistema
 * @param {string} userMessage - Mensagem do usuário
 * @param {number} [maxTokens=2000] - Limite de tokens
 * @returns {Promise<string>} Texto gerado
 */
async function generateCompletion(model, systemPrompt, userMessage, maxTokens = 2000) {
  const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI Completion Error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Pesquisa web usando OpenAI Responses API com tool web_search_preview
 * @param {string} query - Consulta de pesquisa
 * @param {string} [instructions=''] - Instruções do sistema (prompt)
 * @returns {Promise<{text: string, citations: Array<{url: string, title: string}>}>}
 */
async function webSearch(query, instructions = '') {
  const model = process.env.AI_MODEL_SEARCH || 'gpt-4o-mini';

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: query,
      ...(instructions ? { instructions } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI Web Search Error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();

  // Extrai o bloco de mensagem com o resultado textual
  let text = '';
  const citations = [];

  for (const block of (data.output || [])) {
    if (block.type === 'message') {
      for (const content of (block.content || [])) {
        if (content.type === 'output_text') {
          text = content.text || '';

          // Extrai citations das annotations
          for (const annotation of (content.annotations || [])) {
            if (annotation.type === 'url_citation' && annotation.url) {
              citations.push({
                url: annotation.url,
                title: annotation.title || annotation.url,
              });
            }
          }
        }
      }
    }
  }

  return { text, citations };
}

module.exports = { generateCompletion, webSearch };
