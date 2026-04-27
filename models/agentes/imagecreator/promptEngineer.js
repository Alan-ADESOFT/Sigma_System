/**
 * @fileoverview Prompt Engineer — otimiza descrição bruta em prompt visual
 * @description Pipeline:
 *   1. Calcula MD5 (rawDescription + brandbookId + format + model + refs hash)
 *   2. Busca cache em image_jobs.optimized_prompt na janela X horas
 *   3. Se cache hit: retorna sem chamar LLM (tokensUsed=0)
 *   4. Se miss: chama runCompletionWithModel com TODO contexto injetado
 *      (brandbook + fixed refs + refs por modo + smart decision + hints)
 *   5. Loga em ai_token_usage (operationType='image_prompt_engineer')
 *
 * Sprint v1.1 — abril 2026: aceita referenceDescriptionsByMode (3 modos),
 * fixed refs do brandbook, smart decision, e retorna imageInputs hints pro
 * worker passar pros providers.
 */

const crypto = require('crypto');
const { runCompletionWithModel } = require('../../ia/completion');
const { searchByPromptHash } = require('../../imageJob.model');
const { getOrCreate: getSettings } = require('../../imageSettings.model');
const { PROMPT_ENGINEER_SYSTEM, buildUserMessage } = require('./prompts/promptEngineer');

/**
 * Hash determinístico do "input semântico" do prompt — ignora detalhes
 * que não mudam o significado do prompt final.
 *
 * Sprint v1.1: refsKey agora considera modo + descrição (cache invalida
 * corretamente quando user troca foto OU modo).
 */
function calculateHash(input) {
  // Concatena descrições com modo prefixado pra distinguir o mesmo conteúdo
  // descrito como "personagem" vs "inspiração".
  const refsKey = (() => {
    const parts = [];
    const byMode = input.referenceDescriptionsByMode;
    if (byMode) {
      for (const mode of ['inspiration', 'character', 'scene']) {
        const items = byMode[mode] || [];
        for (const d of items) {
          parts.push(`${mode}:${(d || '').toLowerCase().slice(0, 200)}`);
        }
      }
    } else if (Array.isArray(input.referenceDescriptions)) {
      for (const d of input.referenceDescriptions) {
        parts.push(`legacy:${(d || '').toLowerCase().slice(0, 200)}`);
      }
    }
    return parts.join('|').slice(0, 800);
  })();

  // Fixed refs cache key (descrições já cacheadas)
  const fixedKey = Array.isArray(input.fixedBrandReferencesDescriptions)
    ? input.fixedBrandReferencesDescriptions
        .map(r => `${r.label || ''}:${(r.description || '').slice(0, 100).toLowerCase()}`)
        .join('|')
        .slice(0, 400)
    : '';

  const payload = JSON.stringify({
    raw:       (input.rawDescription || '').trim().toLowerCase(),
    brandbook: input.brandbookId || null,
    format:    input.format,
    aspect:    input.aspectRatio,
    model:     input.model,
    obs:       (input.observations || '').trim().toLowerCase(),
    neg:       (input.negativePrompt || '').trim().toLowerCase(),
    refs:      refsKey,
    fixed:     fixedKey,
    smart:     input.smartDecision?.primary_model || null,
  });
  return crypto.createHash('md5').update(payload).digest('hex');
}

/**
 * Otimiza o prompt do usuário.
 *
 * @param {object} args
 * @param {string} args.rawDescription
 * @param {object} [args.brandbook]
 * @param {string} args.format
 * @param {string} args.aspectRatio
 * @param {string} args.model
 * @param {string} [args.observations]
 * @param {string} [args.negativePrompt]
 * @param {{inspiration: string[], character: string[], scene: string[]}} [args.referenceDescriptionsByMode]
 * @param {Array<string>} [args.referenceDescriptions] - LEGADO
 * @param {Array<{url, label, description}>} [args.fixedBrandReferencesDescriptions]
 * @param {object} [args.smartDecision]
 * @param {Array<{url, role, referenceId?, buffer?}>} [args.imageInputs] - hints
 * @param {string} args.tenantId
 * @param {string} [args.userId]
 * @param {string} [args.clientId]
 * @param {string} args.jobId
 * @returns {Promise<{
 *   prompt: string,
 *   hash: string,
 *   fromCache: boolean,
 *   tokensInput: number,
 *   tokensOutput: number,
 *   modelUsed?: string
 * }>}
 */
