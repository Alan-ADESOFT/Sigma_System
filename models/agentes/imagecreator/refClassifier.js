/**
 * @fileoverview Reference Classifier
 * @description Classifica automaticamente cada imagem de referência subida
 * pelo usuário em um dos 3 papéis (character/scene/inspiration) +
 * detecta hasFace e isProduct. Substitui o `<select>` manual de modo no
 * ReferenceUploader — o usuário só sobe a imagem.
 *
 * Pipeline:
 *   1. Pra cada ref, carrega o buffer via /uploads/ (path traversal-safe).
 *   2. Chama Vision API (gpt-4o-mini, ~$0.0003 por ref) com prompt curto
 *      pedindo JSON estruturado.
 *   3. Faz parse robusto (tira fences markdown se vierem) e valida o role.
 *   4. Em caso de falha: fallback role='inspiration', hasFace/isProduct=false.
 *   5. Loga uso em ai_token_usage com operationType='image_ref_classifier'.
 *
 * Output (Array<{url, role, hasFace, isProduct, shortDescription}>) é
 * persistido em image_jobs.auto_classified_refs (JSONB) pra debug e
 * usado pelo autoMode pra decidir o modelo.
 */

const { analyzeImage } = require('../../../infra/api/vision');
const { logUsage } = require('../../copy/tokenUsage');
const { loadLocalUpload } = require('./referenceVision');

const VALID_ROLES = ['character', 'scene', 'inspiration'];

const CLASSIFIER_INSTRUCTION_TEMPLATE = (rawDescription) => `Esta é uma imagem de referência que o usuário enviou para gerar uma nova imagem. Contexto do pedido do usuário: "${(rawDescription || '').slice(0, 300)}".

Classifique esta referência em UM dos três papéis:
- "character": mostra UMA pessoa identificável (rosto visível) ou objeto/produto específico que deve ser PRESERVADO na nova imagem.
- "scene": mostra um cenário, ambiente, paisagem ou fundo que deve virar o ambiente da nova imagem.
- "inspiration": serve apenas como referência de estilo, paleta, mood ou composição (não tem sujeito específico a preservar).

Devolva EXCLUSIVAMENTE um JSON nesta forma (sem markdown, sem fences, sem prosa):
{"role":"character|scene|inspiration","hasFace":true|false,"isProduct":true|false,"shortDescription":"uma frase curta em pt-BR descrevendo a referência"}

Regras:
- "hasFace" = true se há rosto humano visível e identificável.
- "isProduct" = true se a referência é primariamente um produto físico (garrafa, embalagem, equipamento, etc).
- "shortDescription" max 120 caracteres.
- Quando em dúvida entre character e inspiration, prefira character se há rosto/produto identificável.
- Quando em dúvida entre scene e inspiration, prefira scene se há ambiente claro.`;

/**
 * Tenta extrair JSON do retorno do LLM, tolerante a markdown fences.
 */
function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = String(text)
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    // Última tentativa: extrair primeiro objeto {...}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* noop */ }
    }
    return null;
  }
}

/**
 * Classifica um array de refs. Falha por ref é isolada — sempre devolve
 * um item por entrada (com fallback).
 *
 * @param {object} args
 * @param {Array<{url: string, mode?: string}>} args.refs - refs do usuário
 * @param {string} [args.rawDescription] - texto do pedido (contexto pro LLM)
 * @param {string} args.tenantId
 * @param {string} [args.clientId]
 * @param {string} [args.jobId]
 * @returns {Promise<Array<{
 *   url: string,
 *   role: 'character'|'scene'|'inspiration',
 *   hasFace: boolean,
 *   isProduct: boolean,
 *   shortDescription: string,
 *   classifierFallback?: boolean
 * }>>}
 */
async function classifyReferences({ refs, rawDescription, tenantId, clientId, jobId }) {
  if (!Array.isArray(refs) || refs.length === 0) return [];

  // Refs com mode já setado pelo caller são preservadas — não desperdiçar
  // tokens reclassificando + evita conflito (ex: edit envia a imagem original
  // explicitamente como 'character', não queremos o classifier sobrescrever).
  const preserved = refs.filter(r => r?.url && VALID_ROLES.includes(r.mode));
  const toClassify = refs.filter(r => r?.url && !VALID_ROLES.includes(r.mode));

  console.log('[INFO][RefClassifier] processando refs', {
    tenantId, jobId,
    total: refs.length,
    preserved: preserved.length,
    toClassify: toClassify.length,
  });

  const out = [
    ...preserved.map(r => ({
      url: r.url,
      role: r.mode,
      hasFace: !!r.hasFace,
      isProduct: !!r.isProduct,
      shortDescription: r.shortDescription || '',
      classifierSkipped: true,
    })),
  ];

  if (toClassify.length === 0) return out;

  const instruction = CLASSIFIER_INSTRUCTION_TEMPLATE(rawDescription);

  for (const ref of toClassify) {

    // Fallback default — usado em qualquer caminho de erro
    const fallback = {
      url: ref.url,
      role: 'inspiration',
      hasFace: false,
      isProduct: false,
      shortDescription: '',
      classifierFallback: true,
    };

    let buffer;
    try {
      buffer = await loadLocalUpload(ref.url);
    } catch {
      buffer = null;
    }
    if (!buffer) {
      console.warn('[WARN][RefClassifier] não consegui carregar buffer', { url: ref.url });
      out.push(fallback);
      continue;
    }

    try {
      const result = await analyzeImage(buffer, instruction, {
        detail: 'low',  // baixa resolução é suficiente pra classificar
        maxTokens: 200,
      });

      // Token tracking
      if (tenantId) {
        logUsage({
          tenantId,
          clientId: clientId || null,
          sessionId: jobId || null,
          modelUsed: result?.modelUsed || 'gpt-4o-mini',
          provider: 'openai',
          operationType: 'image_ref_classifier',
          tokensInput: result?.tokensInput || 0,
          tokensOutput: result?.tokensOutput || 0,
          metadata: { url: ref.url },
        }).catch(() => {});
      }

      const parsed = safeParseJSON(result?.analysis);
      if (!parsed || !VALID_ROLES.includes(parsed.role)) {
        console.warn('[WARN][RefClassifier] retorno inválido — fallback', {
          url: ref.url, raw: (result?.analysis || '').slice(0, 200),
        });
        out.push(fallback);
        continue;
      }

      out.push({
        url: ref.url,
        role: parsed.role,
        hasFace: !!parsed.hasFace,
        isProduct: !!parsed.isProduct,
        shortDescription: String(parsed.shortDescription || '').slice(0, 120),
      });
    } catch (err) {
      console.error('[ERRO][RefClassifier] vision falhou — fallback', {
        url: ref.url, error: err.message,
      });
      out.push(fallback);
    }
  }

  console.log('[SUCESSO][RefClassifier] classificação concluída', {
    tenantId, jobId,
    breakdown: out.reduce((acc, r) => {
      acc[r.role] = (acc[r.role] || 0) + 1;
      return acc;
    }, {}),
    fallbacks: out.filter(r => r.classifierFallback).length,
  });

  return out;
}

/**
 * Mapeia o `role` do classifier pro `mode` legado usado pelo
 * referenceVision e pelo restante do pipeline. v1.2: 1:1 — os nomes
 * batem. Mantemos a função pra deixar explícito o ponto de tradução.
 */
function roleToLegacyMode(role) {
  return ['character', 'scene', 'inspiration'].includes(role)
    ? role
    : 'inspiration';
}

module.exports = {
  classifyReferences,
  roleToLegacyMode,
  CLASSIFIER_INSTRUCTION_TEMPLATE,
};
