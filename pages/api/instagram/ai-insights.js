/**
 * pages/api/instagram/ai-insights.js
 * ─────────────────────────────────────────────────────────────────────────────
 * @route POST /api/instagram/ai-insights
 *
 * Recebe { clientId, insights, recentMedia, period } e devolve uma análise
 * estratégica em Markdown gerada por IA (nível 'strong').
 *
 * Tracking: passa tenantId/clientId para runCompletion → log em ai_token_usage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { resolveTenantId } = require('../../../infra/get-tenant-id');
const { queryOne } = require('../../../infra/db');
const { runCompletion } = require('../../../models/ia/completion');
const { withMarkdown } = require('../../../models/ia/markdownHelper');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Use POST' });
  }

  const { clientId, insights = {}, recentMedia = [], period = 'month' } = req.body || {};
  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId obrigatório' });
  }

  console.log('[INFO][API:/api/instagram/ai-insights]', { clientId, period });

  try {
    const tenantId = await resolveTenantId(req);

    const client = await queryOne(
      `SELECT id, company_name, niche, main_product
         FROM marketing_clients
         WHERE id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    const periodLabel = period === 'week' ? 'últimos 7 dias' : period === 'day' ? 'hoje' : 'últimos 30 dias';

    const mediaSummary = (recentMedia || []).slice(0, 12).map((m) => {
      const date = m.timestamp ? new Date(m.timestamp).toLocaleDateString('pt-BR') : '—';
      return `- ${date} · ${m.media_type || '?'} · ${m.like_count || 0} likes · ${m.comments_count || 0} comentários${m.caption ? ` · "${(m.caption || '').slice(0, 80).replace(/\n/g, ' ')}"` : ''}`;
    }).join('\n') || '(sem posts recentes)';

    const insightsList = Object.entries(insights)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n') || '(sem métricas)';

    const systemPrompt = withMarkdown(`Você é um especialista sênior em marketing digital, mídias sociais e análise de performance no Instagram. Seu papel é entregar análises estratégicas, claras e acionáveis para um gestor de marketing de agência. Você fala em português do Brasil, em tom profissional e direto. Não usa emojis. Não exagera. Apoia toda recomendação em dados.`);

    const userMessage = `Analise os dados de Instagram da empresa abaixo e entregue um relatório estratégico.

CLIENTE: ${client.company_name}
NICHO: ${client.niche || 'não informado'}
PRODUTO PRINCIPAL: ${client.main_product || 'não informado'}
PERÍODO ANALISADO: ${periodLabel}

MÉTRICAS DA CONTA NO PERÍODO:
${insightsList}

POSTS RECENTES:
${mediaSummary}

Entregue o relatório com EXATAMENTE estas seções (em Markdown, com headings ## ):

## Resumo Executivo
Um parágrafo curto (3-4 linhas) com a leitura geral da performance.

## O que está funcionando
Lista dos pontos fortes identificados nos dados.

## O que precisa de atenção
Lista de problemas, oportunidades perdidas ou métricas fracas.

## Recomendações para os próximos 30 dias
Lista numerada de ações concretas (formatos a testar, frequência, temas).

## Melhores dias e horários para postar
Inferência baseada nos dados disponíveis (se não houver evidência suficiente, diga isso e dê uma recomendação genérica baseada no nicho).

Seja direto. Não use linguagem floreada. Não invente números.`;

    const result = await runCompletion('strong', systemPrompt, userMessage, 3000, {
      tenantId,
      clientId,
      operationType: 'ig_ai_insights',
    });

    console.log('[SUCESSO][API:/api/instagram/ai-insights]', { length: result.text.length });

    return res.json({
      success: true,
      analysis: result.text,
      modelUsed: result.modelUsed,
      usage: result.usage,
    });
  } catch (err) {
    console.error('[ERRO][API:/api/instagram/ai-insights]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
