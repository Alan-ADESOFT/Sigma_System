/**
 * @fileoverview AutoMode — decide qual modelo usar SEM perguntar ao usuário
 * @description Sprint v1.2 — abril/2026.
 *
 * Substitui na prática o par heuristicSelector + smartSelector quando o user
 * envia model='auto'. Diferenças do anterior:
 *   1. Lineup reduzido a 3 modelos: Nano Banana 2 / GPT Image 2 / Flux Kontext.
 *   2. Sempre roda — não há mais flag smart_mode_enabled exposta na UI.
 *   3. Usa o output do refClassifier (hasFace/isProduct/role) pra decidir
 *      sem outra chamada de LLM (custo zero adicional).
 *   4. Resolve gpt-image-2 → fallback gpt-image-1.5 → gpt-image-1 via cache
 *      do probe (image_settings.openai_image_model_resolved).
 *
 * Regras determinísticas (precedência top-down):
 *   A. char + hasFace + edit pequeno (regex)         → gpt-image-2 (preserva +
 *      faz edição pontual com excelente fidelidade)
 *   B. char + hasFace + nova geração                 → flux-pro/kontext
 *   C. 3+ refs OU char+scene                         → nano-banana-2 (multi-imagem)
 *   D. logo/poster/banner/headline/tipografia/texto  → gpt-image-2 (lidera
 *      tipografia em abril/2026)
 *   E. default                                       → nano-banana-2
 *
 * heuristicSelector.js e smartSelector.js permanecem no repo (compat reversa
 * pra abrir jobs antigos / modo avançado).
 */

const FALLBACK_MODEL = 'gemini-3.1-flash-image-preview';
const FLUX_KONTEXT   = 'fal-ai/flux-pro/kontext';
const GPT_IMAGE      = 'gpt-image-2'; // resolvido em runtime via probe

/**
 * Detecta se a descrição é uma EDIÇÃO PEQUENA (modificação pontual da ref)
 * vs uma nova geração que apenas usa a pessoa como referência.
 *
 * Heurísticas de "edição pequena" — sentenças curtas com verbo de modificação
 * pontual sobre um único elemento.
 */
function isSmallEdit(rawDescription) {
  const lower = String(rawDescription || '').toLowerCase().trim();
  if (!lower || lower.length > 200) return false; // edições longas viram nova geração
  // Verbos típicos de edição
  const editVerbs = /\b(troc(ar|a)|remov(er|a)|adicion(ar|a)|coloc(ar|a)|tir(ar|a)|substitu(ir|i)|mud(ar|a)|pint(ar|a)|escur(ec(er|a))|clarear|borr(ar|a)|deix(ar|a))\b/;
  return editVerbs.test(lower);
}

/**
 * Detecta tarefa primariamente tipográfica/branding (logo/poster/banner).
 */
function isTypographyTask(rawDescription) {
  return /\b(logo|poster|banner|headline|tipografia|texto|cartaz|outdoor|capa|t[ií]tulo|chamada)\b/i.test(
    rawDescription || ''
  );
}

/**
 * Decide modelo + reference mode determinísticamente.
 *
 * @param {object} args
 * @param {string} args.rawDescription
 * @param {Array<{url, mode, hasFace?, isProduct?}>} args.refs - já classificadas
 *        (vem do refClassifier no worker; mode='character'|'scene'|'inspiration')
 * @param {Array<string>} args.enabledModels - lineup habilitado em settings
 * @param {string|null} [args.openAIResolved] - cache do probe (gpt-image-2|1.5|1)
 * @returns {{
 *   primary_model: string,
 *   confidence: number,
 *   reasoning: string,
 *   reference_mode: 'text-only'|'image-edit'|'multi-image',
 *   used_smart_mode: false,
 *   auto_mode: true
 * }}
 */
