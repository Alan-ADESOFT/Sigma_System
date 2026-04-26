/**
 * pages/api/comercial/pipeline/leads/[id]/auto-plan.js
 *   POST → dispara geração automática de planejamento de conteúdo a partir
 *   das notas + análise IA do lead recém-fechado.
 *
 * Retorna 202 imediatamente e roda IA + persistência em segundo plano.
 * Notificações de sucesso/erro vão para system_notifications (sininho do dashboard).
 *
 * Pré-requisito: lead deve ter client_id (já foi marcado como ganho).
 *
 * Body: opcional { creativeCount?: number } — default 8.
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../../lib/auth');
const { queryOne, query } = require('../../../../../../infra/db');
const { createNotification } = require('../../../../../../models/clientForm');
const planModel = require('../../../../../../models/contentPlanning/plan');
const creativeModel = require('../../../../../../models/contentPlanning/creative');
const statusModel = require('../../../../../../models/contentPlanning/status');
const { runCompletion } = require('../../../../../../models/ia/completion');

const SYSTEM_PROMPT = `Você é um estrategista de conteúdo digital sênior, especializado em Instagram para empresas brasileiras.
Trabalha com agências de marketing e entrega planejamentos de conteúdo enxutos, com gancho forte e CTAs claros.

Regras:
- Tom de voz alinhado ao nicho do cliente (mais técnico para B2B/serviços, mais quente para varejo/lifestyle).
- Formato Instagram: post estático, carrossel, reel ou story.
- Cada legenda começa com gancho de 1-2 linhas, depois corpo de até 4 parágrafos curtos, fecha com CTA.
- Hashtags relevantes ao nicho/região (5-10 hashtags).
- Distribuir os criativos ao longo do mês de forma realista (3-4 por semana, evitando sábados de manhã).
- Internal_notes traz briefing visual objetivo para o designer (cores, mood, elementos-chave).

Saída: APENAS JSON válido. Não inclua markdown, comentários ou texto fora do JSON.`;

function buildUserPrompt({ client, lead, monthRef, creativeCount }) {
  return `# CLIENTE
- Empresa: ${client.company_name}
- Nicho: ${client.niche || 'não informado'}
- Região: ${client.region || 'não informada'}
- Produto principal: ${client.main_product || 'não informado'}
- Ticket médio: ${client.avg_ticket || 'não informado'}

${client.observations ? `# OBSERVAÇÕES INTERNAS DO CLIENTE\n${client.observations}\n` : ''}
${lead.notes ? `# ANÁLISE IA + NOTAS DO LEAD\n${lead.notes}\n` : ''}

# TAREFA
Gere um planejamento de conteúdo para Instagram com ${creativeCount} criativos para o mês de referência ${monthRef.slice(0, 7)}.

Retorne APENAS um JSON no formato exato abaixo (sem comentários, sem markdown wrappers, sem prefixo):

{
  "title": "Título curto do planejamento",
  "objective": "Objetivo do mês em 1 frase",
  "central_promise": "Promessa central a comunicar",
  "strategy_notes": "Estratégia geral em 2-3 frases (pilares de conteúdo, frequência)",
  "creatives": [
    {
      "type": "post",
      "caption": "Texto completo do post com gancho, corpo e CTA",
      "cta": "Call-to-action curto",
      "hashtags": "#tag1 #tag2 #tag3",
      "internal_notes": "Briefing visual objetivo",
      "scheduled_for": "${monthRef.slice(0, 7)}-DD",
      "scheduled_time": "HH:MM"
    }
  ]
}

type pode ser: post, carousel, reel, story.
Distribua os ${creativeCount} criativos ao longo do mês (3-4 por semana). Use datas reais do mês ${monthRef.slice(0, 7)}.`;
}

function tryParseJSON(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  // Remove fences markdown caso o modelo tenha incluído
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // Pega o primeiro objeto JSON balanceado
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try { return JSON.parse(cleaned); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { id: leadId } = req.query;
    if (!leadId) return res.status(400).json({ success: false, error: 'leadId obrigatório' });

    const lead = await queryOne(
      `SELECT * FROM comercial_pipeline_leads WHERE id = $1 AND tenant_id = $2`,
      [leadId, tenantId]
    );
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    if (!lead.client_id) {
      return res.status(400).json({
        success: false,
        error: 'Lead ainda não foi convertido em cliente. Marque como ganho primeiro.',
      });
    }

    const creativeCount = Math.max(3, Math.min(20, Number(req.body?.creativeCount) || 8));

    // Resposta imediata — IA + persistência rodam em background
    res.status(202).json({ success: true, message: 'Geração em andamento', leadId });

    // ─── Background work ────────────────────────────────────────────────
    setImmediate(async () => {
      console.log('[INFO][auto-plan][bg] iniciando', { tenantId, leadId, clientId: lead.client_id });
      let createdPlanId = null;

      try {
        const client = await queryOne(
          `SELECT * FROM marketing_clients WHERE id = $1 AND tenant_id = $2`,
          [lead.client_id, tenantId]
        );
        if (!client) throw new Error('Cliente não encontrado');

        // Mês de referência: próximo mês começando no dia 1
        const today = new Date();
        const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const monthRef = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;

        const userPrompt = buildUserPrompt({ client, lead, monthRef, creativeCount });

        const { text, modelUsed } = await runCompletion('strong', SYSTEM_PROMPT, userPrompt, 6000, {
          tenantId,
          operationType: 'comercial_auto_plan',
          clientId: client.id,
        });

        const parsed = tryParseJSON(text);
        if (!parsed || !Array.isArray(parsed.creatives) || parsed.creatives.length === 0) {
          throw new Error('IA não retornou JSON válido com criativos');
        }

        // Cria o plano
        await statusModel.ensureDefaults(tenantId);
        const plan = await planModel.createPlan(tenantId, {
          client_id: client.id,
          title: parsed.title || `Planejamento ${monthRef.slice(0, 7)} — ${client.company_name}`,
          month_reference: monthRef,
          objective: parsed.objective || null,
          central_promise: parsed.central_promise || null,
          strategy_notes: parsed.strategy_notes || null,
          owner_id: userId,
          metadata: {
            auto_generated_from_lead: lead.id,
            auto_generated_at: new Date().toISOString(),
            model_used: modelUsed,
          },
          actor_id: userId,
        });
        createdPlanId = plan.id;

        // Bulk create criativos
        const sanitizedCreatives = parsed.creatives.slice(0, 50).map((c) => ({
          type: c.type,
          caption: c.caption,
          cta: c.cta,
          hashtags: c.hashtags,
          internal_notes: c.internal_notes,
          scheduled_for: c.scheduled_for,
          scheduled_time: c.scheduled_time,
          media_urls: [],
        }));
        await creativeModel.bulkCreate(tenantId, plan.id, sanitizedCreatives);

        await createNotification(
          tenantId,
          'content_plan_auto_generated',
          'Planejamento gerado',
          `O planejamento de "${client.company_name}" foi gerado com ${sanitizedCreatives.length} criativos. Abra para revisar.`,
          client.id,
          {
            planId: plan.id,
            leadId: lead.id,
            count: sanitizedCreatives.length,
            href: `/dashboard/content-planning/${plan.id}`,
          }
        );
        console.log('[SUCESSO][auto-plan][bg]', { planId: plan.id, count: sanitizedCreatives.length });
      } catch (err) {
        console.error('[ERRO][auto-plan][bg]', { error: err.message, stack: err.stack });

        // Rollback: deleta plano + criativos se foi criado parcialmente
        if (createdPlanId) {
          try {
            await query(`DELETE FROM content_plan_creatives WHERE plan_id = $1 AND tenant_id = $2`, [createdPlanId, tenantId]);
            await query(`DELETE FROM content_plans WHERE id = $1 AND tenant_id = $2`, [createdPlanId, tenantId]);
            console.log('[INFO][auto-plan][bg][rollback] plano deletado', { planId: createdPlanId });
          } catch (rollbackErr) {
            console.error('[ERRO][auto-plan][bg][rollback]', rollbackErr.message);
          }
        }

        try {
          await createNotification(
            tenantId,
            'content_plan_auto_failed',
            'Falha ao gerar planejamento',
            `Não foi possível gerar o planejamento automático: ${err.message}`,
            lead.client_id || null,
            { leadId: lead.id, error: err.message }
          );
        } catch (notifyErr) {
          console.warn('[WARN][auto-plan][bg] notificação de erro falhou', notifyErr.message);
        }
      }
    });
  } catch (err) {
    console.error('[ERRO][API:auto-plan]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
