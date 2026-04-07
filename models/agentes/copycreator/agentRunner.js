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

const { runCompletion, runCompletionWithFallback } = require('../../ia/completion');
const { deepSearch }          = require('../../ia/deepSearch');
const { withMarkdown }        = require('../../ia/markdownHelper');
const { getAgent }            = require('./prompts/index');
const { query, queryOne }     = require('../../../infra/db');
const { fetchMultipleUrls }   = require('../../../infra/api/scraper');
const { analyzeMultipleImages } = require('../../../infra/api/vision');
const { extractFromFile }     = require('../../../infra/api/fileReader');
const { getAgentConfig, getDependencies } = require('./pipelineConfig');

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
 * Busca dados da knowledge base (por cliente ou por tenant)
 * @param {string} tenantId
 * @param {string} [clientId] - Se informado, busca KB do cliente
 * @returns {Promise<Record<string, Record<string, string>>>} { categoria: { key: value } }
 */
async function loadKnowledgeBase(tenantId, clientId) {
  const sql = clientId
    ? 'SELECT category, key, value FROM ai_knowledge_base WHERE tenant_id = $1 AND client_id = $2'
    : 'SELECT category, key, value FROM ai_knowledge_base WHERE tenant_id = $1 AND client_id IS NULL';
  const params = clientId ? [tenantId, clientId] : [tenantId];
  const rows = await query(sql, params);
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
 * Injeta complementos no prompt.
 * Para links: conteúdo real já buscado via scraper.
 * Para imagens: análise visual já processada via Vision.
 * Para arquivos: texto já extraído via fileReader.
 * @param {string} prompt
 * @param {{ links?: string[], linkContents?: string, imageAnalysis?: string, fileContents?: string, fileNames?: string[] }} complements
 * @returns {string}
 */
function injectComplements(prompt, complements = {}) {
  const parts = [];

  // Conteúdo real dos links (já buscado antes de chamar esta função)
  if (complements.linkContents) {
    parts.push(`\nCONTEÚDO DAS REFERÊNCIAS (extraído das URLs fornecidas):\n${complements.linkContents}`);
  } else if (complements.links?.length) {
    parts.push(`\nLINKS DE REFERÊNCIA:\n${complements.links.map((l) => `- ${l}`).join('\n')}`);
  }

  // Análise visual das imagens (já processada via Vision API)
  if (complements.imageAnalysis) {
    parts.push(`\nANÁLISE VISUAL (imagens fornecidas pelo cliente):\n${complements.imageAnalysis}`);
  }

  // Conteúdo extraído dos arquivos (PDF/DOCX/TXT)
  if (complements.fileContents) {
    parts.push(`\nCONTEÚDO DOS ARQUIVOS ANEXADOS:\n${complements.fileContents}`);
  } else if (complements.fileNames?.length) {
    parts.push(`\nARQUIVOS ANEXADOS:\n${complements.fileNames.map((n) => `- ${n}`).join('\n')}`);
  }

  if (parts.length) {
    return `${prompt}\n\n─────────────────────────────────────
MATERIAIS COMPLEMENTARES
─────────────────────────────────────
Utilize os materiais abaixo como complemento na geração do conteúdo.
Extraia insights, dados e informações relevantes destes materiais
para enriquecer sua resposta, mas sem copiar literalmente.
${parts.join('\n')}`;
  }
  return prompt;
}

// ─── Knowledge Base do Pipeline ──────────────────────────────────────────────

/**
 * Salva o output de um agente na knowledge base do cliente
 * @param {string} tenantId
 * @param {string} clientId
 * @param {string} agentName
 * @param {string} outputText
 * @returns {Promise<{ id: string, version: number }>}
 */
async function saveOutputToKB(tenantId, clientId, agentName, outputText) {
  const pipelineCfg = getAgentConfig(agentName);
  if (!pipelineCfg?.savesToKB) {
    console.warn('[WARNING][AgentRunner] Agente sem savesToKB configurado', { agentName });
    return { id: null, version: 0 };
  }

  const { category, key } = pipelineCfg.savesToKB;
  console.log('[INFO][AgentRunner] Salvando output na KB do cliente', { agentName, category, key, clientId });

  // Busca versão atual para auto-incremento
  const existing = await queryOne(
    `SELECT metadata->>'version' as version FROM ai_knowledge_base
     WHERE tenant_id = $1 AND client_id = $2 AND category = $3 AND key = $4 LIMIT 1`,
    [tenantId, clientId, category, key]
  );
  const newVersion = existing ? (parseInt(existing.version) || 0) + 1 : 1;

  const metadata = JSON.stringify({
    agentName,
    generatedAt: new Date().toISOString(),
    version: newVersion,
  });

  const row = await queryOne(
    `INSERT INTO ai_knowledge_base (tenant_id, client_id, category, key, value, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, client_id, category, key) WHERE client_id IS NOT NULL
     DO UPDATE SET value = EXCLUDED.value, metadata = EXCLUDED.metadata, updated_at = now()
     RETURNING id`,
    [tenantId, clientId, category, key, outputText, metadata]
  );

  console.log('[SUCESSO][AgentRunner] Output salvo na KB', { agentName, category, key, version: newVersion, id: row?.id });
  return { id: row?.id, version: newVersion };
}

/**
 * Carrega outputs de agentes anteriores da KB para injetar como contexto
 * @param {string} tenantId
 * @param {string} clientId
 * @param {string} agentName
 * @returns {Promise<Record<string, string>>} { '{OUTPUT_DIAGNOSTICO}': 'texto...', ... }
 */
async function loadDependenciesFromKB(tenantId, clientId, agentName) {
  const deps = getDependencies(agentName);
  if (!deps.length) return {};

  console.log('[INFO][AgentRunner] Carregando dependências da KB', { agentName, dependencies: deps.map(d => d.agentName) });

  const context = {};
  for (const dep of deps) {
    const row = await queryOne(
      `SELECT value FROM ai_knowledge_base
       WHERE tenant_id = $1 AND client_id = $2 AND category = $3 AND key = $4 LIMIT 1`,
      [tenantId, clientId, dep.kb.category, dep.kb.key]
    );

    if (row?.value) {
      context[dep.placeholder] = row.value;
    } else {
      console.warn('[WARNING][AgentRunner] Dependência ausente na KB', { agentName, placeholder: dep.placeholder, dependsOnAgent: dep.agentName });
      context[dep.placeholder] = '';
    }
  }

  const found = Object.values(context).filter(v => v).length;
  console.log('[INFO][AgentRunner] Dependências carregadas para', { agentName, total: deps.length, found });
  return context;
}

// ─── Salvar no histórico ──────────────────────────────────────────────────────

/**
 * Salva resultado de completion no histórico de agentes
 * @returns {Promise<string>} ID do registro criado
 */
async function saveAgentHistory(tenantId, agentName, modelUsed, promptSent, responseText, metadata = {}, clientId = null) {
  const row = await queryOne(
    `INSERT INTO ai_agent_history (tenant_id, agent_name, model_used, prompt_sent, response_text, metadata, client_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [tenantId, agentName, modelUsed, promptSent, responseText, JSON.stringify(metadata), clientId]
  );
  return row?.id;
}

/**
 * Salva resultado de pesquisa web no histórico de buscas
 * @returns {Promise<string>} ID do registro criado
 */
async function saveSearchHistory(tenantId, agentName, searchQuery, resultText, citations = [], clientId = null) {
  const row = await queryOne(
    `INSERT INTO ai_search_history (tenant_id, agent_name, query, result_text, citations, client_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [tenantId, agentName, searchQuery, resultText, JSON.stringify(citations), clientId]
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
 * @param {string}  [params.clientId]   - ID do cliente (KB por cliente)
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
  clientId,
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
  console.log('[INFO][AgentRunner] Carregando prompt', { agentName, isCustom: !!customPrompt, type: agentConfig.type, level });

  // 2. Carrega knowledge base (por cliente ou tenant)
  const kb = await loadKnowledgeBase(tenantId, clientId);

  // 2b. Carrega outputs de agentes anteriores da KB (dependências do pipeline)
  let pipelineContext = {};
  if (clientId) {
    pipelineContext = await loadDependenciesFromKB(tenantId, clientId, agentName);
  }

  // 3. Monta o prompt base (custom prompt > override da KB > padrão do arquivo)
  let systemPrompt = customPrompt;
  if (!systemPrompt) {
    // Verifica se existe prompt override na KB do tenant
    const promptOverride = await queryOne(
      `SELECT value FROM ai_knowledge_base WHERE tenant_id = $1 AND category = 'prompt_override' AND key = $2 AND client_id IS NULL`,
      [tenantId, agentName]
    );
    systemPrompt = promptOverride?.value || agentModule.getPrompt();
  }

  // 4. Injeta dados dinâmicos (pipeline deps + context do chamador + knowledge base)
  //    Context do chamador tem prioridade sobre pipeline deps
  const mergedContext = { ...pipelineContext, ...context };
  systemPrompt = injectContext(systemPrompt, mergedContext);
  systemPrompt = injectKnowledgeBase(systemPrompt, kb);
  console.log('[DEBUG][AgentRunner] Placeholders substituídos', { placeholders: Object.keys({ ...mergedContext, ...KB_PLACEHOLDER_MAP }) });

  // 5. Busca conteúdo real dos links de referência (web scraping)
  if (complements.links?.length) {
    console.log('[INFO][AgentRunner] Buscando conteúdo dos links de referência', { links: complements.links });
    const linkContents = await fetchMultipleUrls(complements.links, 2000);
    if (linkContents) {
      complements.linkContents = linkContents;
      console.log('[SUCESSO][AgentRunner] Conteúdo dos links extraído', { contentLength: linkContents.length });
    }
  }

  // 5b. Análise de imagens via Vision (se agente suporta e tem imagens)
  if (agentConfig.hasImages && complements.images?.length) {
    try {
      console.log('[INFO][AgentRunner] Analisando imagens via Vision', { agentName, count: complements.images.length });
      const visionResult = await analyzeMultipleImages(
        complements.images,
        'Analise as imagens fornecidas e extraia todas as informações visuais relevantes: cores, tipografia, estilo, elementos gráficos, textos visíveis, público percebido e qualidade de produção.',
        { detail: 'high' }
      );
      if (visionResult.analysis) {
        complements.imageAnalysis = visionResult.analysis;
        console.log('[SUCESSO][AgentRunner] Análise visual concluída', { agentName, analysisLength: visionResult.analysis.length, tokens: visionResult.tokens });
      }
    } catch (err) {
      console.error('[ERRO][AgentRunner] Falha na análise de imagens — continuando sem', { agentName, error: err.message });
    }
  }

  // 5c. Extração de texto de arquivos (PDF/DOCX/TXT)
  if (complements.files?.length) {
    try {
      console.log('[INFO][AgentRunner] Extraindo texto dos arquivos', { agentName, count: complements.files.length });
      const fileTexts = [];
      for (const file of complements.files) {
        const result = await extractFromFile(file.buffer, file.mimeType, file.fileName);
        if (result.success && result.text) {
          fileTexts.push(`[Arquivo: ${file.fileName}]\n${result.text}`);
        } else {
          console.warn('[WARNING][AgentRunner] Arquivo não extraído', { fileName: file.fileName, reason: result.reason });
        }
      }
      if (fileTexts.length) {
        complements.fileContents = fileTexts.join('\n\n---\n\n');
        console.log('[SUCESSO][AgentRunner] Texto dos arquivos extraído', { agentName, filesProcessed: fileTexts.length, totalLength: complements.fileContents.length });
      }
    } catch (err) {
      console.error('[ERRO][AgentRunner] Falha na extração de arquivos — continuando sem', { agentName, error: err.message });
    }
  }

  // 6. Injeta complementos (links/imagens/arquivos) se agente tipo text
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
    console.log('[INFO][AgentRunner] Executando pesquisa web', { agentName, queryLength: userInput.length });
    const result = await deepSearch(userInput, systemPrompt);
    text      = result.text;
    citations = result.citations;
    modelUsed = process.env.AI_MODEL_SEARCH || 'gpt-4o-mini';

    historyId = await saveSearchHistory(tenantId, agentName, userInput, text, citations, clientId);
    console.log('[SUCESSO][AgentRunner] Pesquisa concluída', { agentName, resultLength: text.length, citationsCount: citations.length, historyId });

  // ── Agente de TEXTO ───────────────────────────────────────────────────────
  } else {
    console.log('[INFO][AgentRunner] Executando completion', { agentName, level, promptLength: systemPrompt.length });
    const result = await runCompletionWithFallback(tenantId, level, systemPrompt, userInput, 4000, {
      clientId,
      operationType: 'pipeline',
    });
    text      = result.text;
    modelUsed = result.modelUsed;

    historyId = await saveAgentHistory(tenantId, agentName, modelUsed, systemPrompt, text, {
      userInput,
      level,
    }, clientId);
    console.log('[SUCESSO][AgentRunner] Agente executado', { agentName, modelUsed, responseLength: text.length, historyId });
  }

  // 8. Salva output na KB do cliente (para encadeamento do pipeline)
  if (clientId && text) {
    try {
      await saveOutputToKB(tenantId, clientId, agentName, text);
    } catch (err) {
      console.error('[ERRO][AgentRunner] Falha ao salvar output na KB — continuando', { agentName, error: err.message });
    }
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

module.exports = { runAgent, saveOutputToKB, loadDependenciesFromKB };