function decide({ rawDescription, refs = [], enabledModels = [], openAIResolved = null }) {
  const enabled = Array.isArray(enabledModels) ? enabledModels : [];
  const refList = Array.isArray(refs) ? refs : [];
  const hasChar = refList.some(r => r.mode === 'character');
  const hasScene = refList.some(r => r.mode === 'scene');
  const hasFace = refList.some(r => r.hasFace);
  const refsCount = refList.length;

  // Resolve gpt-image-2 pelo probe — se não disponível, marca null pra evitar
  function gptImageActual() {
    return openAIResolved || GPT_IMAGE; // assume gpt-image-2 se ainda não probado
  }
  function isGptEnabledOrAuto() {
    // 'auto' do enabledModels significa todos os providers do lineup novo
    return enabled.includes(GPT_IMAGE) || enabled.includes('gpt-image-1.5') || enabled.includes('gpt-image-1');
  }

  function pick(model, confidence, reasoning, referenceMode) {
    return {
      primary_model: model,
      confidence,
      reasoning,
      reference_mode: referenceMode,
      used_smart_mode: false,
      auto_mode: true,
    };
  }

  // A. Char + face + edit pequeno → GPT Image (alta fidelidade + edit, aceita 4 refs)
  // Continua valendo com múltiplas refs (gpt-image-2 max=4).
  if (hasChar && hasFace && isSmallEdit(rawDescription) && isGptEnabledOrAuto()) {
    return pick(
      gptImageActual(), 0.92,
      'Edição pontual sobre pessoa identificável — GPT Image preserva fidelidade facial e executa edits específicos.',
      'image-edit',
    );
  }

  // B. Char + face com 1 ref ÚNICA → Flux Kontext Pro (especialista em preservar pessoa).
  // CRÍTICO: Flux Kontext aceita só 1 image input. Com múltiplas refs, escolher
  // Flux desperdiça as outras (cortadas pelo loadImageInputsForProvider). Por
  // isso só usamos quando refs.length === 1.
  if (hasChar && hasFace && refsCount === 1 && enabled.includes(FLUX_KONTEXT)) {
    return pick(
      FLUX_KONTEXT, 0.95,
      'Pessoa identificável a preservar (1 ref) — Flux Kontext Pro é especialista em consistência de identidade.',
      'image-edit',
    );
  }

  // C. Múltiplas refs (2+) OU char+scene → Nano Banana 2 (até 14 refs).
  // Antes era 3+; abaixei pra 2+ porque a alternativa pra char+face com 2-4 refs
  // (gpt-image-2 max=4 ou flux-kontext max=1) pode cortar refs. Nano Banana 2
  // não corta nada até 14.
  if ((hasChar && hasScene) || refsCount >= 2) {
    if (enabled.includes(FALLBACK_MODEL)) {
      return pick(
        FALLBACK_MODEL, 0.9,
        `Múltiplas referências (${refsCount}) — Nano Banana 2 nativo em multi-imagem (até 14 refs sem corte).`,
        'multi-image',
      );
    }
  }

  // D. Tipografia / logo / banner → GPT Image (lidera Arena em texto)
  if (isTypographyTask(rawDescription) && isGptEnabledOrAuto()) {
    return pick(
      gptImageActual(), 0.88,
      'Tarefa tipográfica/branding — GPT Image lidera benchmark de texto em imagem.',
      refsCount > 0 ? 'multi-image' : 'text-only',
    );
  }

  // E. Default versátil → Nano Banana 2
  if (enabled.includes(FALLBACK_MODEL)) {
    return pick(
      FALLBACK_MODEL, 0.75,
      refsCount > 0
        ? 'Caso geral com referência(s) — Nano Banana 2 cobre bem.'
        : 'Geração text-to-image padrão — Nano Banana 2 cobre bem.',
      refsCount > 0 ? 'multi-image' : 'text-only',
    );
  }

  // Fallback final: primeiro habilitado
  return pick(
    enabled[0] || FALLBACK_MODEL, 0.5,
    'Fallback — primeiro modelo habilitado.',
    'text-only',
  );
}

module.exports = {
  decide,
  isSmallEdit,
  isTypographyTask,
};
