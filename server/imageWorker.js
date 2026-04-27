/**
 * @fileoverview Worker em background do Gerador de Imagem (v1.1)
 * @description Roda dentro do `server/instrumentation.js` no boot do Next.
 *   · Polling adaptativo: 2s normal, 5s ocioso, 10s muito ocioso
 *   · MAX_CONCURRENT_GLOBAL = 5 (limite v1.1 da sprint)
 *   · Acordado imediatamente por imageJobEmitter quando /generate cria job
 *   · Cron diário às 03:00 chama cleanup_image_jobs() + remove arquivos órfãos
 *   · Timeout duro de 90s (configurável via settings.job_timeout_seconds)
 *
 * Sprint v1.1 — abril 2026:
 *   · Parse de refs com modo (inspiration|character|scene)
 *   · Fixed refs do brandbook (cache 30d das descrições Vision)
 *   · Smart Mode opcional (LLM decide modelo) ou heurística
 *   · Logs explícitos garantindo brandbook injetado
 *   · Timeout via AbortController + flag timed_out
 *   · Title generator async (post-processing)
 *
 * Para desabilitar: IMAGE_WORKER_ENABLED=false
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const {
  getQueuedJobs, getJobById,
  markStarted, markCompleted, markError,
  updateJobStatus, updateJobTitle,
} = require('../models/imageJob.model');
const {
  getActiveBrandbook,
  updateFixedReferencesDescriptions,
} = require('../models/brandbook.model');
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
const {
  describeReferencesByMode,
  describeFixedReference,
} = require('../models/agentes/imagecreator/referenceVision');
const {
  classifyReferences,
  roleToLegacyMode,
} = require('../models/agentes/imagecreator/refClassifier');
// v1.2: heuristicSelector/smartSelector preservados em disco pra compat reversa
// com jobs antigos no histórico, mas o worker agora usa só autoMode.
const { decide: autoModeDecide } = require('../models/agentes/imagecreator/autoMode');
const { probeOpenAIImageModel } = require('../infra/api/imageProviders/_probe');
const { setOpenAIResolved } = require('../models/imageSettings.model');
const { getMaxImageInputs } = require('../models/agentes/imagecreator/modelCapabilities');
const { generateImage, providerForModel } = require('../infra/api/imageProviders');
const { loadInternalUpload } = require('../infra/api/imageProviders/_helpers');
const { runCompletionWithModel } = require('../models/ia/completion');
const { onWakeup } = require('../infra/imageJobEmitter');
const { query, queryOne } = require('../infra/db');

// ── Constantes ──────────────────────────────────────────────────────────────
const POLL_FAST_MS  = 2000;
const POLL_MED_MS   = 5000;
const POLL_SLOW_MS  = 10000;
const IDLE_THRESHOLD_MED  = 5;
const IDLE_THRESHOLD_SLOW = 20;
// LIMITE GLOBAL v1.1 — 5 jobs simultâneos no worker (independente de tenant)
const MAX_CONCURRENT_GLOBAL = 5;
const CLEANUP_HOUR = 3;
const CLEANUP_MINUTE = 0;
// TTL do cache de descrições das fixed refs do brandbook (30 dias)
const FIXED_REFS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let pollInterval = null;
let cleanupInterval = null;
let consecutiveIdle = 0;
let currentPollMs = POLL_FAST_MS;
let runningGlobal = 0;
let processingIds = new Set();
let unsubWakeup = null;

const stats = {
  startedAt:        null,
  totalProcessed:   0,
  totalErrors:      0,
  totalTimeouts:    0,
  totalCancelled:   0,
  lastCompletedAt:  null,
  lastErrorAt:      null,
  lastCleanupAt:    null,
  lastCleanupResult: null,
};

// ── Storage ─────────────────────────────────────────────────────────────────

function buildOutputPath(tenantId, jobId, ext) {
  const ym = new Date().toISOString().slice(0, 7);
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

  await sharp(imageBuffer)
    .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(paths.thumbAbsPath);

  return { publicUrl: paths.publicUrl, publicThumb: paths.publicThumb };
}

// ── Helpers de orquestração v1.1 ────────────────────────────────────────────

/**
 * Parse de refs do job. Prioriza reference_image_metadata (formato novo
 * com modo). Cai pra reference_image_urls (formato legado, assume 'inspiration').
 *
 * v1.2: Quando refs vêm SEM mode (auto-classify), retorna `needsAutoClassify=true`
 * pra o caller chamar classifyReferences antes de prosseguir.
 *
 * @returns {{ refs: Array<{url, mode?}>, needsAutoClassify: boolean }}
 */
