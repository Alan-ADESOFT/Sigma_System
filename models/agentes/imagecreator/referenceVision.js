/**
 * @fileoverview Reference Vision — descreve imagens de referência via Vision API
 * @description Antes de chamar o Prompt Engineer, todas as referências são
 * descritas em texto pra serem injetadas no prompt final.
 *
 * scene), com instruções específicas pra cada um. Provedores que aceitam
 * image input nativo (Nano Banana 2, Flux Kontext, GPT Image 2, Imagen 3 Cap)
 * recebem os bytes diretamente; os demais usam só a descrição textual.
 *
 * Modos:
 *   · inspiration — descreve estilo, paleta, mood (reuso de estilo)
 *   · character  — descreve sujeito traço a traço (preservar identidade)
 *   · scene      — descreve cenário/ambiente (usar como fundo)
 *
 * O legado describeReferences(...) continua funcionando como modo
 * 'inspiration' implícito (compat reversa com chamadas antigas).
 */

const fs = require('fs').promises;
const path = require('path');
const { analyzeImage, analyzeMultipleImages } = require('../../../infra/api/vision');
const { logUsage } = require('../../copy/tokenUsage');

// ── Instruções de Vision por modo ──────────────────────────────────────────
// As três strings abaixo são EXPORTADAS pra serem editáveis via biblioteca de
// prompts (pages/api/settings/prompt-library.js). O caller pode passar overrides.
const INSPIRATION_INSTRUCTION = `Descreva o ESTILO VISUAL desta imagem em 2-3 frases. Foque em: paleta de cores, mood, técnica fotográfica, composição, iluminação, gênero/escola visual. NÃO descreva sujeitos específicos. NÃO descreva pessoas/objetos em detalhe. Foco em REUTILIZAR o estilo, não o conteúdo. Sem markdown, sem listas — apenas frases corridas.`;

const CHARACTER_INSTRUCTION = `Descreva DETALHADAMENTE o sujeito principal desta imagem em 4-6 frases. Inclua: idade aproximada, gênero, traços faciais marcantes (formato do rosto, olhos, nariz, boca), cabelo (cor, comprimento, estilo), barba/maquiagem, expressão, acessórios (óculos, joias, chapéu), roupa (cor, estilo, material), postura. Esta descrição será usada para REPRODUZIR exatamente este sujeito em outra imagem. Seja específico e factual, sem invenções. Sem markdown — frases corridas.`;

const SCENE_INSTRUCTION = `Descreva o CENÁRIO/AMBIENTE desta imagem em 3-4 frases. Inclua: local (interno/externo, tipo), iluminação (natural/artificial, hora do dia, direção, qualidade), elementos do fundo, paleta de cores predominante, mood/atmosfera, profundidade de campo. Esta descrição será usada como ambiente de fundo para uma nova geração. Sem markdown — frases corridas.`;

const FIXED_REF_INSTRUCTION = `Descreva esta REFERÊNCIA FIXA da marca em 3-4 frases. Identifique: o que ela representa visualmente (modelo, produto, fotografia de campanha, mood board), elementos visuais reutilizáveis (paleta, tipografia, composição, estilo). Esta descrição é cacheada e injetada em TODA geração desta marca como contexto visual. Sem markdown — frases corridas.`;

