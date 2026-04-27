/**
 * @fileoverview Smart Selector — LLM decide modelo + reference mode
 * @description Ativado quando settings.smart_mode_enabled = true.
 * Custa ~$0.0005 por geração mas dá decisões mais sofisticadas (ex: detecta
 * "estilo editorial cinematográfico com pessoa real" e roteia pra Flux
 * Kontext mesmo sem keyword óbvia).
 *
 * Fallback: se LLM falhar ou retornar JSON inválido, cai pra heurística.
 *
 */

const { runCompletionWithModel } = require('../../ia/completion');
const { SMART_SELECTOR_SYSTEM } = require('./prompts/smartSelector');
const { selectByHeuristic } = require('./heuristicSelector');

/**
 * Decide modelo via LLM.
 *
 * @param {object} args
 * @param {string} args.rawDescription
 * @param {object} [args.brandbook]
 * @param {string} args.format
 * @param {Array<{url, mode}>} args.refs
 * @param {string} [args.observations]
 * @param {Array<string>} args.enabledModels
 * @param {object} args.settings - tem smart_mode_model
 * @param {string} args.tenantId
 * @param {string} [args.userId]
 * @param {string} [args.clientId]
 * @param {string} args.jobId
 * @returns {Promise<{
 *   primary_model: string,
 *   confidence: number,
 *   reasoning: string,
 *   reference_mode: 'text-only'|'image-edit'|'multi-image',
 *   needs_multi_step?: boolean,
 *   sub_steps?: Array,
 *   used_smart_mode: boolean
 * }>}
 */
async function selectStrategy(args) {
  const {
    rawDescription, brandbook, format, refs, observations,
    enabledModels, settings, tenantId, userId, clientId, jobId,
  } = args;

  const llmModel = settings?.smart_mode_model || 'gpt-4o-mini';

  // Monta user message com TODO contexto relevante
  const userMessage = JSON.stringify({
    rawDescription,
    format,
    observations: observations || null,
    refs: (refs || []).map(r => ({ mode: r.mode })),  // não envia URLs, só modos
    enabledModels,
    brandbook: brandbook
      ? {
          tone: brandbook.structured_data?.tone,
          style_keywords: brandbook.structured_data?.style_keywords,
        }
      : null,
  }, null, 2);

  let parsed = null;
  try {
    const result = await runCompletionWithModel(
      llmModel,
      SMART_SELECTOR_SYSTEM,
      userMessage,
      400,
      {
        tenantId, userId: userId || null, clientId: clientId || null,
        operationType: 'image_smart_selector',
        sessionId: jobId,
      }
    );
    const text = String(result.text || '').trim();
    // Tira markdown fences se vierem
    const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn('[WARN][SmartSelector] LLM falhou — caindo pra heurística', { error: err.message });
    parsed = null;
  }

  // Validação mínima do retorno do LLM
  const validReferenceModes = ['text-only', 'image-edit', 'multi-image'];
  const isValid = parsed
    && typeof parsed.primary_model === 'string'
    && enabledModels.includes(parsed.primary_model)
    && validReferenceModes.includes(parsed.reference_mode);

  if (!isValid) {
    if (parsed) console.warn('[WARN][SmartSelector] retorno inválido, usando heurística', { parsed });
    const fallback = selectByHeuristic({ rawDescription, format, refs, enabledModels });
    return { ...fallback, smart_failed: !!parsed, used_smart_mode: false };
  }

  return {
    primary_model: parsed.primary_model,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
    reasoning: parsed.reasoning || 'Decisão do Smart Mode',
    reference_mode: parsed.reference_mode,
    needs_multi_step: !!parsed.needs_multi_step,
    sub_steps: Array.isArray(parsed.sub_steps) ? parsed.sub_steps : [],
    used_smart_mode: true,
  };
}

module.exports = { selectStrategy };
