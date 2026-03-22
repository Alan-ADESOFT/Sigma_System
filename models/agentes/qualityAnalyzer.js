/**
 * @fileoverview Analisador de qualidade dos outputs dos agentes
 * @description Avalia o output de cada etapa e gera um score (0-100)
 * com sugestões de melhoria. Usa modelo weak (gpt-4o-mini) para economia.
 */

const { runCompletion } = require('../ia/completion');
const { queryOne }      = require('../../infra/db');

const STAGE_LABELS = {
  diagnosis:   'Diagnóstico do Negócio',
  competitors: 'Análise de Concorrentes',
  audience:    'Público-Alvo',
  avatar:      'Construção do Avatar',
  positioning: 'Posicionamento da Marca',
  offer:       'Definição da Oferta',
};

/**
 * Analisa a qualidade do output de um agente e salva o score
 * @param {string} stageKey - Chave da etapa (ex: 'diagnosis')
 * @param {string} outputText - Texto do output para analisar
 * @param {object} [clientData] - Dados do cliente (para contexto)
 * @param {string} clientId - ID do cliente
 * @param {string} tenantId - ID do tenant
 * @returns {Promise<{ score: number, details: object, suggestions: string }>}
 */
async function analyzeOutputQuality(stageKey, outputText, clientData, clientId, tenantId) {
  console.log('[INFO][QualityAnalyzer] Analisando qualidade', { stageKey, clientId, textLength: outputText.length });

  const stageLabel = STAGE_LABELS[stageKey] || stageKey;
  const clientContext = clientData?.company_name
    ? `Empresa: ${clientData.company_name} | Nicho: ${clientData.niche || 'não informado'}`
    : '';

  const prompt = `Você é um auditor rigoroso de estratégia de marketing digital.
Analise o output da etapa "${stageLabel}" abaixo e retorne APENAS um JSON válido.
${clientContext ? `Contexto do cliente: ${clientContext}` : ''}

Retorne exatamente este formato JSON (sem markdown, sem \`\`\`):
{
  "score": <número de 0 a 100>,
  "completeness": <número 0-100 — % de seções preenchidas com conteúdo real>,
  "specificity": <número 0-100 — % de dados específicos vs genéricos/vagos>,
  "actionability": <número 0-100 — % de itens práticos e acionáveis>,
  "missing_fields": [<lista de campos ou seções que faltaram ou ficaram vazios>],
  "weak_points": [<lista dos 2-3 pontos mais fracos>],
  "suggestions": "<2-3 sugestões práticas e específicas de como melhorar>"
}

REGRAS DE AVALIAÇÃO:
- Seja rigoroso — prefira scores baixos a scores inflados
- Score 90+ = excepcional, com dados específicos e estratégia clara
- Score 70-89 = bom, mas com espaço para melhorar
- Score 50-69 = mediano, faltam dados ou especificidade
- Score < 50 = fraco, genérico ou incompleto
- Avalie se o conteúdo é específico para ESTE cliente ou se é genérico

OUTPUT PARA ANALISAR:
${outputText.substring(0, 4000)}`;

  try {
    const result = await runCompletion('weak', prompt, 'Analise e retorne o JSON.', 600);
    let parsed;

    // Strip de ```json se necessário
    let jsonStr = result.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('[ERRO][QualityAnalyzer] JSON inválido da IA', { raw: jsonStr.substring(0, 200) });
      parsed = { score: 50, completeness: 50, specificity: 50, actionability: 50, missing_fields: [], weak_points: ['Não foi possível analisar'], suggestions: 'Re-execute o agente para uma análise mais completa.' };
    }

    const score = Math.min(100, Math.max(0, parseInt(parsed.score) || 50));

    // Busca versão atual
    const existing = await queryOne(
      `SELECT version FROM stage_quality_scores WHERE client_id = $1 AND stage_key = $2 ORDER BY version DESC LIMIT 1`,
      [clientId, stageKey]
    );
    const newVersion = existing ? (existing.version || 0) + 1 : 1;

    // Salva no banco
    await queryOne(
      `INSERT INTO stage_quality_scores (client_id, tenant_id, stage_key, score, details, suggestions, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        clientId, tenantId, stageKey, score,
        JSON.stringify({
          completeness:   parsed.completeness   || 0,
          specificity:    parsed.specificity    || 0,
          actionability:  parsed.actionability  || 0,
          missing_fields: parsed.missing_fields || [],
          weak_points:    parsed.weak_points    || [],
        }),
        parsed.suggestions || '',
        newVersion,
      ]
    );

    console.log('[SUCESSO][QualityAnalyzer] Score calculado', { stageKey, clientId, score, version: newVersion });
    return { score, details: parsed, suggestions: parsed.suggestions || '' };

  } catch (err) {
    console.error('[ERRO][QualityAnalyzer] Falha na análise', { stageKey, error: err.message });
    return { score: 0, details: {}, suggestions: 'Erro ao analisar qualidade.' };
  }
}

module.exports = { analyzeOutputQuality };
