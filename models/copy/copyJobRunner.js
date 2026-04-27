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
const { runCompletion, resolveModel } = require('./../ia/completion');
const { withMarkdown } = require('./../ia/markdownHelper');
const { updateSession, saveToHistory } = require('./copySession');
const { extractFromFile } = require('../../infra/api/fileReader');
const { buildGenerateSystem, buildGenerateUserMessage, buildModifySystem, formatCopyOutput } = require('./copyPrompt');

const KB_CATEGORIES = ['diagnostico', 'concorrentes', 'publico_alvo', 'avatar', 'posicionamento', 'oferta'];

// ── Helpers compartilhados ──────────────────────────────────────────────────

async function loadClientContext(tenantId, clientId, includeKB) {
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

async function describeImages(images, purpose) {
  if (!images?.length) return '';
  const { analyzeMultipleImages } = require('../../infra/api/vision');
  const imageUrls = images.map(img => img.base64);
  const visionResult = await analyzeMultipleImages(imageUrls, purpose, { detail: 'high' });
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
  const imagesDescription = await describeImages(images, 'Descreva as imagens para uso em copywriting de marketing.');

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

  let text, usage;
  if (modelOverride) {
    const apiModule = provider === 'Anthropic'
      ? require('../../infra/api/anthropic')
      : require('../../infra/api/openai');
    const result = await apiModule.generateCompletion(model, systemPrompt, userMessage, 4000);
    text = result.text;
    usage = result.usage;

    const { logUsage } = require('./tokenUsage');
    logUsage({
      tenantId, modelUsed: model, provider: provider.toLowerCase(),
      operationType: 'copy_generate', clientId, sessionId,
      tokensInput: usage.input, tokensOutput: usage.output,
    });
  } else {
    const result = await runCompletion('medium', systemPrompt, userMessage, 4000, {
      tenantId, clientId, sessionId, operationType: 'copy_generate',
    });
    text = result.text;
    usage = result.usage;
  }

  text = await formatCopyOutput(text);

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
  const imagesDescription = await describeImages(images, 'Descreva as imagens para uso em copywriting.');

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

  text = await formatCopyOutput(text);

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

// ── Async job processor ─────────────────────────────────────────────────────

async function createCopyJob({ tenantId, sessionId, clientId, kind, params }) {
  if (!['generate', 'improve'].includes(kind)) {
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
    `SELECT id, tenant_id, session_id, client_id, kind, status, result_text, history_id,
            error_message, created_at, started_at, finished_at
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
    };

    let result;
    if (job.kind === 'generate') {
      result = await runGenerateCopy({ ...params, ...baseParams });
    } else if (job.kind === 'improve') {
      result = await runImproveCopy({ ...params, ...baseParams });
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
    console.error('[ERRO][copyJobRunner:process]', { jobId, error: err.message });
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
  createCopyJob,
  getCopyJob,
  processCopyJob,
};
