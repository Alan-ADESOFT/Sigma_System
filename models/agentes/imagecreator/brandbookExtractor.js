/**
 * @fileoverview Brandbook Extractor — estrutura PDF/HTML em JSON
 * @description Dois fluxos:
 *   · extractFromText:        recebe texto bruto (PDF/HTML extraído) e estrutura
 *   · generateFromDescription: usuário descreve a marca em texto livre, IA gera
 * Ambos retornam o mesmo schema (compatível com structured_data de
 * client_brandbooks).
 */

const { runCompletionWithModel } = require('../../ia/completion');
const { getOrCreate: getSettings } = require('../../imageSettings.model');
const extractPrompt = require('./prompts/brandbookExtract');
const fromTextPrompt = require('./prompts/brandbookFromText');

/**
 * Tenta parsear o JSON retornado pelo LLM, mesmo se vier com ``` ao redor.
 */
function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Tenta extrair o primeiro objeto {...} do texto
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

/**
 * Schema padrão usado como fallback quando o LLM falha em estruturar.
 */
function emptyBrandbookSchema() {
  return {
    palette:    { primary: '', secondary: '', accent: '', neutral: [], text: '' },
    typography: { primary_font: '', secondary_font: '', weights: [] },
    tone: '',
    style_keywords: [],
    do: [],
    dont: [],
    references: [],
    notes: '',
  };
}

/**
 * Extrai brandbook estruturado a partir de texto bruto (PDF/HTML).
 *
 * @param {object} args
 * @param {string} args.text
 * @param {'pdf'|'html'|'manual_description'} args.source
 * @param {string} args.tenantId
 * @param {string} args.userId
 * @param {string} [args.clientId]
 */
async function extractFromText(args) {
  const { text, source, tenantId, userId, clientId } = args;
  if (!text || !tenantId) throw new Error('extractFromText: text e tenantId obrigatórios');

  const settings = await getSettings(tenantId);
  const llmModel = settings.brandbook_extractor_model || 'gpt-4o-mini';

  console.log('[INFO][BrandbookExtractor] extraindo', {
    tenantId, userId, clientId, source, textLength: text.length, llmModel,
  });

  const result = await runCompletionWithModel(
    llmModel,
    extractPrompt.BRANDBOOK_EXTRACT_SYSTEM,
    extractPrompt.buildUserMessage(text, source),
    2500,
    {
      tenantId, clientId,
      operationType: 'image_brandbook_extract',
    }
  );

  const parsed = safeJsonParse(result.text);
  if (!parsed) {
    console.error('[ERRO][BrandbookExtractor] LLM não retornou JSON válido', {
      tenantId, preview: (result.text || '').slice(0, 300),
    });
    throw new Error('Não foi possível estruturar o brandbook (LLM retornou formato inválido)');
  }

  return {
    structuredData: { ...emptyBrandbookSchema(), ...parsed },
    tokensInput:    result.usage?.input || 0,
    tokensOutput:   result.usage?.output || 0,
    modelUsed:      result.modelUsed || llmModel,
  };
}

/**
 * Gera brandbook a partir de descrição livre da marca.
 *
 * @param {object} args
 * @param {string} args.description
 * @param {string} args.tenantId
 * @param {string} [args.userId]
 * @param {string} [args.clientId]
 */
async function generateFromDescription(args) {
  const { description, tenantId, clientId } = args;
  if (!description || !tenantId) throw new Error('generateFromDescription: description e tenantId obrigatórios');

  const settings = await getSettings(tenantId);
  const llmModel = settings.brandbook_extractor_model || 'gpt-4o-mini';

  console.log('[INFO][BrandbookExtractor] gerando a partir de descrição', {
    tenantId, clientId, llmModel, descLength: description.length,
  });

  const result = await runCompletionWithModel(
    llmModel,
    fromTextPrompt.BRANDBOOK_FROM_TEXT_SYSTEM,
    fromTextPrompt.buildUserMessage(description),
    2500,
    {
      tenantId, clientId,
      operationType: 'image_brandbook_generate',
    }
  );

  const parsed = safeJsonParse(result.text);
  if (!parsed) {
    throw new Error('Não foi possível gerar o brandbook (LLM retornou formato inválido)');
  }

  return {
    structuredData: { ...emptyBrandbookSchema(), ...parsed },
    tokensInput:    result.usage?.input || 0,
    tokensOutput:   result.usage?.output || 0,
    modelUsed:      result.modelUsed || llmModel,
  };
}

module.exports = { extractFromText, generateFromDescription, emptyBrandbookSchema };
