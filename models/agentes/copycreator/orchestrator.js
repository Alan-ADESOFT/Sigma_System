/**
 * @fileoverview Orquestrador dos Agentes CopyCreator
 * @description Decide a sequência de execução com base no tipo de agente.
 *
 * FLUXO AGENTE DE PESQUISA (type: "search"):
 *   1. Executa webSearch com o prompt do agente pesquisador
 *   2. Se o agente tem feedsInto → executa automaticamente o agente destino
 *      com o resultado da pesquisa injetado no contexto
 *   3. Retorna texto final + citations
 *
 * FLUXO AGENTE DE TEXTO (type: "text"):
 *   1. Injeta complementos (links, imagens) no contexto
 *   2. Executa completion com o prompt do agente
 *   3. Retorna texto formatado
 */

const { runAgent }  = require('./agentRunner');
const { getAgent }  = require('./prompts/index');

/**
 * Mapa de placeholders que cada agente "destino" espera receber
 * quando o orquestrador encadeia um agente de pesquisa com seu par de texto.
 * @type {Record<string, string>}
 */
const FEED_CONTEXT_KEY = {
  agente2b: '{OUTPUT_PESQUISA_CONCORRENTES}',
  agente4b: '{OUTPUT_PESQUISA_AVATAR}',
};

/**
 * Executa um agente pelo orquestrador
 *
 * @param {object} params
 * @param {string}  params.agentName     - Nome do agente a executar
 * @param {string}  params.tenantId      - Tenant ID (multi-tenant)
 * @param {string}  [params.clientId]    - Client ID (KB por cliente)
 * @param {string}  params.userInput     - Input do usuário / consulta
 * @param {string}  [params.modelLevel]  - Override do nível do modelo
 * @param {string}  [params.customPrompt] - Prompt editado pelo usuário
 * @param {Record<string, string>} [params.context] - Dados adicionais p/ placeholders
 * @param {{ links?: string[], images?: string[] }} [params.complements]
 *
 * @returns {Promise<{
 *   text: string,
 *   citations: Array<{url: string, title: string}>,
 *   agentName: string,
 *   modelUsed: string,
 *   historyId: string,
 *   searchResult?: { text: string, citations: Array, historyId: string }
 * }>}
 */
async function orchestrate({
  agentName,
  tenantId,
  clientId,
  userInput,
  modelLevel,
  customPrompt,
  context = {},
  complements = {},
}) {
  const agentModule = getAgent(agentName);
  if (!agentModule) throw new Error(`Agente "${agentName}" não encontrado`);

  const { agentConfig } = agentModule;
  console.log('[INFO][Orchestrator] Executando agente', { agentName, type: agentConfig.type, modelLevel: modelLevel || agentConfig.modelLevel });

  // ── FLUXO DE PESQUISA: search → text ───────────────────────────────────────
  if (agentConfig.type === 'search' && agentConfig.feedsInto) {
    console.log('[INFO][Orchestrator] Fluxo pesquisa → redação', { searchAgentName: agentName, writerAgentName: agentConfig.feedsInto });
    // Passo 1: executa o agente pesquisador
    const searchResult = await runAgent({
      agentName,
      tenantId,
      clientId,
      userInput,
      modelLevel,
      customPrompt,
      context,
      complements,
    });

    const destAgentName = agentConfig.feedsInto;
    const destAgent     = getAgent(destAgentName);

    // Se o agente destino não existir, retorna só o resultado da pesquisa
    if (!destAgent) return { ...searchResult, searchResult: null };

    // Passo 2: injeta o resultado da pesquisa no contexto do agente destino
    const feedKey     = FEED_CONTEXT_KEY[destAgentName];
    const destContext = { ...context };
    if (feedKey) destContext[feedKey] = searchResult.text;

    // Passo 3: executa o agente destino com o resultado injetado
    const textResult = await runAgent({
      agentName:    destAgentName,
      tenantId,
      clientId,
      userInput:    `Analise os seguintes dados coletados:\n\n${searchResult.text}`,
      modelLevel:   destAgent.agentConfig.modelLevel,
      context:      destContext,
      complements,
    });

    // Retorna o resultado final (texto do agente de análise) + dados da pesquisa
    console.log('[SUCESSO][Orchestrator] Fluxo pesquisa → redação concluído', { searchAgentName: agentName, writerAgentName: destAgentName, resultLength: textResult.text.length });
    return {
      ...textResult,
      citations:    searchResult.citations,   // citations vêm sempre da pesquisa
      searchResult: {
        text:      searchResult.text,
        citations: searchResult.citations,
        historyId: searchResult.historyId,
      },
    };
  }

  // ── FLUXO DE TEXTO SIMPLES ──────────────────────────────────────────────────
  console.log('[INFO][Orchestrator] Fluxo texto simples', { agentName });
  return runAgent({
    agentName,
    tenantId,
    clientId,
    userInput,
    modelLevel,
    customPrompt,
    context,
    complements,
  });
}

module.exports = { orchestrate };