const VISION_INSTRUCTION_BY_MODE = {
  inspiration: INSPIRATION_INSTRUCTION,
  character:   CHARACTER_INSTRUCTION,
  scene:       SCENE_INSTRUCTION,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Carrega arquivo local de /uploads/ como Buffer.
 * Rejeita paths absolutos ou com `..` (defesa contra path traversal).
 */
async function loadLocalUpload(internalUrl) {
  if (!internalUrl || typeof internalUrl !== 'string') return null;
  if (!internalUrl.startsWith('/uploads/')) return null;
  if (internalUrl.includes('..')) return null;

  try {
    const fullPath = path.join(process.cwd(), 'public', internalUrl);
    return await fs.readFile(fullPath);
  } catch (err) {
    console.warn('[WARN][ReferenceVision] não consegui ler arquivo', {
      url: internalUrl, error: err.message,
    });
    return null;
  }
}

/**
 * Resolve o operationType pra logUsage com base no modo.
 */
function operationTypeForMode(mode) {
  switch (mode) {
    case 'character':  return 'image_reference_describe_character';
    case 'scene':      return 'image_reference_describe_scene';
    case 'inspiration':
    default:           return 'image_reference_describe_inspiration';
  }
}

// ── API pública ────────────────────────────────────────────────────────────

/**
 * Descreve imagens de referência por MODO. Agrupa por modo, descreve cada
 * grupo com a instrução específica e retorna o resultado segmentado.
 *
 * @param {object} args
 * @param {Array<{url: string, mode: string}>} args.refs
 * @param {string} args.tenantId
 * @param {string} [args.clientId]
 * @param {string} [args.jobId]
 * @returns {Promise<{
 *   byMode: { inspiration: string[], character: string[], scene: string[] },
 *   tokens: number,
 *   modelUsed: string|null
 * }>}
 */
async function describeReferencesByMode({ refs, tenantId, clientId, jobId }) {
  const byMode = { inspiration: [], character: [], scene: [] };
  let tokens = 0;
  let modelUsed = null;

  if (!Array.isArray(refs) || refs.length === 0) {
    return { byMode, tokens, modelUsed };
  }

  // Agrupa as refs por modo (default 'inspiration' quando ausente)
  const groups = { inspiration: [], character: [], scene: [] };
  for (const r of refs) {
    const mode = ['inspiration', 'character', 'scene'].includes(r.mode) ? r.mode : 'inspiration';
    if (r.url) groups[mode].push(r.url);
  }

  console.log('[INFO][ReferenceVision] descrevendo refs por modo', {
    tenantId, jobId,
    counts: {
      inspiration: groups.inspiration.length,
      character:   groups.character.length,
      scene:       groups.scene.length,
    },
  });

  // Processa cada modo em sequência (Vision API pode ter rate limit; ficamos
  // conservadores). Cada chamada usa a instrução específica do modo.
  for (const mode of ['inspiration', 'character', 'scene']) {
    const urls = groups[mode];
    if (urls.length === 0) continue;

    // Para 'character', descrevemos UMA imagem por chamada (precisamos da
    // descrição individual por sujeito). Pros outros modos, agrupar é OK.
    const useIndividual = mode === 'character';

    if (useIndividual) {
      for (const url of urls) {
        const buffer = await loadLocalUpload(url);
        if (!buffer) continue;
        try {
          const result = await analyzeImage(buffer, VISION_INSTRUCTION_BY_MODE[mode], {
            detail: 'high',
            maxTokens: 700,
          });
          const text = (result?.analysis || '').trim();
          if (text) byMode[mode].push(text);
          tokens += result?.tokens || 0;
          if (!modelUsed && result?.modelUsed) modelUsed = result.modelUsed;

          // Token tracking — operação distinta por modo
          if (tenantId) {
            logUsage({
              tenantId,
              clientId: clientId || null,
              sessionId: jobId || null,
              modelUsed: result?.modelUsed || 'gpt-4o-mini',
              provider: 'openai',
              operationType: operationTypeForMode(mode),
              tokensInput: result?.tokensInput || 0,
              tokensOutput: result?.tokensOutput || 0,
              metadata: { mode, refCount: 1 },
            }).catch(() => {});
          }
        } catch (err) {
          console.error('[ERRO][ReferenceVision] vision falhou', {
            tenantId, jobId, mode, url, error: err.message,
          });
        }
      }
    } else {
      // Modos inspiration/scene: agrupa numa chamada
      const buffers = (await Promise.all(urls.map(loadLocalUpload))).filter(Boolean);
      if (buffers.length === 0) continue;

      try {
        const result = await analyzeMultipleImages(buffers, VISION_INSTRUCTION_BY_MODE[mode], {
          detail: 'high',
          maxTokens: 600,
        });
        const text = (result?.analysis || '').trim();
        if (text) byMode[mode].push(text);
        tokens += result?.tokens || 0;
        if (!modelUsed && result?.modelUsed) modelUsed = result.modelUsed;

        if (tenantId) {
          logUsage({
            tenantId,
            clientId: clientId || null,
            sessionId: jobId || null,
            modelUsed: result?.modelUsed || 'gpt-4o-mini',
            provider: 'openai',
            operationType: operationTypeForMode(mode),
            tokensInput: result?.tokensInput || 0,
            tokensOutput: result?.tokensOutput || 0,
            metadata: { mode, refCount: buffers.length },
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[ERRO][ReferenceVision] vision falhou', {
          tenantId, jobId, mode, error: err.message,
        });
      }
    }
  }

  return { byMode, tokens, modelUsed };
}

/**
 * LEGADO — mantém a API antiga funcionando (modo 'inspiration' implícito).
 * Usado por código antigo que ainda chama describeReferences({ urls, ... }).
 *
 * @param {object} args
 * @param {Array<string>} args.urls - URLs internas /uploads/...
 * @param {string} args.tenantId
 * @param {string} [args.clientId]
 * @param {string} [args.jobId]
 * @returns {Promise<{ descriptions: Array<string>, tokens: number }>}
 */
async function describeReferences({ urls, tenantId, clientId, jobId }) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { descriptions: [], tokens: 0 };
  }
  const refs = urls.map(url => ({ url, mode: 'inspiration' }));
  const result = await describeReferencesByMode({ refs, tenantId, clientId, jobId });
  // Junta tudo num único array (compat com signature antiga)
  const descriptions = [
    ...result.byMode.inspiration,
    ...result.byMode.character,
    ...result.byMode.scene,
  ];
  return { descriptions, tokens: result.tokens };
}

