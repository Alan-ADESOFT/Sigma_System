/**
 * @fileoverview Worker em background do Gerador de Imagem
 * @description Roda dentro do `server/instrumentation.js` no boot do Next.
 *   · Polling adaptativo: 2s normal, 5s ocioso, retorna pra 2s ao pegar job
 *   · MAX_CONCURRENT por instância = 3 (configurável)
 *   · Acordado imediatamente por imageJobEmitter quando /generate cria job
 *   · Cron diário às 03:00 chama cleanup_image_jobs() + remove arquivos órfãos
 *
 * MULTI-INSTANCE: este worker NÃO é safe pra rodar em múltiplas instâncias
 * em paralelo (não temos lock distribuído nem advisory locks no SELECT).
 * Em produção multi-instance, mantenha apenas 1 instância com worker ativo
 * e use Vercel Cron chamando /api/setup/image-cleanup nas demais.
 *
 * Para desabilitar o worker (CI, build, ambientes específicos):
 *   IMAGE_WORKER_ENABLED=false
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const {
  getQueuedJobs, getJobById,
  markStarted, markCompleted, markError,
  updateJobStatus,
} = require('../models/imageJob.model');
const { getActiveBrandbook } = require('../models/brandbook.model');
const {
  getOrCreate: getSettings,
  getWithDecryptedKeys,
} = require('../models/imageSettings.model');
const { logAudit } = require('../models/imageAudit.model');
const { logUsage } = require('../models/copy/tokenUsage');
const { createNotification } = require('../models/clientForm');
const { optimizePrompt } = require('../models/agentes/imagecreator/promptEngineer');
const { calculateCost } = require('../models/agentes/imagecreator/costCalculator');
const { friendlyMessage } = require('../models/agentes/imagecreator/errorMessages');
const { describeReferences } = require('../models/agentes/imagecreator/referenceVision');
const { generateImage } = require('../infra/api/imageProviders');
const { onWakeup } = require('../infra/imageJobEmitter');
const { query, queryOne } = require('../infra/db');

// ── Constantes ──────────────────────────────────────────────────────────────
// OTIMIZAÇÃO: backoff de 3 níveis. Muitos minutos ociosos não devem custar
// 1800 queries/hora ao Neon. Cada nível só é acionado depois de N ciclos.
const POLL_FAST_MS  = 2000;
const POLL_MED_MS   = 5000;
const POLL_SLOW_MS  = 10000;
const IDLE_THRESHOLD_MED  = 5;   // 5 ciclos vazios → 5s
const IDLE_THRESHOLD_SLOW = 20;  // 20 ciclos vazios → 10s
const MAX_CONCURRENT = 3;
const CLEANUP_HOUR = 3;         // 03:00 local
const CLEANUP_MINUTE = 0;

// Mapa: model amigável → provider (espelha o do generate.js)
const MODEL_TO_PROVIDER = {
  'imagen-4':       'vertex',
  'imagen-4-fast':  'vertex',
  'imagen-3':       'vertex',
  'gpt-image-1':    'openai',
  'flux-1.1-pro':   'fal',
  'nano-banana':    'gemini',
};

let pollInterval = null;
let cleanupInterval = null;
let consecutiveIdle = 0;
let currentPollMs = POLL_FAST_MS;
let running = 0;
let processingIds = new Set();
let unsubWakeup = null;

// TELEMETRIA: stats expostas pelo endpoint /api/image/_health
const stats = {
  startedAt:        null,
  totalProcessed:   0,
  totalErrors:      0,
  totalCancelled:   0,
  lastCompletedAt:  null,
  lastErrorAt:      null,
  lastCleanupAt:    null,
  lastCleanupResult: null,
};

// ── Storage ─────────────────────────────────────────────────────────────────

/**
 * Resolve o caminho de saída para imagem gerada.
 * Estrutura: public/uploads/generated/{tenantId}/{yyyy-mm}/{jobId}.{ext}
 */
