/**
 * pages/api/public/content-plan/finalize-feedback.js
 *   POST { token, pin?, generalNotes? }
 *
 * Cliente fecha o feedback. Salva generalNotes em metadata.client_general_notes
 * e loga atividade event_type='client_finalized'.
 */

const shareTokenModel = require('../../../../models/contentPlanning/shareToken');
const planModel = require('../../../../models/contentPlanning/plan');
const activityModel = require('../../../../models/contentPlanning/activity');
const { createNotification } = require('../../../../models/clientForm');
const limiter = require('../../../../infra/contentPlanShareLimit');
const { queryOne } = require('../../../../infra/db');

function setSecurityHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const { token, pin, generalNotes } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: 'token obrigatorio' });

  if (limiter.isLocked(token)) {
    return res.status(429).json({
      success: false,
      reason: 'rate_limited',
      retryAfterMs: limiter.remainingMs(token),
    });
  }

  try {
    const result = await shareTokenModel.validateToken(token, pin);
    if (!result.valid) {
      if (result.reason === 'password_incorrect') limiter.registerFailure(token);
      const code = result.reason === 'not_found' ? 404 : 401;
      return res.status(code).json({ success: false, reason: result.reason });
    }

    const tenantId = result.plan.tenant_id;
    const planId = result.plan.id;

    // Mescla com metadata atual
    const current = await queryOne(
      'SELECT metadata FROM content_plans WHERE id = $1 AND tenant_id = $2',
      [planId, tenantId]
    );
    const merged = {
      ...(current?.metadata || {}),
      client_general_notes: typeof generalNotes === 'string' ? generalNotes.slice(0, 5000) : '',
      client_finalized_at: new Date().toISOString(),
    };

    await planModel.updatePlan(planId, tenantId, { metadata: merged });

    await activityModel.logActivity(tenantId, planId, {
      actorType: 'client',
      actorId: null,
      eventType: 'client_finalized',
      payload: { has_notes: !!generalNotes },
    });

    // Sininho global do dashboard: agrega contagem de decisões e cria
    // entrada em system_notifications. Erros são silenciosos pra não
    // travar o feedback do cliente.
    try {
      const stats = await queryOne(
        `SELECT
            COUNT(*) FILTER (WHERE client_decision = 'approved')::int                 AS approved,
            COUNT(*) FILTER (WHERE client_decision IN ('rejected','adjust'))::int    AS rejected,
            COUNT(*)::int                                                              AS total
           FROM content_plan_creatives
          WHERE plan_id = $1 AND tenant_id = $2`,
        [planId, tenantId]
      );

      const planRow = await queryOne(
        `SELECT p.title, mc.company_name
           FROM content_plans p
      LEFT JOIN marketing_clients mc ON mc.id = p.client_id
          WHERE p.id = $1 AND p.tenant_id = $2`,
        [planId, tenantId]
      );

      const company = planRow?.company_name || 'Cliente';
      const planTitle = planRow?.title || 'Planejamento';
      const approved = stats?.approved || 0;
      const rejected = stats?.rejected || 0;
      const total = stats?.total || 0;

      const messageParts = [
        `${company} finalizou a revisão de "${planTitle}".`,
        `${approved} aprovados`,
        `${rejected} pediram ajuste/reprovação` + (generalNotes ? ' · com observações gerais' : ''),
      ];

      await createNotification(
        tenantId,
        'content_plan_finalized',
        'Cliente finalizou aprovação',
        messageParts.join(' · '),
        planRow?.client_id || null,
        {
          planId,
          planTitle,
          approved,
          rejected,
          total,
          hasGeneralNotes: !!generalNotes,
          finalizedAt: merged.client_finalized_at,
        }
      );
    } catch (notifyErr) {
      console.warn('[WARN][API:public/content-plan/finalize-feedback] sininho falhou', { error: notifyErr.message });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[ERRO][API:public/content-plan/finalize-feedback]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
