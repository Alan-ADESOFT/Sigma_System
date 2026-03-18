/**
 * @fileoverview Pesquisa Web via OpenAI Responses API
 * @description Wrapper de alto nível para buscas na web com suporte a citations.
 * Usado pelos agentes que têm hasWebSearch: true.
 */

const { webSearch } = require('../../infra/api/openai');

/**
 * Executa uma pesquisa web e retorna texto + fontes
 * @param {string} query - Consulta de pesquisa (o que buscar)
 * @param {string} [instructions=''] - Instruções do sistema para guiar a pesquisa
 * @returns {Promise<{text: string, citations: Array<{url: string, title: string}>}>}
 */
async function deepSearch(query, instructions = '') {
  console.log('[INFO][DeepSearch] Iniciando pesquisa', { queryLength: query.length, hasInstructions: !!instructions });
  const result = await webSearch(query, instructions);
  console.log('[SUCESSO][DeepSearch] Pesquisa concluída', { resultLength: result.text.length, citationsCount: result.citations.length });
  return result;
}

module.exports = { deepSearch };