function buildOutputPath(tenantId, jobId, ext) {
  const ym = new Date().toISOString().slice(0, 7); // 2026-04
  const dir = path.join('uploads', 'generated', tenantId, ym);
  return {
    relativeDir:  dir,
    absoluteDir:  path.join(process.cwd(), 'public', dir),
    publicUrl:    `/${dir}/${jobId}.${ext}`,
    publicThumb:  `/${dir}/thumbs/${jobId}.webp`,
    absolutePath: path.join(process.cwd(), 'public', dir, `${jobId}.${ext}`),
    thumbAbsDir:  path.join(process.cwd(), 'public', dir, 'thumbs'),
    thumbAbsPath: path.join(process.cwd(), 'public', dir, 'thumbs', `${jobId}.webp`),
  };
}

function extFromMime(mime) {
  if (!mime) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'png';
}

async function saveImage(tenantId, jobId, imageBuffer, mimeType) {
  const ext = extFromMime(mimeType);
  const paths = buildOutputPath(tenantId, jobId, ext);
  await fs.mkdir(paths.absoluteDir, { recursive: true });
  await fs.mkdir(paths.thumbAbsDir, { recursive: true });
  await fs.writeFile(paths.absolutePath, imageBuffer);

  // Thumbnail 256px webp quality 80
  await sharp(imageBuffer)
    .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(paths.thumbAbsPath);

  return {
    publicUrl:   paths.publicUrl,
    publicThumb: paths.publicThumb,
  };
}

// ── Pipeline principal de processamento ─────────────────────────────────────

/**
 * Processa um job individual. NÃO lança — captura tudo internamente.
 * @param {object} job - linha de image_jobs
 */
