/**
 * @fileoverview Smart Selector — LLM decide modelo + reference mode (sprint v2)
 *
 * Sprint v2 (maio/2026):
 *   · Default agora e claude-sonnet-4-6 (~$0.003/decisao). Antes era
 *     gpt-4o-mini e o usuario relatou decisoes ruins. Pode ser overridado
 *     por settings.smart_mode_model pra cair pro 4o-mini quem priorizar custo.
 *   · System prompt enriquecido com regras de Arte Guia (templates de
 *     inspiracao + brandbook ativo + categoria do pedido).
 *   · Fallback agora cai pro autoMode determinstico (regras hardcoded da
 *     sprint v1.2). Antes caia pro heuristicSelector legado.
 *
 * Custo aceitavel — em 100 jobs/dia da ~$9/mes a mais. Dobre disso na
 * tabela de custos do README quando documentar.
 */

const { runCompletionWithModel } = require('../../ia/completion');
const { SMART_SELECTOR_SYSTEM } = require('./prompts/smartSelector');
const { decide: autoModeDecide } = require('./autoMode');

const DEFAULT_LLM_MODEL = 'claude-sonnet-4-6';

/**
 * Decide modelo via LLM, com fallback determinstico.
 *
 * @param {object} args
 * @param {string} args.rawDescription
 * @param {object} [args.brandbook]
 * @param {string} args.format
 * @param {Array<{url, mode, hasFace?, isProduct?}>} args.refs
 * @param {string} [args.observations]
 * @param {Array<string>} args.enabledModels
 * @param {object} args.settings
 * @param {string|null} [args.openAIResolved]
 * @param {object} [args.inspirationTemplateContext] - { count, categories[] }
 * @param {string} args.tenantId
 * @param {string} [args.userId]
 * @param {string} [args.clientId]
 * @param {string} args.jobId
 * @returns {Promise<{
 *   primary_model: string,
 *   confidence: number,
 *   reasoning: string,
 *   reference_mode: 'text-only'|'image-edit'|'multi-image',
 *   used_smart_mode: boolean,
 *   fallback_used?: boolean,
 *   llm_failed?: boolean
 * }>}
 */
async function selectStrategy(args) {
  const {
    rawDescription, brandbook, format, refs, observations,
    enabledModels, settings, openAIResolved,
    inspirationTemplateContext,
    tenantId, userId, clientId, jobId,
  } = args;

  const llmModel = settings?.smart_mode_model || DEFAULT_LLM_MODEL;

  const refsCount = Array.isArray(refs) ? refs.length : 0;
  const counts = refsCount > 0 ? {
    character:   refs.filter(r => r.mode === 'character').length,
    scene:       refs.filter(r => r.mode === 'scene').length,
    inspiration: refs.filter(r => r.mode === 'inspiration').length,
    hasFace:     refs.some(r => r.hasFace),
  } : null;

  // User message — passa TODO o contexto relevante
  const userMessage = JSON.stringify({
    rawDescription,
    format,
    observations: observations || null,
    refsCount,
    refsByMode: counts,
    enabledModels,
    inspiration_templates: inspirationTemplateContext || null,
    brandbook: brandbook ? {
      tone:           brandbook.structured_data?.tone || null,
      style_keywords: brandbook.structured_data?.style_keywords || null,
      hasFixedRefs:   !!(brandbook.fixed_references && JSON.stringify(brandbook.fixed_references).length > 5),
    } : null,
  }, null, 2);

  let parsed = null;
  let llmError = null;
  try {
    const result = await runCompletionWithModel(
      llmModel,
      SMART_SELECTOR_SYSTEM,
      userMessage,
      500,
      {
        tenantId, userId: userId || null, clientId: clientId || null,
        operationType: 'image_smart_selector',
        sessionId: jobId,
      }
    );
    const text = String(result.text || '').trim();
    // Tira markdown fences se vierem
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
    console.log('[INFO][SmartSelector] decisao LLM', {
      tenantId, jobId, llmModel,
      primary: parsed.primary_model, confidence: parsed.confidence,
    });
  } catch (err) {
    llmError = err.message;
    console.warn('[WARN][SmartSelector] LLM falhou, usando fallback deterministico', {
      tenantId, jobId, llmModel, error: err.message,
    });
  }

  // Validacao do retorno do LLM
  const validReferenceModes = ['text-only', 'image-edit', 'multi-image'];
  const isValid = parsed
    && typeof parsed.primary_model === 'string'
    && enabledModels.includes(parsed.primary_model)
    && validReferenceModes.includes(parsed.reference_mode);

  if (!isValid) {
    if (parsed) {
      console.warn('[WARN][SmartSelector] LLM retornou estrutura/modelo invalido, fallback', {
        tenantId, jobId,
        parsedModel: parsed.primary_model,
        parsedRefMode: parsed.reference_mode,
      });
    }
    const fallback = autoModeDecide({
      rawDescription, refs: refs || [],
      enabledModels: enabledModels || [],
      openAIResolved,
    });
    return {
      ...fallback,
      used_smart_mode: false,
      fallback_used:  true,
      llm_failed:     !!llmError,
    };
  }

  return {
    primary_model:   parsed.primary_model,
    confidence:      typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
    reasoning:       parsed.reasoning || 'Decisao do Smart Selector',
    reference_mode:  parsed.reference_mode,
    needs_multi_step: !!parsed.needs_multi_step,
    sub_steps:       Array.isArray(parsed.sub_steps) ? parsed.sub_steps : [],
    used_smart_mode: true,
    fallback_used:   false,
  };
}

module.exports = { selectStrategy, DEFAULT_LLM_MODEL };
