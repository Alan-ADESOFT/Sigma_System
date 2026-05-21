/**
 * @fileoverview Runner unificado de geração e modificação de copy.
 *
 * Centraliza a lógica que antes vivia inline em pages/api/copy/generate.js e
 * pages/api/copy/improve.js. Os endpoints síncronos viraram thin wrappers que
 * chamam runGenerateCopy / runImproveCopy. O fluxo assíncrono novo
 * (/api/copy/jobs) usa processCopyJob para rodar em background via setImmediate
 * e registrar uma notificação em system_notifications ao concluir.
 */

const { query, queryOne } = require('../../infra/db');
const {
  runCompletion,
  resolveModel,
  runCompletionStream,
  runCompletionStreamWithModel,
} = require('./../ia/completion');
const { withMarkdown } = require('./../ia/markdownHelper');
const { updateSession, saveToHistory } = require('./copySession');
const { extractFromFile } = require('../../infra/api/fileReader');
const { buildGenerateSystem, buildGenerateUserMessage, buildModifySystem, formatCopyOutput } = require('./copyPrompt');
const { logUsage } = require('./tokenUsage');

const KB_CATEGORIES = ['diagnostico', 'concorrentes', 'publico_alvo', 'avatar', 'posicionamento', 'oferta'];

// ── Cache de contexto do cliente (TTL 60s, sem invalidacao manual) ──────────
// O ganho e cortar 1 SELECT + 1 SELECT KB por geracao quando o operador faz
// varias copies seguidas pro mesmo cliente. Janela de 60s e aceita: edicoes
// de KB ficam visiveis na proxima geracao apos a expiracao.
const _ctxCache = new Map();
const CTX_TTL_MS = 60_000;

function _ctxKey(tenantId, clientId, includeKB) {
  return `${tenantId}::${clientId}::${includeKB ? 1 : 0}`;
}

function _ctxGet(key) {
  const hit = _ctxCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CTX_TTL_MS) { _ctxCache.delete(key); return null; }
  return hit.v;
}

function _ctxSet(key, value) {
  _ctxCache.set(key, { t: Date.now(), v: value });
}

// ── Helpers compartilhados ──────────────────────────────────────────────────

async function loadClientContext(tenantId, clientId, includeKB) {
  const cacheKey = _ctxKey(tenantId, clientId || '_', includeKB);
  const cached = _ctxGet(cacheKey);
  if (cached) {
    console.log('[INFO][copyJobRunner] loadClientContext cache HIT', { clientId, includeKB });
    return cached;
  }
  const fresh = await _loadClientContextUncached(tenantId, clientId, includeKB);
  _ctxSet(cacheKey, fresh);
  return fresh;
}

async function _loadClientContextUncached(tenantId, clientId, includeKB) {
  if (!clientId) return { clientSummary: '', kbContext: '', clientShortContext: '' };

  const client = await queryOne(
    'SELECT company_name, niche, main_product, avg_ticket, main_problem, region FROM marketing_clients WHERE id = $1 AND tenant_id = $2',
    [clientId, tenantId]
  );
  if (!client) return { clientSummary: '', kbContext: '', clientShortContext: '' };

  const clientSummary = `\nRESUMO DO CLIENTE:\nEmpresa: ${client.company_name || 'N/A'}\nNicho: ${client.niche || 'N/A'}\nProduto principal: ${client.main_product || 'N/A'}\nTicket medio: ${client.avg_ticket || 'N/A'}\nPrincipal problema: ${client.main_problem || 'N/A'}\nRegiao: ${client.region || 'N/A'}`;
  const clientShortContext = `Cliente: ${client.company_name} | Nicho: ${client.niche || 'N/A'} | Produto: ${client.main_product || 'N/A'}`;

  let kbContext = '';
  if (includeKB) {
    const kbRows = await query(
      `SELECT category, key, value FROM ai_knowledge_base
       WHERE tenant_id = $1 AND client_id = $2 AND category = ANY($3)
       ORDER BY category, key`,
      [tenantId, clientId, KB_CATEGORIES]
    );
    if (kbRows.length > 0) {
      const kbParts = [];
      let currentCat = '';
      for (const row of kbRows) {
        if (row.category !== currentCat) {
          currentCat = row.category;
          kbParts.push(`\n--- ${currentCat.toUpperCase()} ---`);
        }
        kbParts.push((row.value || '').substring(0, 3000));
      }
      kbContext = `\nBASE DE DADOS DO CLIENTE:\n${kbParts.join('\n')}`;
    }
  }

  return { clientSummary, kbContext, clientShortContext };
}

