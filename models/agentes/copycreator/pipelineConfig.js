/**
 * @fileoverview Configuração do Pipeline de Agentes
 * @description Fonte da verdade sobre o pipeline:
 *   - Ordem de execução
 *   - Categoria KB onde cada agente salva seu output
 *   - Dependências (quais outputs cada agente precisa carregar)
 *   - Placeholder correspondente no prompt
 *
 * Regra: nunca duplicar essa lógica — todo módulo que precisa
 * saber sobre o pipeline deve importar deste arquivo.
 */

const PIPELINE_CONFIG = {
  agente1: {
    order: 1,
    stageKey: 'diagnosis',
    savesToKB: { category: 'diagnostico', key: 'output_completo' },
    dependsOn: [],
    outputPlaceholder: '{OUTPUT_DIAGNOSTICO}',
  },
  agente2a: {
    order: 2,
    stageKey: 'competitors',
    savesToKB: { category: 'concorrentes_raw', key: 'pesquisa_bruta' },
    dependsOn: [
      { agentName: 'agente1', placeholder: '{OUTPUT_DIAGNOSTICO}', kb: { category: 'diagnostico', key: 'output_completo' } },
    ],
    outputPlaceholder: '{OUTPUT_PESQUISA_CONCORRENTES}',
  },
  agente2b: {
    order: 3,
    stageKey: 'competitors',
    savesToKB: { category: 'concorrentes', key: 'analise_completa' },
    dependsOn: [
      { agentName: 'agente1', placeholder: '{OUTPUT_DIAGNOSTICO}', kb: { category: 'diagnostico', key: 'output_completo' } },
      { agentName: 'agente2a', placeholder: '{OUTPUT_PESQUISA_CONCORRENTES}', kb: { category: 'concorrentes_raw', key: 'pesquisa_bruta' } },
    ],
    outputPlaceholder: '{OUTPUT_ANALISE_CONCORRENTES}',
  },
  agente3: {
    order: 4,
    stageKey: 'audience',
    savesToKB: { category: 'publico_alvo', key: 'output_completo' },
    dependsOn: [
      { agentName: 'agente1', placeholder: '{OUTPUT_DIAGNOSTICO}', kb: { category: 'diagnostico', key: 'output_completo' } },
      { agentName: 'agente2b', placeholder: '{OUTPUT_ANALISE_CONCORRENTES}', kb: { category: 'concorrentes', key: 'analise_completa' } },
    ],
    outputPlaceholder: '{OUTPUT_PUBLICO_ALVO}',
  },
  agente4a: {
    order: 5,
    stageKey: 'avatar',
    savesToKB: { category: 'avatar_raw', key: 'pesquisa_bruta' },
    dependsOn: [
      { agentName: 'agente1', placeholder: '{OUTPUT_DIAGNOSTICO}', kb: { category: 'diagnostico', key: 'output_completo' } },
      { agentName: 'agente3', placeholder: '{OUTPUT_PUBLICO_ALVO}', kb: { category: 'publico_alvo', key: 'output_completo' } },
    ],
    outputPlaceholder: '{OUTPUT_PESQUISA_AVATAR}',
  },
  agente4b: {
    order: 6,
    stageKey: 'avatar',
    savesToKB: { category: 'avatar', key: 'output_completo' },
    dependsOn: [
      { agentName: 'agente1', placeholder: '{OUTPUT_DIAGNOSTICO}', kb: { category: 'diagnostico', key: 'output_completo' } },
      { agentName: 'agente3', placeholder: '{OUTPUT_PUBLICO_ALVO}', kb: { category: 'publico_alvo', key: 'output_completo' } },
      { agentName: 'agente4a', placeholder: '{OUTPUT_PESQUISA_AVATAR}', kb: { category: 'avatar_raw', key: 'pesquisa_bruta' } },
    ],
    outputPlaceholder: '{OUTPUT_AVATAR}',
  },
  agente5: {
    order: 7,
    stageKey: 'positioning',
    savesToKB: { category: 'posicionamento', key: 'output_completo' },
    dependsOn: [
      { agentName: 'agente1', placeholder: '{OUTPUT_DIAGNOSTICO}', kb: { category: 'diagnostico', key: 'output_completo' } },
      { agentName: 'agente2b', placeholder: '{OUTPUT_ANALISE_CONCORRENTES}', kb: { category: 'concorrentes', key: 'analise_completa' } },
      { agentName: 'agente3', placeholder: '{OUTPUT_PUBLICO_ALVO}', kb: { category: 'publico_alvo', key: 'output_completo' } },
      { agentName: 'agente4b', placeholder: '{OUTPUT_AVATAR}', kb: { category: 'avatar', key: 'output_completo' } },
    ],
    outputPlaceholder: '{OUTPUT_POSICIONAMENTO}',
  },
  agente6: {
    order: 8,
    stageKey: 'offer',
    savesToKB: { category: 'oferta', key: 'output_completo' },
    dependsOn: [
      { agentName: 'agente1', placeholder: '{OUTPUT_DIAGNOSTICO}', kb: { category: 'diagnostico', key: 'output_completo' } },
      { agentName: 'agente4b', placeholder: '{OUTPUT_AVATAR}', kb: { category: 'avatar', key: 'output_completo' } },
      { agentName: 'agente5', placeholder: '{OUTPUT_POSICIONAMENTO}', kb: { category: 'posicionamento', key: 'output_completo' } },
    ],
    outputPlaceholder: '{OUTPUT_OFERTA}',
  },
};

/**
 * Retorna a config de pipeline de um agente
 * @param {string} agentName
 * @returns {object|null}
 */
function getAgentConfig(agentName) {
  return PIPELINE_CONFIG[agentName] || null;
}

/**
 * Retorna a lista de agentes ordenados por order (para execução sequencial)
 * @returns {Array<{ agentName: string, config: object }>}
 */
function getExecutionOrder() {
  return Object.entries(PIPELINE_CONFIG)
    .map(([agentName, config]) => ({ agentName, config }))
    .sort((a, b) => a.config.order - b.config.order);
}

/**
 * Retorna as dependências de um agente
 * @param {string} agentName
 * @returns {Array<{ agentName: string, placeholder: string, kb: { category: string, key: string } }>}
 */
function getDependencies(agentName) {
  return PIPELINE_CONFIG[agentName]?.dependsOn || [];
}

module.exports = {
  PIPELINE_CONFIG,
  getAgentConfig,
  getExecutionOrder,
  getDependencies,
};