async function processJob(job) {
  const t0 = Date.now();
  console.log('[INFO][Worker:imageJob] iniciando', { jobId: job.id });

  await markStarted(job.id);

  try {
    // 1. Carrega settings com chaves descriptografadas
    const settings = await getWithDecryptedKeys(job.tenant_id);

    // 2. Brandbook (se houver)
    let brandbook = null;
    if (job.brandbook_id) {
      brandbook = await getActiveBrandbook(job.client_id, job.tenant_id);
    }

    // 2.5. Descreve as imagens de referência via Vision (se houver).
    // Sem isso, os providers de imagem geram resultado genérico ignorando
    // completamente o conteúdo das imagens enviadas pelo usuário.
    const refUrls = (() => {
      try {
        if (Array.isArray(job.reference_image_urls)) return job.reference_image_urls;
        return JSON.parse(job.reference_image_urls || '[]');
      } catch { return []; }
    })();

    let referenceDescriptions = [];
    let refTokens = 0;
    if (refUrls.length > 0) {
      const refResult = await describeReferences({
        urls:     refUrls,
        tenantId: job.tenant_id,
        clientId: job.client_id,
        jobId:    job.id,
      });
      referenceDescriptions = refResult.descriptions;
      refTokens = refResult.tokens || 0;
    }

    // 3. Prompt Engineer (otimiza + cache por hash) — recebe as descrições
    const optResult = await optimizePrompt({
      rawDescription:  job.raw_description,
      brandbook,
      format:          job.format,
      aspectRatio:     job.aspect_ratio,
      model:           job.model,
      observations:    job.observations,
      negativePrompt:  job.negative_prompt,
      referenceDescriptions, // <- agora propagado pro system prompt
      tenantId: job.tenant_id,
      userId:   job.user_id,
      jobId:    job.id,
    });

    await updateJobStatus(job.id, 'running', {
      optimizedPrompt: optResult.prompt,
      promptHash:      optResult.hash,
      tokensInput:     optResult.tokensInput,
      tokensOutput:    optResult.tokensOutput,
    });

    // 4. Resolve provider — pode ter mudado em regenerate
    const provider = MODEL_TO_PROVIDER[job.model] || job.provider;

    // 5. Gera a imagem.
    // As referências NÃO são passadas como bytes pros providers atuais —
    // a descrição textual já foi injetada no `optResult.prompt` na etapa 3.
    // Imagen 4 e GPT Image 1 não suportam image-to-image; Flux teria via
    // /redux endpoint e Gemini suporta inlineData — sprint futura.
    const result = await generateImage({
      provider,
      model:           job.model,
      prompt:          optResult.prompt,
      negativePrompt:  job.negative_prompt,
      width:           job.width,
      height:          job.height,
      aspectRatio:     job.aspect_ratio,
      settings,
    });

    // 6. Salva imagem + thumbnail
    const saved = await saveImage(job.tenant_id, job.id, result.imageBuffer, result.mimeType);

    // 7. Calcula custo (imagem + LLM do prompt engineer + Vision das refs).
    // Os tokens da Vision são adicionados como input do LLM — é uma
    // aproximação razoável (Vision e Prompt Engineer rodam no mesmo gpt-4o
    // family, preço similar por token).
    const cost = calculateCost({
      provider,
      model:        job.model,
      width:        job.width,
      height:       job.height,
      tokensInput:  (optResult.tokensInput || 0) + refTokens,
      tokensOutput: optResult.tokensOutput,
      llmModel:     settings.prompt_engineer_model,
    });

    const durationMs = Date.now() - t0;

    // 8. Marca como done
    await markCompleted(job.id, {
      resultImageUrl:     saved.publicUrl,
      resultThumbnailUrl: saved.publicThumb,
      resultMetadata:     result.metadata,
      durationMs,
      costUsd:            cost,
    });

    // 9. Loga uso de tokens (LLM do Prompt Engineer)
    if (optResult.tokensInput || optResult.tokensOutput) {
      logUsage({
        tenantId:     job.tenant_id,
        modelUsed:    settings.prompt_engineer_model,
        provider:     'openai', // identificável pelo modelUsed; ajuste se claude
        operationType: 'image_generation',
        clientId:     job.client_id,
        sessionId:    job.id,
        tokensInput:  optResult.tokensInput,
        tokensOutput: optResult.tokensOutput,
        metadata:     { provider, model: job.model, costUsd: cost },
      });
    } else {
      // Mesmo sem tokens (cache hit), registra a geração como uma operação
      logUsage({
        tenantId:      job.tenant_id,
        modelUsed:     job.model,
        provider,
        operationType: 'image_generation',
        clientId:      job.client_id,
        sessionId:     job.id,
        tokensInput:   0,
        tokensOutput:  0,
        metadata:      { costUsd: cost, fromCache: true },
      });
    }

    // 10. Notificação no sininho
    try {
      await createNotification(
        job.tenant_id,
        'image_done',
        'Imagem gerada',
        `Sua imagem (${job.format}, ${job.model}) ficou pronta.`,
        job.client_id,
        { jobId: job.id, link: `/dashboard/image?job=${job.id}` }
      );
    } catch (e) {
      console.warn('[WARN][Worker:imageJob] notificação de sucesso falhou', { error: e.message });
    }

    stats.totalProcessed++;
    stats.lastCompletedAt = new Date().toISOString();
    console.log('[SUCESSO][Worker:imageJob] concluído', {
      jobId: job.id, ms: durationMs, cost, fromCache: optResult.fromCache,
    });

  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt = new Date().toISOString();
    const code = err.code || 'PROVIDER_ERROR';
    console.error('[ERRO][Worker:imageJob] falha', {
      jobId: job.id, code, error: err.message, stack: err.stack,
    });

    // Marca como error e seta duration parcial
    try {
      await markError(job.id, err);
    } catch (markErr) {
      console.error('[ERRO][Worker:imageJob] falha ao marcar erro', { error: markErr.message });
    }

    // Audit log para falhas de moderação ou rate limit
    if (code === 'CONTENT_BLOCKED' || code === 'RATE_LIMITED') {
      await logAudit({
        tenantId: job.tenant_id, userId: job.user_id,
        action: code === 'CONTENT_BLOCKED' ? 'content_blocked' : 'rate_limit_hit',
        details: { jobId: job.id, model: job.model, provider: job.provider, message: err.message },
      });
    }

    // Notificação amigável (sem stack). Mensagem padronizada vem de
    // models/agentes/imagecreator/errorMessages.js — útil também pro frontend.
    try {
      const friendly = friendlyMessage(code, err.message);
      await createNotification(
        job.tenant_id,
        'image_error',
        'Falha ao gerar imagem',
        friendly,
        job.client_id,
        { jobId: job.id, errorCode: code }
      );
    } catch {}
  }
}

// ── Loop de polling ─────────────────────────────────────────────────────────