async function extractFilesText(files) {
  if (!files?.length) return '';
  const parts = [];
  for (const file of files) {
    const base64Data = (file.base64 || '').split(',')[1] || file.base64;
    const buffer = Buffer.from(base64Data, 'base64');
    const result = await extractFromFile(buffer, file.mimeType, file.fileName);
    if (result.success && result.text) parts.push(`[${file.fileName}]\n${result.text.substring(0, 3000)}`);
  }
  return parts.join('\n---\n');
}

async function describeImages(images, purpose, trackOpts = {}) {
  if (!images?.length) return '';
  const { analyzeMultipleImages } = require('../../infra/api/vision');
  const imageUrls = images.map(img => img.base64);
  const visionResult = await analyzeMultipleImages(imageUrls, purpose, {
    detail: 'high',
    // Propaga tracking pra logar copy_vision em ai_token_usage
    tenantId: trackOpts.tenantId,
    clientId: trackOpts.clientId,
    sessionId: trackOpts.sessionId,
    operationType: 'copy_vision',
  });
  return visionResult.analysis || '';
}

// ── runGenerateCopy ─────────────────────────────────────────────────────────

async function runGenerateCopy(params) {
  const {
    tenantId, sessionId, clientId, structureId,
    modelOverride, promptRaiz, tone, images, files,
  } = params;

  if (!sessionId || !promptRaiz) {
    throw new Error('sessionId e promptRaiz sao obrigatorios');
  }

  console.log('[INFO][copyJobRunner:generate] start', { sessionId, clientId, structureId });

  let structureName = '';
  let structurePromptBase = '';
  if (structureId) {
    const structure = await queryOne(
      'SELECT name, prompt_base FROM copy_structures WHERE id = $1 AND tenant_id = $2',
      [structureId, tenantId]
    );
    if (structure) {
      structureName = structure.name;
      structurePromptBase = structure.prompt_base;
    }
  }

  const { clientSummary, kbContext } = await loadClientContext(tenantId, clientId, true);
  const filesContent = await extractFilesText(files);
  const imagesDescription = await describeImages(
    images,
    'Descreva as imagens para uso em copywriting de marketing.',
    { tenantId, clientId, sessionId }
  );

  let systemPrompt = buildGenerateSystem({
    clientSummary, kbContext,
    structureName, structurePrompt: structurePromptBase,
    tone, imagesDescription, filesContent,
  });
  systemPrompt = withMarkdown(systemPrompt);

  const userMessage = buildGenerateUserMessage(promptRaiz, !!structurePromptBase);

  let model = modelOverride;
  if (!model) {
    const { getSetting } = require('../settings.model');
    const savedModel = await getSetting(tenantId, 'copy_model');
    model = savedModel || resolveModel('medium');
  }
  const provider = model.toLowerCase().includes('claude') ? 'Anthropic' : 'OpenAI';

  // Streaming: o iterator escreve partial_text no job a cada N chars,
  // permitindo que o SSE em /api/copy/jobs/[id]/stream entregue caractere
  // por caractere ao frontend. O job e identificado por sessionId+pending,
  // mas vamos receber jobId via params quando o caller for o processCopyJob
  // — fora dele (uso direto dos endpoints sincronos legados) `jobId` fica
  // null e o partial_text simplesmente nao e gravado.
  const jobId = params.__jobId || null;
  const streamIter = modelOverride
    ? runCompletionStreamWithModel(model, systemPrompt, userMessage, 4000)
    : runCompletionStream('medium', systemPrompt, userMessage, 4000);

  let text = '';
  let usage = { input: 0, output: 0, total: 0 };
  let lastFlushAt = 0;
  let lastFlushLen = 0;

  for await (const chunk of streamIter) {
    if (chunk.done) {
      text = chunk.fullText;
      if (chunk.usage) usage = chunk.usage;
      break;
    }
    // Flush partial_text a cada 60 chars OU 400ms — evita 1 update por token
    if (jobId) {
      const now = Date.now();
      if (chunk.fullText.length - lastFlushLen >= 60 || now - lastFlushAt >= 400) {
        lastFlushLen = chunk.fullText.length;
        lastFlushAt = now;
        // Fire-and-forget — nao bloqueia o stream se o UPDATE atrasar
        query(
          `UPDATE copy_generation_jobs SET partial_text = $2 WHERE id = $1`,
          [jobId, chunk.fullText]
        ).catch(() => {});
      }
    }
  }

  // Loga tokens reais coletados via stream_options.include_usage / message_delta
  logUsage({
    tenantId, modelUsed: model, provider: provider.toLowerCase(),
    operationType: 'copy_generate', clientId, sessionId,
    tokensInput: usage.input, tokensOutput: usage.output,
  });

  text = await formatCopyOutput(text, { tenantId, clientId, sessionId });

  await updateSession(sessionId, {
    client_id: clientId || null,
    structure_id: structureId || null,
    model_used: model,
    prompt_raiz: promptRaiz,
    output_text: text,
    tone: tone || null,
    status: 'draft',
  });

  const historyEntry = await saveToHistory(
    sessionId, tenantId, model, systemPrompt.substring(0, 2000),
    text, 'generate', usage || {}
  );

  console.log('[SUCESSO][copyJobRunner:generate]', { sessionId, model, len: text.length });
  return { text, historyId: historyEntry.id, model, usage: usage || null };
}

