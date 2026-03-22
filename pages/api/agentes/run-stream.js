/**
 * @fileoverview Endpoint SSE: Streaming de execução de agente
 * @route POST /api/agentes/run-stream
 *
 * Recebe dados do agente e faz streaming do output via Server-Sent Events.
 * Para agentes duplos (2A→2B, 4A→4B): pesquisa sem streaming, depois streaming da análise.
 * Para agentes simples: streaming direto do completion.
 *
 * Eventos SSE enviados:
 *   start         — início da execução
 *   log           — mensagem de progresso
 *   search_done   — pesquisa concluída (citations + texto bruto)
 *   generating    — início do streaming de texto
 *   chunk         — fragmento de texto gerado
 *   done          — execução concluída
 *   error         — erro durante execução
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
import { runCompletionStream } from '../../../models/ia/completion';
import { withMarkdown }        from '../../../models/ia/markdownHelper';
import { getAgent }            from '../../../models/agentes/copycreator/prompts/index';
import { runAgent, saveOutputToKB, loadDependenciesFromKB } from '../../../models/agentes/copycreator/agentRunner';
import { queryOne }            from '../../../infra/db';

// Mapa de placeholders para agentes destino (espelhado do orchestrator)
const FEED_CONTEXT_KEY = {
  agente2b: '{OUTPUT_PESQUISA_CONCORRENTES}',
  agente4b: '{OUTPUT_PESQUISA_AVATAR}',
};

export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
};

/**
 * Injeta placeholders de contexto no prompt (reutiliza lógica do agentRunner)
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const tenantId = await resolveTenantId(req);
  const {
    agentName, clientId, userInput, modelLevel,
    customPrompt, context: extraContext = {},
  } = req.body;

  if (!agentName || !userInput) {
    return res.status(400).json({ success: false, error: 'agentName e userInput são obrigatórios' });
  }

  // Configura cabeçalhos SSE
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function sendEvent(type, data = {}) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }

  try {
    sendEvent('start', { agentName, timestamp: Date.now() });

    const agentModule = getAgent(agentName);
    if (!agentModule) throw new Error(`Agente "${agentName}" não encontrado`);
    const { agentConfig } = agentModule;

    // Carrega dependências da KB
    let deps = {};
    if (clientId) {
      deps = await loadDependenciesFromKB(tenantId, clientId, agentName);
      sendEvent('log', { message: `Dependências carregadas (${Object.keys(deps).length} placeholders)` });
    }
    const mergedContext = { ...deps, ...extraContext };

    // ── FLUXO PESQUISA → ANÁLISE (agentes duplos) ────────────────────────
    if (agentConfig.type === 'search' && agentConfig.feedsInto) {
      sendEvent('log', { message: `${agentName} — iniciando pesquisa web...` });

      // Passo 1: pesquisa (sem streaming — é web search)
      const searchResult = await runAgent({
        agentName, tenantId, clientId, userInput,
        modelLevel, customPrompt, context: mergedContext,
      });

      sendEvent('log', { message: `Pesquisa concluída — ${searchResult.citations?.length || 0} fontes encontradas` });
      sendEvent('search_done', {
        citations: searchResult.citations,
        searchText: searchResult.text.substring(0, 2000),
      });

      // Passo 2: streaming do agente de análise
      const destAgentName = agentConfig.feedsInto;
      const destAgent = getAgent(destAgentName);
      if (!destAgent) throw new Error(`Agente destino "${destAgentName}" não encontrado`);

      sendEvent('log', { message: `Iniciando ${destAgentName} — análise dos dados coletados...` });

      // Monta contexto com output da pesquisa
      const feedKey = FEED_CONTEXT_KEY[destAgentName];
      const destContext = { ...mergedContext };
      if (feedKey) destContext[feedKey] = searchResult.text;

      // Carrega deps do agente destino também
      let destDeps = {};
      if (clientId) {
        destDeps = await loadDependenciesFromKB(tenantId, clientId, destAgentName);
      }
      const finalContext = { ...destDeps, ...destContext };

      await streamAgent(destAgentName, tenantId, clientId, userInput, finalContext, customPrompt, modelLevel, sendEvent);

    // ── FLUXO TEXTO SIMPLES ──────────────────────────────────────────────
    } else if (agentConfig.type === 'text') {
      await streamAgent(agentName, tenantId, clientId, userInput, mergedContext, customPrompt, modelLevel, sendEvent);

    // ── AGENTE DE PESQUISA SEM DESTINO (execução normal) ─────────────────
    } else {
      sendEvent('log', { message: `Executando ${agentName}...` });
      const result = await runAgent({
        agentName, tenantId, clientId, userInput,
        modelLevel, customPrompt, context: mergedContext,
      });
      sendEvent('done', { agentName, historyId: result.historyId, textLength: result.text.length, fullText: result.text });
    }

  } catch (err) {
    console.error('[ERRO][RunStream] Erro no streaming', { agentName, error: err.message });
    sendEvent('error', { message: err.message });
  } finally {
    res.end();
  }
}

/**
 * Faz streaming de um agente de texto, salvando no histórico e KB ao final
 */
async function streamAgent(agentName, tenantId, clientId, userInput, context, customPrompt, modelLevel, sendEvent) {
  const agentModule = getAgent(agentName);
  const { agentConfig } = agentModule;
  const level = modelLevel || agentConfig.modelLevel;

  // Monta prompt com context injetado
  let systemPrompt = customPrompt || agentModule.getPrompt();
  systemPrompt = injectContext(systemPrompt, context);
  systemPrompt = withMarkdown(systemPrompt);

  sendEvent('generating', { agentName });

  let fullText = '';
  let modelUsed = '';

  for await (const chunk of runCompletionStream(level, systemPrompt, userInput, 4000)) {
    if (chunk.delta) {
      sendEvent('chunk', { delta: chunk.delta, agentName });
    }
    fullText = chunk.fullText;
    modelUsed = chunk.modelUsed;
  }

  // Salva no histórico
  const historyId = await queryOne(
    `INSERT INTO ai_agent_history (tenant_id, agent_name, model_used, prompt_sent, response_text, metadata, client_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [tenantId, agentName, modelUsed, systemPrompt, fullText, JSON.stringify({ userInput, level, streaming: true }), clientId]
  );

  // Salva na KB do cliente
  if (clientId && fullText) {
    try {
      await saveOutputToKB(tenantId, clientId, agentName, fullText);
    } catch (err) {
      console.error('[ERRO][RunStream] Falha ao salvar na KB', { agentName, error: err.message });
    }
  }

  sendEvent('done', { agentName, historyId: historyId?.id, textLength: fullText.length });
  console.log('[SUCESSO][RunStream] Streaming concluído', { agentName, modelUsed, textLength: fullText.length });
}