async function tick() {
  if (running >= MAX_CONCURRENT) return;
  const slots = MAX_CONCURRENT - running;

  let jobs;
  try {
    jobs = await getQueuedJobs(slots);
  } catch (err) {
    console.error('[ERRO][Worker:tick] falha ao buscar fila', { error: err.message });
    return;
  }

  // Pula jobs que já estão sendo processados nesta mesma instância
  jobs = jobs.filter(j => !processingIds.has(j.id));

  if (jobs.length === 0) {
    consecutiveIdle++;
    // Backoff em 3 níveis: 2s → 5s (5 ciclos) → 10s (20 ciclos)
    if (consecutiveIdle >= IDLE_THRESHOLD_SLOW && currentPollMs !== POLL_SLOW_MS) {
      console.log('[INFO][Worker] modo idle profundo (10s polling)');
      switchPollSpeed(POLL_SLOW_MS);
    } else if (consecutiveIdle >= IDLE_THRESHOLD_MED && currentPollMs === POLL_FAST_MS) {
      console.log('[INFO][Worker] entrando em modo idle (5s polling)');
      switchPollSpeed(POLL_MED_MS);
    }
    return;
  }

  // Saiu da ociosidade — volta pro polling rápido
  if (consecutiveIdle > 0 || currentPollMs !== POLL_FAST_MS) {
    consecutiveIdle = 0;
    if (currentPollMs !== POLL_FAST_MS) {
      console.log('[INFO][Worker] saindo do modo idle');
      switchPollSpeed(POLL_FAST_MS);
    }
  }

  for (const j of jobs) {
    if (running >= MAX_CONCURRENT) break;
    running++;
    processingIds.add(j.id);
    processJob(j).finally(() => {
      running--;
      processingIds.delete(j.id);
    });
  }
}

function switchPollSpeed(ms) {
  if (currentPollMs === ms) return;
  currentPollMs = ms;
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => { tick().catch(() => {}); }, ms);
}

// ── Cleanup diário ──────────────────────────────────────────────────────────

/**
 * Chama cleanup_image_jobs() (delete jobs >7d e audit >90d) e remove arquivos
 * físicos órfãos (não referenciados em nenhum job).
 *
 * Retorna stats consolidadas:
 *   { deletedJobs, deletedAuditLogs, freedBytes, freedMB, duration_ms, errors }
 *
 * NOTA: deletedJobs/deletedAuditLogs vêm de cleanup_image_jobs() que executa
 * DELETE puro sem RETURNING (PL/pgSQL retorna void). Para contar, fazemos
 * um SELECT COUNT() ANTES de chamar a função.
 */
async function cleanupOldJobs() {
  const t0 = Date.now();
  console.log('[INFO][Worker:cleanup] iniciando cleanup');

  const result = {
    deletedJobs:        0,
    deletedAuditLogs:   0,
    freedBytes:         0,
    freedMB:            '0.0',
    orphanFilesRemoved: 0,
    errors:             [],
  };

  // 1. Conta o que SERÁ apagado (antes de executar) — pra ter números úteis
  try {
    const jobsCountRow = await queryOne(
      `SELECT COUNT(*)::int AS n FROM image_jobs
        WHERE created_at < now() - interval '7 days'
          AND status IN ('done','error','cancelled')`
    );
    result.deletedJobs = jobsCountRow?.n || 0;

    const auditCountRow = await queryOne(
      `SELECT COUNT(*)::int AS n FROM image_audit_log
        WHERE created_at < now() - interval '90 days'`
    );
    result.deletedAuditLogs = auditCountRow?.n || 0;
  } catch (err) {
    result.errors.push(`count: ${err.message}`);
  }

  // 2. PRIMEIRO: deletar arquivos físicos dos jobs que vão sumir, pra
  //    contabilizar bytes liberados ANTES do DELETE (depois não dá pra
  //    descobrir os caminhos).
  let bytesFromKnownJobs = 0;
  try {
    const oldJobs = await query(
      `SELECT id, result_image_url, result_thumbnail_url, tenant_id
         FROM image_jobs
        WHERE created_at < now() - interval '7 days'
          AND status IN ('done','error','cancelled')`
    );
    for (const j of oldJobs) {
      bytesFromKnownJobs += await unlinkAndSize(j.result_image_url);
      bytesFromKnownJobs += await unlinkAndSize(j.result_thumbnail_url);
    }
  } catch (err) {
    result.errors.push(`physical-delete: ${err.message}`);
  }

  // 3. AGORA chama a função SQL — DELETE em massa
  try {
    await query('SELECT cleanup_image_jobs()');
    console.log('[SUCESSO][Worker:cleanup] cleanup_image_jobs() executado');
  } catch (err) {
    console.error('[ERRO][Worker:cleanup] cleanup_image_jobs falhou', { error: err.message });
    result.errors.push(`sql-cleanup: ${err.message}`);
  }

  // 4. Remoção de órfãos físicos (arquivos sem job correspondente em pastas antigas)
  try {
    const baseDir = path.join(process.cwd(), 'public', 'uploads', 'generated');
    const orphanResult = await removeOrphanFiles(baseDir);
    result.orphanFilesRemoved = orphanResult.removed;
    result.freedBytes = bytesFromKnownJobs + orphanResult.bytes;
  } catch (err) {
    console.warn('[WARN][Worker:cleanup] limpeza de órfãos falhou', { error: err.message });
    result.errors.push(`orphan-cleanup: ${err.message}`);
    result.freedBytes = bytesFromKnownJobs;
  }

  result.freedMB = (result.freedBytes / 1024 / 1024).toFixed(1);
  result.duration_ms = Date.now() - t0;

  stats.lastCleanupAt = new Date().toISOString();
  stats.lastCleanupResult = result;

  console.log('[SUCESSO][Worker:cleanup] cleanup concluído', result);
  return result;
}

