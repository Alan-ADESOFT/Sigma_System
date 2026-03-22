/**
 * infra/api/perplexity.js
 * Wrapper para a API Perplexity (sonar models).
 * Alternativa ao OpenAI web_search para pesquisas mais ricas.
 *
 * Variaveis necessarias:
 *   PERPLEXITY_API_KEY=pplx-...
 *   AI_SEARCH_PROVIDER=openai | perplexity (default: openai)
 */

/**
 * Pesquisa web usando Perplexity API (sonar models)
 * @param {string} query - Consulta de pesquisa
 * @param {string} [instructions=''] - Instrucoes do sistema
 * @returns {Promise<{text: string, citations: Array<{url: string, title: string}>}>}
 */
async function perplexitySearch(query, instructions = '') {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error('PERPLEXITY_API_KEY nao configurada no .env');

  const model = process.env.PERPLEXITY_MODEL || 'sonar-pro';
  console.log('[INFO][Perplexity] Iniciando pesquisa', { model, query: query.substring(0, 100) });

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: instructions || 'Be precise and concise.' },
        { role: 'user', content: query },
      ],
      max_tokens: 4000,
      return_citations: true,
      return_related_questions: false,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('[ERRO][Perplexity] Falha na pesquisa', { model, status: response.status, message: err?.error?.message });
    throw new Error(`Perplexity Error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';

  // Perplexity retorna citations como array de URLs no campo data.citations
  const rawCitations = data.citations || [];
  const citations = rawCitations.map(url => ({
    url,
    title: url,
  }));

  console.log('[SUCESSO][Perplexity] Pesquisa concluida', { citationsCount: citations.length, resultLength: text.length });
  console.log('[DEBUG][Perplexity] Citations recebidas', { citations });

  return { text, citations };
}

module.exports = { perplexitySearch };