function parseReferencesWithMode(job) {
  let metadata = [];
  try {
    metadata = Array.isArray(job.reference_image_metadata)
      ? job.reference_image_metadata
      : JSON.parse(job.reference_image_metadata || '[]');
  } catch { metadata = []; }

  if (Array.isArray(metadata) && metadata.length > 0) {
    const filtered = metadata.filter(r => r && typeof r.url === 'string');
    // Se todos têm mode válido (advancedMode ou jobs antigos), retorna direto
    const allHaveMode = filtered.every(r =>
      ['inspiration', 'character', 'scene'].includes(r.mode)
    );
    if (allHaveMode) {
      return { refs: filtered.map(r => ({ url: r.url, mode: r.mode })), needsAutoClassify: false };
    }
    // Pelo menos um sem mode: classificar tudo (a classificação considera contexto)
    return {
      refs: filtered.map(r => ({ url: r.url, mode: r.mode || null })),
      needsAutoClassify: true,
    };
  }

  // Fallback legado
  let urls = [];
  try {
    urls = Array.isArray(job.reference_image_urls)
      ? job.reference_image_urls
      : JSON.parse(job.reference_image_urls || '[]');
  } catch { urls = []; }
  return {
    refs: urls.filter(u => typeof u === 'string').map(url => ({ url, mode: 'inspiration' })),
    needsAutoClassify: false,
  };
}

/**
 * Garante que as fixed refs do brandbook têm descrições atualizadas (Vision).
 * Cache: 30 dias no banco. Quando inválido, descreve e atualiza.
 *
 * @param {object} brandbook - linha de client_brandbooks
 * @param {string} tenantId
 * @returns {Promise<Array<{url, label, description}>>}
 */
async function ensureFixedRefsDescriptions(brandbook, tenantId) {
  if (!brandbook) return [];
  const fixedRefs = (() => {
    try {
      return Array.isArray(brandbook.fixed_references)
        ? brandbook.fixed_references
        : JSON.parse(brandbook.fixed_references || '[]');
    } catch { return []; }
  })();
  if (fixedRefs.length === 0) return [];

  const cached = (() => {
    try {
      return Array.isArray(brandbook.fixed_references_descriptions)
        ? brandbook.fixed_references_descriptions
        : JSON.parse(brandbook.fixed_references_descriptions || '[]');
    } catch { return []; }
  })();
  const cachedAt = brandbook.fixed_references_described_at;
  const isCacheValid =
    cached.length === fixedRefs.length &&
    cachedAt &&
    (Date.now() - new Date(cachedAt).getTime()) < FIXED_REFS_CACHE_TTL_MS;

  if (isCacheValid) {
    console.log('[INFO][Worker] Fixed refs cache hit', {
      brandbookId: brandbook.id, count: cached.length,
    });
    return cached;
  }

  // Re-descreve todas
  console.log('[INFO][Worker] Fixed refs cache miss — descrevendo via Vision', {
    brandbookId: brandbook.id, count: fixedRefs.length,
  });
  const descs = [];
  for (const fr of fixedRefs) {
    const result = await describeFixedReference(fr, tenantId);
    descs.push({
      url: fr.url,
      label: fr.label || null,
      description: result.description || '',
    });
  }
  await updateFixedReferencesDescriptions(brandbook.id, descs);
  return descs;
}

