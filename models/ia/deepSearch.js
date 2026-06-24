/**
 * @fileoverview Pesquisa Web — roteamento por provider
 * @description Wrapper de alto nivel para buscas na web com suporte a citations.
 * Usado pelos agentes que tem hasWebSearch: true.
 *
 * Provider controlado por AI_SEARCH_PROVIDER (default: openai).
 * Opcoes: 'openai' (Responses API) | 'perplexity' (sonar models)
 */

const { webSearch } = require('../../infra/api/openai');
const { perplexitySearch } = require('../../infra/api/perplexity');
const { logUsage } = require('../copy/tokenUsage');

/**
 * Executa uma pesquisa web e retorna texto + fontes
 * @param {string} query - Consulta de pesquisa (o que buscar)
 * @param {string} [instructions=''] - Instrucoes do sistema para guiar a pesquisa
 * @param {object} [opts] - Tracking de tokens (opcional, não quebra chamadas existentes)
 * @param {string} [opts.tenantId] - Se presente, loga uso em ai_token_usage
 * @param {string} [opts.operationType='web_search'] - Tipo de operação no log
 * @param {string} [opts.clientId]
 * @param {string} [opts.sessionId]
 * @returns {Promise<{text: string, citations: Array<{url: string, title: string}>, usage?: object, modelUsed?: string}>}
 */
async function deepSearch(query, instructions = '', opts = {}) {
  const provider = process.env.AI_SEARCH_PROVIDER || 'openai';
  console.log('[INFO][DeepSearch] Iniciando pesquisa', { provider, queryLength: query.length, hasInstructions: !!instructions });

  let result;
  if (provider === 'perplexity') {
    result = await perplexitySearch(query, instructions);
  } else {
    result = await webSearch(query, instructions);
  }

  console.log('[SUCESSO][DeepSearch] Pesquisa concluida', { provider, resultLength: result.text.length, citationsCount: result.citations.length });

  // Tracking de tokens — a busca web não passava pelo logUsage antes.
  if (opts.tenantId && result.usage && result.modelUsed) {
    logUsage({
      tenantId: opts.tenantId,
      modelUsed: result.modelUsed,
      provider: provider === 'perplexity' ? 'perplexity' : 'openai',
      operationType: opts.operationType || 'web_search',
      clientId: opts.clientId || null,
      sessionId: opts.sessionId || null,
      tokensInput:  result.usage.input  || 0,
      tokensOutput: result.usage.output || 0,
    });
  }

  return result;
}

module.exports = { deepSearch };
