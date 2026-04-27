/**
 * @fileoverview Prompt Engineer — otimiza descrição bruta em prompt visual
 * @description Pipeline:
 *   1. Calcula MD5 (rawDescription + brandbookId + format + model)
 *   2. Busca cache em image_jobs.optimized_prompt na janela X horas
 *   3. Se cache hit: retorna sem chamar LLM (tokensUsed=0)
 *   4. Se miss: chama runCompletionWithModel com brandbook injetado
 *   5. Loga em ai_token_usage (operationType='image_prompt_engineer')
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
 * @param {object} input
 * @returns {string} MD5 hex
 */
function calculateHash(input) {
  // OBS: referências entram no hash como junção das descrições. Se o usuário
  // trocar a foto de referência (descrição diferente), o hash muda e o cache
  // não reusa um prompt antigo gerado sem essas refs — fix do bug em que
  // refs eram totalmente ignoradas.
  const refsKey = Array.isArray(input.referenceDescriptions)
    ? input.referenceDescriptions.join('|').toLowerCase().slice(0, 500)
    : '';
  const payload = JSON.stringify({
    raw:        (input.rawDescription || '').trim().toLowerCase(),
    brandbook:  input.brandbookId || null,
    format:     input.format,
    aspect:     input.aspectRatio,
    model:      input.model,
    obs:        (input.observations || '').trim().toLowerCase(),
    neg:        (input.negativePrompt || '').trim().toLowerCase(),
    refs:       refsKey,
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
 * @param {Array<string>} [args.referenceDescriptions]
 * @param {string} args.tenantId
 * @param {string} args.userId
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
    observations, negativePrompt, referenceDescriptions,
    tenantId, userId, jobId,
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
    referenceDescriptions, // garante que cache invalida quando refs mudam
  });

  // 1. Cache lookup
  const cached = await searchByPromptHash(hash, tenantId, cacheWindowHours);
  if (cached?.optimized_prompt) {
    console.log('[INFO][PromptEngineer] cache hit', {
      tenantId, jobId, hash, age: cached.created_at,
    });
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
    observations, negativePrompt, referenceDescriptions,
  });

  console.log('[INFO][PromptEngineer] cache miss — chamando LLM', {
    tenantId, jobId, llmModel, hash,
  });

  const result = await runCompletionWithModel(
    llmModel,
    PROMPT_ENGINEER_SYSTEM,
    userMessage,
    1500,
    {
      tenantId,
      operationType: 'image_prompt_engineer',
      sessionId: jobId,
      // clientId é injetado pelo handler quando relevante
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

module.exports = { optimizePrompt, calculateHash };