/**
 * Tenta remover um arquivo do /uploads/ e retorna o tamanho que estava
 * ocupando. Se não existir ou falhar, retorna 0.
 */
async function unlinkAndSize(internalUrl) {
  if (!internalUrl || !String(internalUrl).startsWith('/uploads/')) return 0;
  if (String(internalUrl).includes('..')) return 0;
  const fullPath = path.join(process.cwd(), 'public', internalUrl);
  try {
    const stat = await fs.stat(fullPath);
    const size = stat.size;
    await fs.unlink(fullPath);
    return size;
  } catch {
    return 0;
  }
}

/**
 * Percorre pastas antigas (>30 dias) e remove arquivos cujo jobId não
 * corresponde a nenhum job ativo. Retorna { removed, bytes }.
 */
async function removeOrphanFiles(baseDir) {
  let removed = 0;
  let bytes = 0;
  let tenantsDirs;
  try {
    tenantsDirs = await fs.readdir(baseDir);
  } catch {
    return { removed, bytes };
  }

  for (const tenantDir of tenantsDirs) {
    const tenantPath = path.join(baseDir, tenantDir);
    let monthDirs;
    try { monthDirs = await fs.readdir(tenantPath); } catch { continue; }
    for (const monthDir of monthDirs) {
      const monthPath = path.join(tenantPath, monthDir);
      let stat;
      try { stat = await fs.stat(monthPath); } catch { continue; }
      if (!stat.isDirectory()) continue;
      // Pula pastas recentes (< 30 dias) — arquivos podem estar associados
      // a jobs ainda na janela ativa.
      const ageDays = (Date.now() - stat.mtimeMs) / (24 * 3600 * 1000);
      if (ageDays < 30) continue;

      let files;
      try { files = await fs.readdir(monthPath); } catch { continue; }

      for (const file of files) {
        if (file === 'thumbs') continue;
        const fullPath = path.join(monthPath, file);
        const idMatch = file.match(/^([a-f0-9-]{20,40})\./i);
        if (!idMatch) continue;
        const jobId = idMatch[1];

        // Job ainda existe?
        const job = await getJobById(jobId).catch(() => null);
        if (job) continue;

        try {
          const fst = await fs.stat(fullPath);
          await fs.unlink(fullPath);
          bytes += fst.size;
          removed++;
          // Thumb correspondente
          const thumbPath = path.join(monthPath, 'thumbs', `${jobId}.webp`);
          try {
            const tst = await fs.stat(thumbPath);
            await fs.unlink(thumbPath);
            bytes += tst.size;
            removed++;
          } catch {}
        } catch {}
      }
    }
  }
  return { removed, bytes };
}

// ── Bootstrap do worker ─────────────────────────────────────────────────────

/**
 * Schedules a function to run when the next 03:00 strikes, then every 24h.
 */