// ── runImproveCopy ──────────────────────────────────────────────────────────

async function runImproveCopy(params) {
  const {
    tenantId, sessionId, currentOutput, instruction, clientId,
    modelOverride, images, files, tone,
  } = params;

  if (!sessionId || !instruction) {
    throw new Error('sessionId e instruction sao obrigatorios');
  }

  console.log('[INFO][copyJobRunner:improve] start', { sessionId, clientId });

  const { clientShortContext } = await loadClientContext(tenantId, clientId, false);
  const filesContent = await extractFilesText(files);
  const imagesDescription = await describeImages(
    images,
    'Descreva as imagens para uso em copywriting.',
    { tenantId, clientId, sessionId }
  );

  let systemPrompt = buildModifySystem({
    currentOutput, clientContext: clientShortContext, imagesDescription, filesContent,
  });
  systemPrompt = withMarkdown(systemPrompt);

  // Resolução de modelo: respeita modelOverride; senão usa 'weak' (reescrita barata)
  let model = modelOverride || resolveModel('weak');
  const provider = model.toLowerCase().includes('claude') ? 'Anthropic' : 'OpenAI';

  let text, usage;
  if (modelOverride) {
    const apiModule = provider === 'Anthropic'
      ? require('../../infra/api/anthropic')
      : require('../../infra/api/openai');
    const result = await apiModule.generateCompletion(model, systemPrompt, instruction, 4000);
    text = result.text;
    usage = result.usage;

    const { logUsage } = require('./tokenUsage');
    logUsage({
      tenantId, modelUsed: model, provider: provider.toLowerCase(),
      operationType: 'copy_modify', clientId, sessionId,
      tokensInput: usage.input, tokensOutput: usage.output,
    });
  } else {
    const result = await runCompletion('weak', systemPrompt, instruction, 4000, {
      tenantId, clientId, sessionId, operationType: 'copy_modify',
    });
    text = result.text;
    usage = result.usage;
  }

  text = await formatCopyOutput(text, { tenantId, clientId, sessionId });

  await updateSession(sessionId, {
    output_text: text,
    ...(tone ? { tone } : {}),
  });

  const historyEntry = await saveToHistory(
    sessionId, tenantId, model, systemPrompt.substring(0, 2000),
    text, 'modify', usage || {}
  );

  console.log('[SUCESSO][copyJobRunner:improve]', { sessionId, len: text.length });
  return { text, historyId: historyEntry.id, model, usage: usage || null };
}