async function optimizePrompt(args) {
  const {
    rawDescription, brandbook,
    format, aspectRatio, model,
    observations, negativePrompt,
    referenceDescriptionsByMode,
    referenceDescriptions,
    fixedBrandReferencesDescriptions,
    smartDecision,
    imageInputs,
    bypassCache,  // sprint v1.1 — força novo prompt ignorando cache
    tenantId, userId, clientId, jobId,
  } = args;

  if (!rawDescription) throw new Error('optimizePrompt: rawDescription obrigatória');
  if (!tenantId)       throw new Error('optimizePrompt: tenantId obrigatório');

  const settings = await getSettings(tenantId);
  const cacheWindowHours = settings.prompt_reuse_window_hours || 24;
  const llmModel = settings.prompt_engineer_model || 'gpt-4o-mini';

  const hash = calculateHash({
    rawDescription,
    brandbookId: brandbook?.id,
    format, aspectRatio, model,
    observations, negativePrompt,
    referenceDescriptionsByMode, referenceDescriptions,
    fixedBrandReferencesDescriptions,
    smartDecision,
  });

  // 1. Cache lookup — pula se bypassCache=true (variação fresca / edição)
  const cached = bypassCache
    ? null
    : await searchByPromptHash(hash, tenantId, cacheWindowHours);
  if (cached?.optimized_prompt) {
    console.log('[INFO][PromptEngineer] cache hit', {
      tenantId, jobId, hash, age: cached.created_at,
    });
    // VALIDAÇÃO: se brandbook ativo, garantir que cache vem de geração com brandbook
    if (brandbook?.id) {
      console.log('[INFO][PromptEngineer] Brandbook injetado no prompt (via cache)', {
        brandbookId: brandbook.id,
        cachedFromBrandbook: cached.brandbook_id,
      });
    }
    return {
      prompt: cached.optimized_prompt,
      hash,
      fromCache: true,
      tokensInput: 0,
      tokensOutput: 0,
      modelUsed: 'cache',
    };
  }

  // 2. Cache miss — chama LLM
  const userMessage = buildUserMessage({
    rawDescription, brandbook,
    format, aspectRatio, model,
    observations, negativePrompt,
    referenceDescriptionsByMode, referenceDescriptions,
    fixedBrandReferencesDescriptions,
    smartDecision,
    imageInputs,
  });

  console.log('[INFO][PromptEngineer] cache miss — chamando LLM', {
    tenantId, jobId, llmModel, hash,
    hasBrandbook: !!brandbook,
    hasFixedRefs: (fixedBrandReferencesDescriptions || []).length,
    refModes: referenceDescriptionsByMode
      ? {
          inspiration: (referenceDescriptionsByMode.inspiration || []).length,
          character:   (referenceDescriptionsByMode.character || []).length,
          scene:       (referenceDescriptionsByMode.scene || []).length,
        }
      : 'legacy',
  });

  // VALIDAÇÃO: log explícito quando brandbook entra no prompt (atende request
  // do user de garantir que brandbook é injetado).
  if (brandbook?.id) {
    const sd = brandbook.structured_data;
    const sectionsAdded = sd
      ? Object.keys(typeof sd === 'string' ? safeParse(sd) : sd).filter(k => {
          const v = (typeof sd === 'string' ? safeParse(sd) : sd)[k];
          return v && (Array.isArray(v) ? v.length : Object.keys(v || {}).length);
        })
      : [];
    console.log('[INFO][PromptEngineer] Brandbook injetado no prompt', {
      brandbookId: brandbook.id,
      sectionsAdded,
      fixedRefsInjected: (fixedBrandReferencesDescriptions || []).filter(r => r?.description).length,
    });
  }

  const result = await runCompletionWithModel(
    llmModel,
    PROMPT_ENGINEER_SYSTEM,
    userMessage,
    1500,
    {
      tenantId,
      userId: userId || null,
      clientId: clientId || null,
      operationType: 'image_prompt_engineer',
      sessionId: jobId,
    }
  );

  const optimized = String(result.text || '').trim();
  if (!optimized) {
    throw new Error('PromptEngineer: LLM retornou prompt vazio');
  }

  console.log('[SUCESSO][PromptEngineer] prompt otimizado', {
    tenantId, jobId,
    promptLength: optimized.length,
    tokens: result.usage,
  });

  return {
    prompt: optimized,
    hash,
    fromCache: false,
    tokensInput: result.usage?.input || 0,
    tokensOutput: result.usage?.output || 0,
    modelUsed: result.modelUsed || llmModel,
  };
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

module.exports = { optimizePrompt, calculateHash };