function scheduleDaily(fn) {
  const next = new Date();
  next.setHours(CLEANUP_HOUR, CLEANUP_MINUTE, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setDate(next.getDate() + 1);
  }
  const delay = next.getTime() - Date.now();
  console.log('[INFO][Worker] cleanup agendado', { runAt: next.toISOString(), inMs: delay });

  setTimeout(() => {
    fn().catch((err) => console.error('[ERRO][Worker] cleanup primeiro tick falhou', { error: err.message }));
    cleanupInterval = setInterval(() => {
      fn().catch((err) => console.error('[ERRO][Worker] cleanup tick falhou', { error: err.message }));
    }, 24 * 3600 * 1000);
  }, delay);
}

/**
 * Inicia o worker (chamado pelo instrumentation.js).
 * Idempotente — chamadas repetidas não criam múltiplos intervals.
 */
function startImageWorker() {
  if (process.env.IMAGE_WORKER_ENABLED === 'false') {
    console.log('[INFO][Worker] desabilitado via IMAGE_WORKER_ENABLED=false');
    return;
  }
  if (pollInterval) {
    console.log('[INFO][Worker] já estava rodando — ignorado');
    return;
  }

  // HARDENING: smoke test do encryption antes de processar QUALQUER job.
  // Se a chave não funciona, decifrar API keys vai gerar lixo no banco
  // e jobs vão falhar silenciosamente. Falha aqui é fatal pro worker.
  try {
    const { encrypt, decrypt } = require('../infra/encryption');
    const probe = decrypt(encrypt('sigma-encryption-probe'));
    if (probe !== 'sigma-encryption-probe') {
      throw new Error('round-trip mismatch');
    }
  } catch (err) {
    console.error('[ERRO CRÍTICO][Worker] encryption probe falhou — worker NÃO iniciado', {
      error: err.message,
      hint: 'Verifique IMAGE_ENCRYPTION_KEY no .env (32 bytes em base64). Veja docs em infra/encryption.js',
    });
    return;
  }

  console.log('[INFO][Worker] iniciando', {
    fastMs: POLL_FAST_MS, medMs: POLL_MED_MS, slowMs: POLL_SLOW_MS,
    maxConcurrent: MAX_CONCURRENT,
  });
  stats.startedAt = new Date().toISOString();

  // Roda 1 tick imediato
  tick().catch((err) => console.error('[ERRO][Worker] tick inicial falhou', { error: err.message }));

  pollInterval = setInterval(() => {
    tick().catch((err) => console.error('[ERRO][Worker] tick periódico falhou', { error: err.message }));
  }, currentPollMs);

  // Acordamento via emitter quando /generate cria job — reduz latência
  unsubWakeup = onWakeup(() => {
    consecutiveIdle = 0;
    if (currentPollMs !== POLL_FAST_MS) switchPollSpeed(POLL_FAST_MS);
    tick().catch(() => {});
  });

  // Cron diário de cleanup
  scheduleDaily(cleanupOldJobs);
}

/**
 * Para o worker. Útil em testes.
 */
function stopImageWorker() {
  if (pollInterval) clearInterval(pollInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (unsubWakeup) unsubWakeup();
  pollInterval = null;
  cleanupInterval = null;
  unsubWakeup = null;
  console.log('[INFO][Worker] parado');
}

/**
 * Snapshot do estado do worker, exposto via /api/image/_health.
 * Inclui counters, polling speed atual e cache stats.
 */
function getWorkerSnapshot() {
  const cache = require('../infra/cache');
  return {
    worker: {
      running:        !!pollInterval,
      startedAt:      stats.startedAt,
      pollIntervalMs: currentPollMs,
      consecutiveIdle,
      currentJobs:    running,
      totalProcessed: stats.totalProcessed,
      totalErrors:    stats.totalErrors,
      lastCompletedAt: stats.lastCompletedAt,
      lastErrorAt:    stats.lastErrorAt,
      maxConcurrent:  MAX_CONCURRENT,
    },
    cache: cache.getStats(),
    lastCleanup: {
      at:     stats.lastCleanupAt,
      result: stats.lastCleanupResult,
    },
  };
}

module.exports = {
  startImageWorker,
  stopImageWorker,
  processJob,           // exported for testing/manual invocation
  cleanupOldJobs,       // chamado também via /api/setup/image-cleanup
  removeOrphanFiles,
  getWorkerSnapshot,    // pra endpoint /api/image/_health
};
