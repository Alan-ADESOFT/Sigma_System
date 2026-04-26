/**
 * @fileoverview Reference Vision — descreve imagens de referência via Vision API
 * @description Antes de chamar o Prompt Engineer, todas as referências são
 * descritas em texto pra serem injetadas no prompt final. Sem isso o LLM não
 * tem ideia do que tem nas imagens e gera resultado genérico (bug que o user
 * reportou: pediu uma imagem dele em terno e óculos, recebeu ilustração random
 * de homem feliz).
 *
 * Estratégia:
 *   1. Carrega cada arquivo de /uploads/... como Buffer
 *   2. Manda pro Vision (gpt-4o ou gpt-4o-mini) com prompt focado em descrever
 *      pessoa/objeto/cenário pra reuso visual
 *   3. Retorna array de strings descritivas (uma por imagem)
 *
 * NOTA: provedores que suportam image input nativo (Gemini Nano Banana) podem
 * ser estendidos pra passar a imagem direto, sem precisar dessa descrição.
 * Por ora, todos os provedores usam apenas a descrição (cobre os 4 modelos
 * suportados sem variar o pipeline).
 */

const fs = require('fs').promises;
const path = require('path');
const { analyzeMultipleImages } = require('../../../infra/api/vision');

const VISION_INSTRUCTION = `Descreva esta imagem em 2-3 frases curtas focando em elementos visuais REUTILIZÁVEIS para uma geração de imagem com IA.

Inclua quando aplicável:
- Pessoa: idade aproximada, gênero, cabelo, traços marcantes (óculos, barba, etc), roupa, expressão
- Objeto/produto: tipo, cor, formato, material
- Cenário: ambiente, iluminação, paleta de cores predominante
- Composição: enquadramento (close, plano médio, plano aberto), ângulo

Foco em DESCRIÇÃO VISUAL FACTUAL, não interpretativa. Não invente nomes, marcas ou contextos. Não use markdown nem listas — apenas frases corridas.`;

/**
 * Carrega arquivo local de /uploads/ como Buffer.
 * Rejeita paths absolutos ou com `..` (defesa contra path traversal).
 *
 * @param {string} internalUrl - ex: "/uploads/images/abc.jpg"
 * @returns {Promise<Buffer|null>} buffer ou null se não conseguir ler
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
 * Descreve as imagens de referência em texto via Vision API.
 *
 * @param {object} args
 * @param {Array<string>} args.urls - URLs internas /uploads/...
 * @param {string} args.tenantId
 * @param {string} [args.clientId]
 * @param {string} [args.jobId]
 * @returns {Promise<{ descriptions: Array<string>, tokens: number }>}
 *   descriptions: array com uma descrição por URL bem-sucedida (mantém ordem,
 *   pula falhas em silêncio).
 */
async function describeReferences({ urls, tenantId, clientId, jobId }) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return { descriptions: [], tokens: 0 };
  }

  console.log('[INFO][ReferenceVision] descrevendo refs', {
    tenantId, jobId, count: urls.length,
  });

  // Carrega todos os buffers em paralelo
  const buffers = await Promise.all(urls.map(loadLocalUpload));
  const validBuffers = buffers.filter(b => b !== null);

  if (validBuffers.length === 0) {
    console.warn('[WARN][ReferenceVision] nenhuma referência pôde ser carregada');
    return { descriptions: [], tokens: 0 };
  }

  try {
    const result = await analyzeMultipleImages(validBuffers, VISION_INSTRUCTION, {
      detail: 'high',
      maxTokens: 600,
    });
    // analyzeMultipleImages retorna { analysis, modelUsed, tokens } com TODAS
    // as imagens analisadas em UMA chamada. O texto vem segmentado por imagem.
    // Pra simplicidade do prompt engineer, mantemos como UM bloco com
    // marcadores [Imagem N] que o LLM downstream sabe interpretar.
    const text = (result?.analysis || '').trim();
    if (!text) {
      console.warn('[WARN][ReferenceVision] Vision retornou vazio');
      return { descriptions: [], tokens: result?.tokens || 0 };
    }
    // Devolvemos tudo em um único item — o consumidor injeta como bloco único
    // no prompt. Caso queiramos separar por imagem no futuro, basta fazer parse
    // dos marcadores [Imagem 1], [Imagem 2], etc.
    return {
      descriptions: [text],
      tokens: result?.tokens || 0,
    };
  } catch (err) {
    // Não quebra o fluxo de geração só porque vision falhou — registra e segue
    // sem descrição (resultado vai ser genérico, mas geração não falha).
    console.error('[ERRO][ReferenceVision] falha ao descrever refs', {
      tenantId, jobId, error: err.message,
    });
    return { descriptions: [], tokens: 0 };
  }
}

module.exports = { describeReferences };