/**
 * Carrega buffers das refs que vão ser passadas como image input pro provider.
 * Limite máximo dado por max_image_inputs do modelo (na tabela capabilities).
 * Prioriza character > scene > inspiration.
 */
async function loadImageInputsForProvider({ refs, fixedRefs, maxCount }) {
  const out = [];
  if (!maxCount || maxCount <= 0) return out;

  // Ordem de prioridade
  const ordered = [
    ...refs.filter(r => r.mode === 'character'),
    ...refs.filter(r => r.mode === 'scene'),
    ...refs.filter(r => r.mode === 'inspiration'),
  ];

  for (const r of ordered) {
    if (out.length >= maxCount) break;
    const buffer = await loadInternalUpload(r.url);
    if (!buffer) continue;
    out.push({
      url: r.url,
      buffer,
      role: r.mode,
      referenceId: out.length + 1,
    });
  }

  // Fixed refs entram no resto do espaço (se sobrar)
  if (out.length < maxCount && Array.isArray(fixedRefs)) {
    for (const fr of fixedRefs) {
      if (out.length >= maxCount) break;
      const buffer = await loadInternalUpload(fr.url);
      if (!buffer) continue;
      out.push({
        url: fr.url,
        buffer,
        role: 'inspiration',
        description: fr.description || fr.label,
        referenceId: out.length + 1,
      });
    }
  }

  return out;
}

/**
 * Gera título curto (3-5 palavras) async, sem bloquear o fluxo principal.
 * Não seta título se title_user_edited já estiver true.
 */