/**
 * Descreve UMA fixed reference do brandbook (chamada 1× por imagem por
 * janela de 30 dias — caching no banco). Ver server/imageWorker.js.
 *
 * @param {{ url: string, label?: string }} fixedRef
 * @param {string} tenantId
 * @returns {Promise<{ description: string, tokens: number, modelUsed: string|null }>}
 */
async function describeFixedReference(fixedRef, tenantId) {
  if (!fixedRef?.url) return { description: '', tokens: 0, modelUsed: null };
  const buffer = await loadLocalUpload(fixedRef.url);
  if (!buffer) return { description: '', tokens: 0, modelUsed: null };

  try {
    const result = await analyzeImage(buffer, FIXED_REF_INSTRUCTION, {
      detail: 'high', maxTokens: 500,
    });
    const description = (result?.analysis || '').trim();

    if (tenantId && description) {
      logUsage({
        tenantId,
        modelUsed: result?.modelUsed || 'gpt-4o-mini',
        provider: 'openai',
        operationType: 'image_brandbook_fixed_ref_describe',
        tokensInput: result?.tokensInput || 0,
        tokensOutput: result?.tokensOutput || 0,
        metadata: { label: fixedRef.label || null },
      }).catch(() => {});
    }

    return {
      description,
      tokens: result?.tokens || 0,
      modelUsed: result?.modelUsed || null,
    };
  } catch (err) {
    console.error('[ERRO][ReferenceVision] fixed ref vision falhou', {
      tenantId, url: fixedRef.url, error: err.message,
    });
    return { description: '', tokens: 0, modelUsed: null };
  }
}

module.exports = {
  describeReferences,
  describeReferencesByMode,
  describeFixedReference,
  loadLocalUpload,
  // Exports pra prompt library editar
  INSPIRATION_INSTRUCTION,
  CHARACTER_INSTRUCTION,
  SCENE_INSTRUCTION,
  FIXED_REF_INSTRUCTION,
};
