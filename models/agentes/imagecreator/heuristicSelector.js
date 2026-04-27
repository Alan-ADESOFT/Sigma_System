/**
 * @fileoverview Seletor heurístico de modelo + reference mode
 * @description Default quando smart_mode_enabled = false (padrão).
 * Decide qual modelo usar baseado em regras simples a partir das refs e do
 * texto do pedido. Sem chamada de LLM (custo zero).
 *
 *
 * Regras (em ordem de precedência):
 *   1. char + scene OU ≥3 refs        → Nano Banana 2 (multi-imagem nativo)
 *   2. char puro (sem scene)          → Flux Kontext Pro (especialista pessoa)
 *   3. tipografia/logo/banner         → Nano Banana 2 (texto preciso)
 *   4. produto + char                 → Imagen 3 Capability (subject types)
 *   5. sem refs                       → Imagen 4 (text-to-image, mais barato)
 *   6. default                        → Nano Banana 2 (versátil)
 */

const FALLBACK_MODEL = 'gemini-3.1-flash-image-preview';

/**
 * Seleciona modelo + reference mode baseado em heurística.
 *
 * @param {object} args
 * @param {string} args.rawDescription
 * @param {string} args.format
 * @param {Array<{url: string, mode: string}>} args.refs
 * @param {Array<string>} args.enabledModels
 * @returns {{
 *   primary_model: string,
 *   confidence: number,
 *   reasoning: string,
 *   reference_mode: 'text-only'|'image-edit'|'multi-image',
 *   used_smart_mode: boolean
 * }}
 */
function selectByHeuristic({ rawDescription, format, refs, enabledModels }) {
  const lower = String(rawDescription || '').toLowerCase();
  const enabled = Array.isArray(enabledModels) ? enabledModels : [];

  const refList = Array.isArray(refs) ? refs : [];
  const hasChar = refList.some(r => r.mode === 'character');
  const hasScene = refList.some(r => r.mode === 'scene');
  const refsCount = refList.length;

  function pick(model, confidence, reasoning, referenceMode) {
    return { primary_model: model, confidence, reasoning, reference_mode: referenceMode, used_smart_mode: false };
  }

  // 1. Char + Scene OU ≥3 refs → Nano Banana 2 (multi-imagem nativo)
  if ((hasChar && hasScene) || refsCount >= 3) {
    if (enabled.includes('gemini-3.1-flash-image-preview')) {
      return pick(
        'gemini-3.1-flash-image-preview', 0.9,
        'Multi-imagem combinando referências — Nano Banana 2 nativo',
        'multi-image',
      );
    }
  }

  // 2. Char puro → Flux Kontext Pro
  if (hasChar && !hasScene && enabled.includes('fal-ai/flux-pro/kontext')) {
    return pick(
      'fal-ai/flux-pro/kontext', 0.95,
      'Preservar personagem da referência — Flux Kontext Pro é especialista',
      'image-edit',
    );
  }

  // 3. Tipografia/logo/banner → Nano Banana 2
  if (/\b(logo|poster|banner|headline|texto|tipografia|marca|brand|cartaz)\b/.test(lower)) {
    if (enabled.includes('gemini-3.1-flash-image-preview')) {
      return pick(
        'gemini-3.1-flash-image-preview', 0.85,
        'Tarefa envolve tipografia — Nano Banana 2 tem texto preciso',
        refsCount > 0 ? 'multi-image' : 'text-only',
      );
    }
  }

  // 4. Produto + char → Imagen 3 Capability
  if (/\b(produto|garrafa|embalagem|pacote|caixa|frasco)\b/.test(lower) &&
      hasChar &&
      enabled.includes('imagen-3.0-capability-001')) {
    return pick(
      'imagen-3.0-capability-001', 0.8,
      'Produto específico com referência — subject types tipados',
      'image-edit',
    );
  }

  // 5. Sem refs → Imagen 4 (mais barato)
  if (refsCount === 0) {
    if (enabled.includes('imagen-4.0-generate-001')) {
      return pick(
        'imagen-4.0-generate-001', 0.75,
        'Geração text-to-image simples — Imagen 4',
        'text-only',
      );
    }
  }

  // 6. Default versátil → Nano Banana 2
  if (enabled.includes('gemini-3.1-flash-image-preview')) {
    return pick(
      'gemini-3.1-flash-image-preview', 0.7,
      'Modelo default versátil — Nano Banana 2',
      refsCount > 0 ? 'multi-image' : 'text-only',
    );
  }

  // Fallback final: primeiro habilitado ou modelo default seguro
  return pick(
    enabled[0] || FALLBACK_MODEL, 0.5,
    'Fallback — primeiro modelo habilitado',
    'text-only',
  );
}

module.exports = { selectByHeuristic };
