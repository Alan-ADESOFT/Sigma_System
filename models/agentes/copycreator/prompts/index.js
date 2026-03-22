/**
 * @fileoverview Índice dos agentes CopyCreator
 * @description Exporta todos os agentes em ordem de execução do pipeline.
 * Facilita listagem, lookup por nome e iteração sobre todos os agentes.
 */

const agente1  = require('./agente1');
const agente2a = require('./agente2a');
const agente2b = require('./agente2b');
const agente3  = require('./agente3');
const agente4a = require('./agente4a');
const agente4b = require('./agente4b');
const agente5  = require('./agente5');
const agente6  = require('./agente6');

/** Lista ordenada de todos os agentes */
const ALL_AGENTS = [agente1, agente2a, agente2b, agente3, agente4a, agente4b, agente5, agente6];

/**
 * Mapa nome → módulo do agente (para lookup rápido)
 * @type {Record<string, object>}
 */
const AGENT_MAP = Object.fromEntries(
  ALL_AGENTS.map((a) => [a.agentConfig.name, a])
);

/**
 * Retorna o módulo de um agente pelo nome
 * @param {string} name - Nome do agente (ex: 'agente1')
 * @returns {object|null} Módulo do agente ou null se não encontrado
 */
function getAgent(name) {
  return AGENT_MAP[name] || null;
}

/**
 * Retorna a lista de configs de todos os agentes (para UI)
 * @returns {Array<object>} Array de agentConfig
 */
function listAgentConfigs() {
  return ALL_AGENTS.map((a) => a.agentConfig);
}

module.exports = { ALL_AGENTS, AGENT_MAP, getAgent, listAgentConfigs };
