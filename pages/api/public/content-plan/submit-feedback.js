/**
 * pages/api/public/content-plan/submit-feedback.js
 *   POST { token, pin?, creativeId, decision, rating?, reason?, notes? }
 *
 * Rota PUBLICA — valida token e usa plan.tenant_id. Confirma que o
 * criativo pertence ao mesmo plano antes de gravar a decisão.
 */

const shareTokenModel = require('../../../../models/contentPlanning/shareToken');
const creativeModel = require('../../../../models/contentPlanning/creative');
const planModel = require('../../../../models/contentPlanning/plan');
const { createNotification } = require('../../../../models/clientForm');
const { queryOne } = require('../../../../infra/db');
const limiter = require('../../../../infra/contentPlanShareLimit');

const VALID_DECISIONS = new Set(['approved', 'rejected', 'adjust']);

function setSecurityHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const { token, pin, creativeId, decision, rating, reason, notes } = req.body || {};

  if (!token) return res.status(400).json({ success: false, error: 'token obrigatorio' });
  if (!creativeId) return res.status(400).json({ success: false, error: 'creativeId obrigatorio' });
  if (!VALID_DECISIONS.has(decision)) {
    return res.status(400).json({ success: false, error: 'decision deve ser approved|rejected|adjust' });
  }

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

    // Confirma que o criativo pertence ao mesmo plano
    const creative = await creativeModel.getCreativeById(creativeId, tenantId);
    if (!creative || creative.plan_id !== planId) {
      return res.status(404).json({ success: false, error: 'Criativo nao encontrado neste plano' });
    }

    const updated = await creativeModel.setClientDecision(creativeId, tenantId, {
      decision,
      rating,
      reason,
      notes,
    });

    // ─── Auto-move para "Aprovado" quando TODOS os criativos estão aprovados ────
    // Só checa quando o evento atual é uma aprovação. Não retrocede automaticamente
    // (se uma aprovação for trocada por rejected, status fica como o operador decidir).
    let planMovedToApproved = false;
    if (decision === 'approved') {
      try {
        const stats = await queryOne(
          `SELECT
              COUNT(*) FILTER (WHERE client_decision = 'approved')::int AS approved,
              COUNT(*)::int                                              AS total
             FROM content_plan_creatives
            WHERE plan_id = $1 AND tenant_id = $2`,
          [planId, tenantId]
        );

        if (stats && stats.total > 0 && stats.approved === stats.total) {
          const approvedStatus = await queryOne(
            `SELECT id FROM content_plan_statuses
              WHERE tenant_id = $1 AND key = 'approved' LIMIT 1`,
            [tenantId]
          );
          if (approvedStatus) {
            const currentPlan = await queryOne(
              `SELECT p.status_id, p.title, p.client_id, mc.company_name
                 FROM content_plans p
            LEFT JOIN marketing_clients mc ON mc.id = p.client_id
                WHERE p.id = $1 AND p.tenant_id = $2`,
              [planId, tenantId]
            );
            if (currentPlan && currentPlan.status_id !== approvedStatus.id) {
              await planModel.updatePlan(planId, tenantId, { status_id: approvedStatus.id });
              planMovedToApproved = true;

              // Sininho do dashboard
              try {
                await createNotification(
                  tenantId,
                  'content_plan_all_approved',
                  'Cliente aprovou tudo',
                  `${currentPlan.company_name || 'Cliente'} aprovou todos os ${stats.total} criativos de "${currentPlan.title}". Status movido para "Aprovado".`,
                  currentPlan.client_id || null,
                  {
                    planId,
                    total: stats.total,
                    href: `/dashboard/content-planning/${planId}`,
                  }
                );
              } catch (notifyErr) {
                console.warn('[WARN][API:public/content-plan/submit-feedback] notif falhou', { error: notifyErr.message });
              }
            }
          }
        }
      } catch (autoErr) {
        // Não bloqueia a resposta ao cliente — auto-move é best-effort
        console.warn('[WARN][API:public/content-plan/submit-feedback] auto-move falhou', { error: autoErr.message });
      }
    }

    return res.json({
      success: true,
      planMovedToApproved,
      creative: {
        id: updated.id,
        client_decision: updated.client_decision,
        client_rating: updated.client_rating,
        decided_at: updated.decided_at,
      },
    });
  } catch (err) {
    console.error('[ERRO][API:public/content-plan/submit-feedback]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
