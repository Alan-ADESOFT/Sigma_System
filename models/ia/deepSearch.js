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

/**
 * Executa uma pesquisa web e retorna texto + fontes
 * @param {string} query - Consulta de pesquisa (o que buscar)
 * @param {string} [instructions=''] - Instrucoes do sistema para guiar a pesquisa
 * @returns {Promise<{text: string, citations: Array<{url: string, title: string}>}>}
 */
async function deepSearch(query, instructions = '') {
  const provider = process.env.AI_SEARCH_PROVIDER || 'openai';
  console.log('[INFO][DeepSearch] Iniciando pesquisa', { provider, queryLength: query.length, hasInstructions: !!instructions });

  let result;
  if (provider === 'perplexity') {
    result = await perplexitySearch(query, instructions);
  } else {
    result = await webSearch(query, instructions);
  }

  console.log('[SUCESSO][DeepSearch] Pesquisa concluida', { provider, resultLength: result.text.length, citationsCount: result.citations.length });
  return result;
}

module.exports = { deepSearch };
