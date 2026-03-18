/**
 * @fileoverview Executor de Agentes — AgentRunner
 * @description Roda um agente individual:
 *   1. Carrega o prompt (editável ou padrão)
 *   2. Substitui placeholders dinâmicos com dados do banco (knowledge base)
 *   3. Injeta formatação Markdown
 *   4. Chama a API correta (completion ou webSearch)
 *   5. Salva no histórico (ai_agent_history / ai_search_history)
 *   6. Retorna resultado formatado
 */

const { runCompletion }   = require('../../ia/completion');
const { deepSearch }      = require('../../ia/deepSearch');
const { withMarkdown }    = require('../../ia/markdownHelper');
const { getAgent }        = require('./prompts/index');
const { query, queryOne } = require('../../../infra/db');

// ─── Placeholders dinâmicos suportados ───────────────────────────────────────
// Mapeamento placeholder → categoria na ai_knowledge_base
const KB_PLACEHOLDER_MAP = {
  '{MARCA}':    'marca',
  '{PRODUTO}':  'produto',
  '{PERSONA}':  'persona',
  '{TOM}':      'tom_de_voz',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Busca todos os dados da knowledge base de um tenant e retorna como objeto
 * @param {string} tenantId
 * @returns {Promise<Record<string, Record<string, string>>>} { categoria: { key: value } }
 */
async function loadKnowledgeBase(tenantId) {
  const rows = await query(
    'SELECT category, key, value FROM ai_knowledge_base WHERE tenant_id = $1',
    [tenantId]
  );
  const kb = {};
  for (const row of rows) {
    if (!kb[row.category]) kb[row.category] = {};
    kb[row.category][row.key] = row.value;
  }
  return kb;
}

/**
 * Substitui placeholders de knowledge base no prompt
 * Ex: {MARCA} → dados da categoria "marca" formatados em JSON
 * @param {string} prompt
 * @param {object} kb - knowledge base do tenant
 * @returns {string} Prompt com placeholders substituídos
 */
function injectKnowledgeBase(prompt, kb) {
  let result = prompt;
  for (const [placeholder, category] of Object.entries(KB_PLACEHOLDER_MAP)) {
    if (result.includes(placeholder) && kb[category]) {
      result = result.replaceAll(placeholder, JSON.stringify(kb[category], null, 2));
    }
  }
  return result;
}

/**
 * Substitui placeholders de contexto (dados dinâmicos passados pelo chamador)
 * Ex: {DADOS_CLIENTE} → JSON do cliente
 * @param {string} prompt
 * @param {Record<string, string>} context - { '{PLACEHOLDER}': 'valor' }
 * @returns {string}
 */
function injectContext(prompt, context = {}) {
  let result = prompt;
  for (const [placeholder, value] of Object.entries(context)) {
    if (value !== undefined && value !== null) {
      result = result.replaceAll(placeholder, value);
    }
  }
  return result;
}

/**
 * Injeta complementos (links e imagens) no prompt — apenas para agentes type: text
 * @param {string} prompt
 * @param {{ links?: string[], images?: string[] }} complements
 * @returns {string}
 */
function injectComplements(prompt, complements = {}) {
  const parts = [];
  if (complements.links?.length) {
    parts.push(`\nLINKS DE REFERÊNCIA:\n${complements.links.map((l) => `- ${l}`).join('\n')}`);
  }
  if (complements.images?.length) {
    parts.push(`\nIMAGENS DE REFERÊNCIA:\n${complements.images.map((i) => `- ${i}`).join('\n')}`);
  }
  return parts.length ? `${prompt}\n${parts.join('\n')}` : prompt;
}

// ─── Salvar no histórico ──────────────────────────────────────────────────────

/**
 * Salva resultado de completion no histórico de agentes
 * @returns {Promise<string>} ID do registro criado
 */
async function saveAgentHistory(tenantId, agentName, modelUsed, promptSent, responseText, metadata = {}) {
  const row = await queryOne(
    `INSERT INTO ai_agent_history (tenant_id, agent_name, model_used, prompt_sent, response_text, metadata)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [tenantId, agentName, modelUsed, promptSent, responseText, JSON.stringify(metadata)]
  );
  return row?.id;
}

/**
 * Salva resultado de pesquisa web no histórico de buscas
 * @returns {Promise<string>} ID do registro criado
 */
async function saveSearchHistory(tenantId, agentName, searchQuery, resultText, citations = []) {
  const row = await queryOne(
    `INSERT INTO ai_search_history (tenant_id, agent_name, query, result_text, citations)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [tenantId, agentName, searchQuery, resultText, JSON.stringify(citations)]
  );
  return row?.id;
}

// ─── Executor principal ───────────────────────────────────────────────────────

/**
 * Executa um agente e retorna o resultado formatado
 *
 * @param {object} params
 * @param {string}  params.agentName    - Nome do agente (ex: 'agente1')
 * @param {string}  params.tenantId     - ID do tenant (multi-tenant)
 * @param {string}  params.userInput    - Input do usuário
 * @param {string}  [params.modelLevel] - Override do nível (weak|medium|strong)
 * @param {string}  [params.customPrompt] - Prompt editado pelo usuário
 * @param {Record<string, string>} [params.context] - Dados para injetar nos placeholders
 * @param {{ links?: string[], images?: string[] }} [params.complements]
 *
 * @returns {Promise<{
 *   text: string,
 *   citations: Array<{url: string, title: string}>,
 *   agentName: string,
 *   modelUsed: string,
 *   historyId: string,
 *   type: string
 * }>}
 */
async function runAgent({
  agentName,
  tenantId,
  userInput,
  modelLevel,
  customPrompt,
  context = {},
  complements = {},
}) {
  // 1. Carrega módulo do agente
  const agentModule = getAgent(agentName);
  if (!agentModule) throw new Error(`Agente "${agentName}" não encontrado`);

  const { agentConfig } = agentModule;
  const level = modelLevel || agentConfig.modelLevel;

  // 2. Carrega knowledge base do tenant
  const kb = await loadKnowledgeBase(tenantId);

  // 3. Monta o prompt base (editado pelo usuário ou padrão)
  let systemPrompt = customPrompt || agentModule.getPrompt();

  // 4. Injeta dados dinâmicos (context + knowledge base)
  systemPrompt = injectContext(systemPrompt, context);
  systemPrompt = injectKnowledgeBase(systemPrompt, kb);

  // 5. Injeta complementos (links/imagens) se agente tipo text
  if (agentConfig.type === 'text') {
    systemPrompt = injectComplements(systemPrompt, complements);
  }

  // 6. Injeta formatação Markdown
  systemPrompt = withMarkdown(systemPrompt);

  let text = '';
  let citations = [];
  let modelUsed = '';
  let historyId = null;

  // ── Agente de PESQUISA ────────────────────────────────────────────────────
  if (agentConfig.type === 'search' && agentConfig.hasWebSearch) {
    const result = await deepSearch(userInput, systemPrompt);
    text      = result.text;
    citations = result.citations;
    modelUsed = process.env.AI_MODEL_SEARCH || 'gpt-4o-mini';

    historyId = await saveSearchHistory(tenantId, agentName, userInput, text, citations);

  // ── Agente de TEXTO ───────────────────────────────────────────────────────
  } else {
    const result = await runCompletion(level, systemPrompt, userInput, 4000);
    text      = result.text;
    modelUsed = result.modelUsed;

    historyId = await saveAgentHistory(tenantId, agentName, modelUsed, systemPrompt, text, {
      userInput,
      level,
    });
  }

  return {
    text,
    citations,
    agentName,
    modelUsed,
    historyId,
    type: agentConfig.type,
  };
}

module.exports = { runAgent };