async function generateTitleAsync(jobId, tenantId, rawDescription, llmModel) {
  try {
    const result = await runCompletionWithModel(
      llmModel || 'gpt-4o-mini',
      'Você gera títulos curtos para imagens. Devolva APENAS um título de 3-5 palavras em português, sem aspas, sem pontuação final, sem explicações.',
      `Descrição: ${rawDescription}\n\nTítulo (3-5 palavras):`,
      40,
      {
        tenantId,
        operationType: 'image_title_generator',
        sessionId: jobId,
      }
    );
    const title = String(result.text || '').trim().replace(/[".!?]$/, '').slice(0, 80);
    if (title) {
      // Só seta se não foi editado pelo user (defesa em profundidade)
      const current = await queryOne(
        `SELECT title_user_edited FROM image_jobs WHERE id = $1`,
        [jobId]
      );
      if (!current?.title_user_edited) {
        await updateJobTitle(jobId, tenantId, title, false);
      }
    }
  } catch (err) {
    console.warn('[WARN][Worker:title] geração de título falhou', {
      jobId, error: err.message,
    });
  }
}

// ── Pipeline principal de processamento ─────────────────────────────────────

/**
 * Processa um job individual. NÃO lança — captura tudo internamente.
 */
async function processJob(job) {
  const t0 = Date.now();
  console.log('[INFO][Worker:imageJob] iniciando', { jobId: job.id });

  await markStarted(job.id);

  try {
    // 1. Settings
    const settings = await getWithDecryptedKeys(job.tenant_id);

    // 2. Brandbook (com fixed refs)
    let brandbook = null;
    if (job.brandbook_id) {
      brandbook = await getActiveBrandbook(job.client_id, job.tenant_id);
      if (brandbook) {
        // VALIDAÇÃO: log explícito que brandbook foi carregado pra esse job
        console.log('[INFO][Worker] Brandbook ativo carregado', {
          jobId: job.id, clientId: job.client_id,
          brandbookId: brandbook.id,
          hasStructured: !!brandbook.structured_data,
          hasFixedRefs: (() => {
            try {
              const fr = Array.isArray(brandbook.fixed_references)
                ? brandbook.fixed_references
                : JSON.parse(brandbook.fixed_references || '[]');
              return fr.length;
            } catch { return 0; }
          })(),
        });
      }
    }

    // 3. Parse de refs com modo + auto-classificação (v1.2)
    const parsed = parseReferencesWithMode(job);
    let refs = parsed.refs;

    if (parsed.needsAutoClassify && refs.length > 0) {
      console.log('[INFO][Worker] refs sem modo — chamando refClassifier', {
        jobId: job.id, count: refs.length,
      });
      const classified = await classifyReferences({
        refs,
        rawDescription: job.raw_description,
        tenantId: job.tenant_id,
        clientId: job.client_id,
        jobId: job.id,
      });

      // Persiste o resultado bruto pra debug
      await updateJobStatus(job.id, 'running', {
        autoClassifiedRefs: classified,
      });

      // Mapeia role → mode legado pro restante do pipeline
      refs = classified.map(c => ({
        url: c.url,
        mode: roleToLegacyMode(c.role),
        // Carrega hasFace/isProduct pro autoMode (v1.2)
        hasFace: !!c.hasFace,
        isProduct: !!c.isProduct,
      }));
    }

    // 4. Fixed refs do brandbook (cache 30d)
    const fixedRefDescriptions = brandbook
      ? await ensureFixedRefsDescriptions(brandbook, job.tenant_id)
      : [];

    // 5. Vision sobre refs do user (com modes)
    let referenceDescriptionsByMode = { inspiration: [], character: [], scene: [] };
    if (refs.length > 0) {
      const result = await describeReferencesByMode({
        refs, tenantId: job.tenant_id, clientId: job.client_id, jobId: job.id,
      });
      referenceDescriptionsByMode = result.byMode;
    }

    // 6. Decisão de modelo (v1.2: autoMode determinístico + probe GPT Image)
    let smartDecision = null;
    let chosenModel = job.model;

    if (job.model === 'auto') {
      smartDecision = autoModeDecide({
        rawDescription: job.raw_description,
        refs,
        enabledModels: settings.enabled_models || [],
        openAIResolved: settings.openai_image_model_resolved || null,
      });

      // Resolve GPT Image: se autoMode escolheu gpt-image-2 mas a org não tem,
      // o resolved fica null e o gptImageActual() devolve gpt-image-2 mesmo
      // assim — o provider lança 404. Como temos o probe rodando no boot, na
      // prática o resolved está populado. Defesa em profundidade: se vier
      // gpt-image-2 e resolved aponta pra outro, swap aqui.
      if (
        chosenModel === 'gpt-image-2' &&
        settings.openai_image_model_resolved &&
        settings.openai_image_model_resolved !== 'gpt-image-2'
      ) {
        const original = chosenModel;
        chosenModel = settings.openai_image_model_resolved;
        smartDecision = {
          ...smartDecision,
          primary_model: chosenModel,
          reasoning: `${smartDecision.reasoning} (org sem gpt-image-2 — fallback ${chosenModel})`,
          openai_fallback: { from: original, to: chosenModel },
        };
      } else {
        chosenModel = smartDecision.primary_model;
      }
    } else {
      // Modelo explícito (modo avançado Cmd+Shift+A) — não roda autoMode.
      smartDecision = null;
    }

    // Persiste decisão e modelo escolhido
    if (smartDecision) {
      await updateJobStatus(job.id, 'running', {
        model: chosenModel,
        smartDecision,
      });
    }

    // 7. Carrega buffers das refs pro provider
    let provider = providerForModel(chosenModel);
    if (!provider) {
      const e = new Error(`Não pude resolver provider pro modelo '${chosenModel}'`);
      e.code = 'INVALID_INPUT';
      throw e;
    }

    let maxImages = await getMaxImageInputs(chosenModel);

    // ── Auto-redirect (sprint v1.1): se há refs MAS modelo escolhido não
    // aceita image input, troca pra modelo que aceita. Vale pra qualquer
    // modo (character, scene, inspiration) — sem isso as refs são ignoradas
    // e o resultado é genérico (problema reportado pelo user).
    const hasAnyRef = refs.length > 0;
    const hasCharRef = refs.some(r => r.mode === 'character');
    if (hasAnyRef && maxImages === 0) {
      const enabled = settings.enabled_models || [];
      // Prioridade depende do tipo de ref: character → Flux Kontext (especialista
      // em preservar pessoa). Inspiration only → Nano Banana 2 (multi-imagem versátil).
      const FALLBACKS = hasCharRef
        ? ['fal-ai/flux-pro/kontext', 'gemini-3.1-flash-image-preview', 'gpt-image-1', 'imagen-3.0-capability-001']
        : ['gemini-3.1-flash-image-preview', 'fal-ai/flux-pro/kontext', 'gpt-image-1', 'imagen-3.0-capability-001'];
      const replacement = FALLBACKS.find(m => enabled.includes(m));
      if (replacement) {
        const originalModel = chosenModel;
        chosenModel = replacement;
        provider = providerForModel(chosenModel);
        maxImages = await getMaxImageInputs(chosenModel);
        const reason = `Modelo "${originalModel}" não aceita imagens — trocado por "${chosenModel}" pra usar as ${refs.length} ref(s) enviadas.`;
        console.log('[INFO][Worker] auto-redirect por incompatibilidade de refs', {
          from: originalModel, to: chosenModel, refsCount: refs.length, hasCharRef,
        });
        smartDecision = {
          ...(smartDecision || {}),
          primary_model: chosenModel,
          reasoning: reason,
          auto_corrected: true,
          original_model: originalModel,
          used_smart_mode: smartDecision?.used_smart_mode || false,
        };
        await updateJobStatus(job.id, 'running', {
          model: chosenModel,
          provider,
          smartDecision,
        });
      } else {
        console.warn('[WARN][Worker] modelo escolhido não aceita refs e nenhum fallback habilitado', {
          model: chosenModel, enabled,
        });
      }
    }

    const imageInputs = await loadImageInputsForProvider({
      refs,
      fixedRefs: fixedRefDescriptions,
      maxCount: maxImages,
    });

    const referenceMode = imageInputs.length > 0
      ? (imageInputs.length > 1 ? 'multi-image' : 'image-edit')
      : 'text-only';

    // 8. Prompt Engineer
    const optResult = await optimizePrompt({
      rawDescription: job.raw_description,
      brandbook,
      format: job.format,
      aspectRatio: job.aspect_ratio,
      model: chosenModel,
      observations: job.observations,
      negativePrompt: job.negative_prompt,
      referenceDescriptionsByMode,
      fixedBrandReferencesDescriptions: fixedRefDescriptions,
      smartDecision,
      imageInputs: imageInputs.map(i => ({ role: i.role, referenceId: i.referenceId })),
      // Bypass cache automático quando há refs `character` — preservação de
      // pessoa SEMPRE deve gerar prompt novo (cache de prompt antigo poderia
      // anular os traços específicos da pessoa da referência atual).
      bypassCache: !!job.bypass_cache || refs.some(r => r.mode === 'character'),
      tenantId: job.tenant_id,
      userId: job.user_id,
      clientId: job.client_id,
      jobId: job.id,
    });

    await updateJobStatus(job.id, 'running', {
      optimizedPrompt: optResult.prompt,
      promptHash: optResult.hash,
      tokensInput: optResult.tokensInput,
      tokensOutput: optResult.tokensOutput,
    });

    // 9. Geração com timeout duro
    const timeoutMs = (settings.job_timeout_seconds || 90) * 1000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let result;
    try {
      result = await generateImage({
        provider,
        model: chosenModel,
        prompt: optResult.prompt,
        negativePrompt: job.negative_prompt,
        width: job.width,
        height: job.height,
        aspectRatio: job.aspect_ratio,
        imageInputs,
        referenceMode,
        quality: 'medium',
        settings,
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'TIMEOUT') {
        await query(
          `UPDATE image_jobs SET timed_out = true WHERE id = $1`,
          [job.id]
        );
        stats.totalTimeouts++;
        const e = new Error(`Geração excedeu o tempo limite de ${timeoutMs / 1000}s`);
        e.code = 'TIMEOUT';
        throw e;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // 10. Salva imagem + thumbnail
    const saved = await saveImage(job.tenant_id, job.id, result.imageBuffer, result.mimeType);

    // 11. Calcula custo
    const cost = calculateCost({
      provider,
      model: chosenModel,
      width: job.width,
      height: job.height,
      tokensInput: optResult.tokensInput,
      tokensOutput: optResult.tokensOutput,
      llmModel: settings.prompt_engineer_model,
      quality: 'medium',
    });

    const durationMs = Date.now() - t0;

    // 12. Marca completed
    await markCompleted(job.id, {
      provider,
      resultImageUrl: saved.publicUrl,
      resultThumbnailUrl: saved.publicThumb,
      resultMetadata: result.metadata,
      durationMs,
      costUsd: cost,
    });

    // 13. Loga uso (token usage agregado pra dashboard)
    logUsage({
      tenantId: job.tenant_id,
      userId: job.user_id || null,
      clientId: job.client_id || null,
      sessionId: job.id,
      operationType: 'image_generation',
      modelUsed: chosenModel,
      provider,
      tokensInput: optResult.tokensInput || 0,
      tokensOutput: optResult.tokensOutput || 0,
      metadata: {
        provider, model: chosenModel,
        costUsd: cost, fromCache: optResult.fromCache,
        referenceMode, refsUsed: imageInputs.length,
        smartDecision: smartDecision ? {
          used_smart_mode: smartDecision.used_smart_mode,
          confidence: smartDecision.confidence,
          reasoning: smartDecision.reasoning,
        } : null,
      },
    }).catch(() => {});

    // 14. Notificação
    try {
      await createNotification(
        job.tenant_id,
        'image_done',
        'Imagem gerada',
        `Sua imagem (${job.format}, ${chosenModel}) ficou pronta.`,
        job.client_id,
        { jobId: job.id, link: `/dashboard/image?job=${job.id}` }
      );
    } catch (e) {
      console.warn('[WARN][Worker:imageJob] notificação falhou', { error: e.message });
    }

    // 15. Título auto-gerado (async, não bloqueia)
    generateTitleAsync(
      job.id,
      job.tenant_id,
      job.raw_description,
      settings.title_generator_model || 'gpt-4o-mini'
    ).catch(() => {});

    stats.totalProcessed++;
    stats.lastCompletedAt = new Date().toISOString();
    console.log('[SUCESSO][Worker:imageJob] concluído', {
      jobId: job.id, ms: durationMs, cost,
      model: chosenModel, refsUsed: imageInputs.length,
      fromCache: optResult.fromCache,
    });

  } catch (err) {
    stats.totalErrors++;
    stats.lastErrorAt = new Date().toISOString();
    const code = err.code || 'PROVIDER_ERROR';
    console.error('[ERRO][Worker:imageJob] falha', {
      jobId: job.id, code, error: err.message,
    });

    try {
      await markError(job.id, err);
    } catch (markErr) {
      console.error('[ERRO][Worker:imageJob] falha ao marcar erro', { error: markErr.message });
    }

    // Audit pra moderação, rate limit, timeout, modelo indisponível
    if (['CONTENT_BLOCKED', 'RATE_LIMITED', 'TIMEOUT', 'MODEL_UNAVAILABLE'].includes(code)) {
      const action = code === 'CONTENT_BLOCKED' ? 'content_blocked'
                   : code === 'RATE_LIMITED'   ? 'rate_limit_hit'
                   : code === 'TIMEOUT'        ? 'job_timeout'
                   : 'model_unavailable';
      await logAudit({
        tenantId: job.tenant_id, userId: job.user_id,
        action,
        details: { jobId: job.id, model: job.model, provider: job.provider, message: err.message },
      });
    }

    // Notificação amigável
    try {
      const friendly = friendlyMessage(code, err.message);
      await createNotification(
        job.tenant_id,
        'image_error',
        'Falha ao gerar imagem',
        friendly,
        job.client_id,
        { jobId: job.id, errorCode: code, link: `/dashboard/image?job=${job.id}` }
      );
    } catch {}
  }
}

// ── Loop de polling ─────────────────────────────────────────────────────────

async function tick() {
  // LIMITE GLOBAL v1.1 — 5 jobs simultâneos
  if (runningGlobal >= MAX_CONCURRENT_GLOBAL) return;
  const slots = MAX_CONCURRENT_GLOBAL - runningGlobal;

  let jobs;
  try {
    jobs = await getQueuedJobs(slots);
  } catch (err) {
    console.error('[ERRO][Worker:tick] falha ao buscar fila', { error: err.message });
    return;
  }

  jobs = jobs.filter(j => !processingIds.has(j.id));

  if (jobs.length === 0) {
    consecutiveIdle++;
    if (consecutiveIdle >= IDLE_THRESHOLD_SLOW && currentPollMs !== POLL_SLOW_MS) {
      console.log('[INFO][Worker] modo idle profundo (10s polling)');
      switchPollSpeed(POLL_SLOW_MS);
    } else if (consecutiveIdle >= IDLE_THRESHOLD_MED && currentPollMs === POLL_FAST_MS) {
      console.log('[INFO][Worker] entrando em modo idle (5s polling)');
      switchPollSpeed(POLL_MED_MS);
    }
    return;
  }

  if (consecutiveIdle > 0 || currentPollMs !== POLL_FAST_MS) {
    consecutiveIdle = 0;
    if (currentPollMs !== POLL_FAST_MS) {
      console.log('[INFO][Worker] saindo do modo idle');
      switchPollSpeed(POLL_FAST_MS);
    }
  }

  for (const j of jobs) {
    if (runningGlobal >= MAX_CONCURRENT_GLOBAL) break;
    runningGlobal++;
    processingIds.add(j.id);
    processJob(j).finally(() => {
      runningGlobal--;
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

async function cleanupOldJobs() {
  const t0 = Date.now();
  console.log('[INFO][Worker:cleanup] iniciando cleanup');

  const result = {
    deletedJobs: 0, deletedAuditLogs: 0,
    freedBytes: 0, freedMB: '0.0',
    orphanFilesRemoved: 0, errors: [],
  };

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

  try {
    await query('SELECT cleanup_image_jobs()');
    console.log('[SUCESSO][Worker:cleanup] cleanup_image_jobs() executado');
  } catch (err) {
    console.error('[ERRO][Worker:cleanup] cleanup_image_jobs falhou', { error: err.message });
    result.errors.push(`sql-cleanup: ${err.message}`);
  }

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

async function removeOrphanFiles(baseDir) {
  let removed = 0;
  let bytes = 0;
  let tenantsDirs;
  try {
    tenantsDirs = await fs.readdir(baseDir);
  } catch { return { removed, bytes }; }

  for (const tenantDir of tenantsDirs) {
    const tenantPath = path.join(baseDir, tenantDir);
    let monthDirs;
    try { monthDirs = await fs.readdir(tenantPath); } catch { continue; }
    for (const monthDir of monthDirs) {
      const monthPath = path.join(tenantPath, monthDir);
      let stat;
      try { stat = await fs.stat(monthPath); } catch { continue; }
      if (!stat.isDirectory()) continue;
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

        const job = await getJobById(jobId).catch(() => null);
        if (job) continue;

        try {
          const fst = await fs.stat(fullPath);
          await fs.unlink(fullPath);
          bytes += fst.size;
          removed++;
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
  try {
    const { encrypt, decrypt } = require('../infra/encryption');
    const probe = decrypt(encrypt('sigma-encryption-probe'));
    if (probe !== 'sigma-encryption-probe') throw new Error('round-trip mismatch');
  } catch (err) {
    console.error('[ERRO CRÍTICO][Worker] encryption probe falhou — worker NÃO iniciado', {
      error: err.message,
      hint: 'Verifique IMAGE_ENCRYPTION_KEY no .env (32 bytes em base64).',
    });
    return;
  }

  console.log('[INFO][Worker] iniciando v1.2', {
    fastMs: POLL_FAST_MS, medMs: POLL_MED_MS, slowMs: POLL_SLOW_MS,
    maxConcurrentGlobal: MAX_CONCURRENT_GLOBAL,
  });
  stats.startedAt = new Date().toISOString();

  // v1.2: probe runtime do gpt-image-* disponível pra cada tenant que tem
  // chave OpenAI configurada. Não bloqueia o tick inicial — roda async.
  // Resolved cacheado em image_settings.openai_image_model_resolved.
  (async () => {
    try {
      const tenants = await query(
        `SELECT tenant_id, openai_api_key_encrypted, openai_image_model_resolved
           FROM image_settings
          WHERE openai_api_key_encrypted IS NOT NULL
            AND openai_image_model_resolved IS NULL`
      );
      for (const row of tenants) {
        try {
          const settingsModel = require('../models/imageSettings.model');
          const apiKey = await settingsModel.getDecryptedKey(row.tenant_id, 'openai');
          const resolved = await probeOpenAIImageModel(apiKey);
          if (resolved) {
            await setOpenAIResolved(row.tenant_id, resolved);
            console.log('[INFO][Worker] OpenAI image model resolvido', {
              tenantId: row.tenant_id, modelId: resolved,
            });
          }
        } catch (err) {
          console.warn('[WARN][Worker] probe falhou pra tenant', {
            tenantId: row.tenant_id, error: err.message,
          });
        }
      }
    } catch (err) {
      console.warn('[WARN][Worker] probe loop falhou', { error: err.message });
    }
  })();

  tick().catch((err) => console.error('[ERRO][Worker] tick inicial falhou', { error: err.message }));

  pollInterval = setInterval(() => {
    tick().catch((err) => console.error('[ERRO][Worker] tick periódico falhou', { error: err.message }));
  }, currentPollMs);

  unsubWakeup = onWakeup(() => {
    consecutiveIdle = 0;
    if (currentPollMs !== POLL_FAST_MS) switchPollSpeed(POLL_FAST_MS);
    tick().catch(() => {});
  });

  scheduleDaily(cleanupOldJobs);
}

function stopImageWorker() {
  if (pollInterval) clearInterval(pollInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (unsubWakeup) unsubWakeup();
  pollInterval = null;
  cleanupInterval = null;
  unsubWakeup = null;
  console.log('[INFO][Worker] parado');
}

function getWorkerSnapshot() {
  const cache = require('../infra/cache');
  return {
    worker: {
      running:        !!pollInterval,
      startedAt:      stats.startedAt,
      pollIntervalMs: currentPollMs,
      consecutiveIdle,
      currentJobs:    runningGlobal,
      totalProcessed: stats.totalProcessed,
      totalErrors:    stats.totalErrors,
      totalTimeouts:  stats.totalTimeouts,
      lastCompletedAt: stats.lastCompletedAt,
      lastErrorAt:    stats.lastErrorAt,
      maxConcurrentGlobal: MAX_CONCURRENT_GLOBAL,
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
  processJob,
  cleanupOldJobs,
  removeOrphanFiles,
  getWorkerSnapshot,
};