// ── runImproveText ──────────────────────────────────────────────────────────
// Revisao linguistica em background — espelha o endpoint legado
// /api/agentes/improve-text mas roda como job pra atualizar o sininho e
// permitir que o operador feche o modal sem perder o resultado.
//
// Modos:
//   'full'      — revisor linguistico completo (acentos/concordancia)
//   'selection' — reescrita pontual de um trecho

const PROMPT_IMPROVE_FULL = `Voce e um revisor linguistico de portugues brasileiro.

Recebeu um documento completo de marketing. Sua tarefa e EXCLUSIVAMENTE:
1. Corrigir acentuacao
2. Corrigir conjugacoes verbais erradas
3. Corrigir concordancia nominal e verbal
4. Corrigir ortografia
5. Manter pontuacao adequada

REGRAS ABSOLUTAS:
- NAO reescreva frases — apenas corrija erros linguisticos
- NAO mude palavras por sinonimos
- NAO altere a estrutura, ordem ou formatacao do texto
- NAO adicione nem remova conteudo
- Mantenha toda formatacao markdown (**, *, ##, ###, -)
- Retorne o documento INTEIRO com as correcoes aplicadas`;

const PROMPT_IMPROVE_SELECTION = `Voce e um editor de texto profissional de portugues brasileiro.

Recebeu um TRECHO selecionado de um documento de marketing. Sua tarefa:
1. Melhore a clareza e fluidez do trecho
2. Corrija erros de gramatica, ortografia e acentuacao
3. Mantenha o significado e tom originais
4. Mantenha a formatacao markdown (**, *, ##, ###, -)
5. Retorne APENAS o trecho melhorado, nada mais

NAO adicione informacoes novas. NAO mude a estrutura.`;

async function runImproveText(params) {
  const { tenantId, sessionId, clientId, text, mode = 'full' } = params;

  if (!sessionId || !text) {
    throw new Error('sessionId e text sao obrigatorios');
  }

  console.log('[INFO][copyJobRunner:improveText] start', { sessionId, mode, len: text.length });

  const systemPrompt = mode === 'selection' ? PROMPT_IMPROVE_SELECTION : PROMPT_IMPROVE_FULL;
  const model = resolveModel('weak');

  const result = await runCompletion('weak', systemPrompt, text, 4000, {
    tenantId, clientId, sessionId, operationType: 'copy_improve_text',
  });
  let improved = result.text || text;

  // No modo full, reaplica o formatador pra garantir markdown consistente
  if (mode === 'full') improved = await formatCopyOutput(improved, { tenantId, clientId, sessionId });

  // Atualiza a sessao com o texto revisado (mesmo padrao do improve)
  await updateSession(sessionId, { output_text: improved });

  // Salva no historico como acao 'improve_text' pra ficar visivel no painel
  const historyEntry = await saveToHistory(
    sessionId, tenantId, model, systemPrompt.substring(0, 2000),
    improved, 'improve_text', result.usage || {}
  );

  console.log('[SUCESSO][copyJobRunner:improveText]', { sessionId, len: improved.length });
  return { text: improved, historyId: historyEntry.id, model, usage: result.usage || null };
}

// ── Async job processor ─────────────────────────────────────────────────────

async function createCopyJob({ tenantId, sessionId, clientId, kind, params }) {
  if (!['generate', 'improve', 'improve_text'].includes(kind)) {
    throw new Error('kind invalido: ' + kind);
  }
  const job = await queryOne(
    `INSERT INTO copy_generation_jobs (tenant_id, session_id, client_id, kind, params, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'pending') RETURNING *`,
    [tenantId, sessionId, clientId || null, kind, JSON.stringify(params || {})]
  );
  return job;
}

async function getCopyJob(jobId, tenantId) {
  return queryOne(
    `SELECT id, tenant_id, session_id, client_id, kind, status, result_text, partial_text,
            history_id, error_message, created_at, started_at, finished_at
       FROM copy_generation_jobs
      WHERE id = $1 AND tenant_id = $2`,
    [jobId, tenantId]
  );
}

async function notifyJobDone(job, kind) {
  try {
    const titlePrefix = kind === 'generate' ? 'Copy gerada' : 'Copy modificada';
    const preview = (job.result_text || '').replace(/[\n\r]+/g, ' ').slice(0, 120);
    await queryOne(
      `INSERT INTO system_notifications (tenant_id, type, title, message, client_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [
        job.tenant_id,
        'copy_job_done',
        titlePrefix,
        preview || 'Pronto para revisar.',
        job.client_id,
        JSON.stringify({ jobId: job.id, sessionId: job.session_id, kind }),
      ]
    );
    try { require('../../infra/cache').invalidate(`notif:count:${job.tenant_id}`); } catch {}
  } catch (err) {
    console.error('[AVISO][copyJobRunner] Falha ao notificar (silenciado)', { error: err.message });
  }
}

async function notifyJobError(job, errorMessage) {
  try {
    await queryOne(
      `INSERT INTO system_notifications (tenant_id, type, title, message, client_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [
        job.tenant_id,
        'copy_job_error',
        'Falha ao gerar copy',
        (errorMessage || 'Erro desconhecido').slice(0, 240),
        job.client_id,
        JSON.stringify({ jobId: job.id, sessionId: job.session_id, kind: job.kind }),
      ]
    );
    try { require('../../infra/cache').invalidate(`notif:count:${job.tenant_id}`); } catch {}
  } catch {}
}

/**
 * Executa um job de copy em background. Não lança — registra erro no banco.
 * Idempotente: se o job já está running/done/error, retorna sem fazer nada.
 */
async function processCopyJob(jobId) {
  let job;
  try {
    job = await queryOne(
      `UPDATE copy_generation_jobs
          SET status = 'running', started_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [jobId]
    );
    if (!job) {
      console.log('[INFO][copyJobRunner:process] job ja em outro estado, pulando', { jobId });
      return;
    }

    const params = job.params || {};
    const baseParams = {
      tenantId: job.tenant_id,
      sessionId: job.session_id,
      clientId: job.client_id || params.clientId,
      // Sentinel pra runGenerateCopy gravar partial_text durante o stream
      __jobId: job.id,
    };

    let result;
    if (job.kind === 'generate') {
      result = await runGenerateCopy({ ...params, ...baseParams });
    } else if (job.kind === 'improve') {
      result = await runImproveCopy({ ...params, ...baseParams });
    } else if (job.kind === 'improve_text') {
      result = await runImproveText({ ...params, ...baseParams });
    } else {
      throw new Error('kind desconhecido: ' + job.kind);
    }

    const updated = await queryOne(
      `UPDATE copy_generation_jobs
          SET status = 'done', result_text = $2, history_id = $3, finished_at = now()
        WHERE id = $1 RETURNING *`,
      [jobId, result.text, result.historyId || null]
    );
    await notifyJobDone(updated, job.kind);
  } catch (err) {
    console.error('[ERRO][copyJobRunner:process]', {
      jobId,
      error: err.message,
      pgCode: err.code,
      pgColumn: err.column,
      pgTable: err.table,
      pgConstraint: err.constraint,
      pgRoutine: err.routine,
      pgWhere: err.where,
      stack: err.stack?.split('\n').slice(0, 5).join('\n'),
    });
    if (job) {
      try {
        await query(
          `UPDATE copy_generation_jobs
              SET status = 'error', error_message = $2, finished_at = now()
            WHERE id = $1`,
          [jobId, (err.message || 'erro').slice(0, 1000)]
        );
        await notifyJobError(job, err.message);
      } catch {}
    }
  }
}

module.exports = {
  runGenerateCopy,
  runImproveCopy,
  runImproveText,
  createCopyJob,
  getCopyJob,
  processCopyJob,
};
