/**
 * pages/api/public/content-plan/validate-token.js
 *   POST { token, pin? } → { valid, reason?, plan? }
 *
 * Rota PUBLICA — NAO chama resolveTenantId. Tenant vem do token.
 * Rate limit: 3 falhas de PIN em 15min → bloqueio do token (HTTP 429).
 */

const shareTokenModel = require('../../../../models/contentPlanning/shareToken');
const limiter = require('../../../../infra/contentPlanShareLimit');
const { query, queryOne } = require('../../../../infra/db');

function setSecurityHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

/**
 * Retorna os campos extras do plano + criativos sanitizados para a pagina
 * publica. Omite tenant_id, internal_notes, copy_session_id, sort_order interno,
 * decided_at e timestamps tecnicos. Mantém somente o necessario para revisar.
 */
async function loadPublicPayload(planId, tenantId) {
  const planRow = await queryOne(
    `SELECT id, title, month_reference, objective, central_promise, strategy_notes
       FROM content_plans
      WHERE id = $1 AND tenant_id = $2`,
    [planId, tenantId]
  );
  if (!planRow) return { plan: null, creatives: [] };

  const creativeRows = await query(
    `SELECT id, sort_order, type, scheduled_for, scheduled_time,
            media_urls, video_url, cover_url, caption, cta, hashtags,
            client_decision, client_rating, client_reason, client_notes
       FROM content_plan_creatives
      WHERE plan_id = $1 AND tenant_id = $2
      ORDER BY sort_order ASC, created_at ASC`,
    [planId, tenantId]
  );

  return {
    plan: planRow,
    creatives: creativeRows.map((c) => ({
      id: c.id,
      sort_order: c.sort_order,
      type: c.type,
      scheduled_for: c.scheduled_for,
      scheduled_time: c.scheduled_time,
      media_urls: Array.isArray(c.media_urls) ? c.media_urls : [],
      video_url: c.video_url,
      cover_url: c.cover_url,
      caption: c.caption,
      cta: c.cta,
      hashtags: c.hashtags,
      client_decision: c.client_decision,
      client_rating: c.client_rating,
      client_reason: c.client_reason,
      client_notes: c.client_notes,
    })),
  };
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  }

  const { token, pin } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: 'token obrigatorio' });

  if (limiter.isLocked(token)) {
    const retryMs = limiter.remainingMs(token);
    return res.status(429).json({
      success: false,
      reason: 'rate_limited',
      retryAfterMs: retryMs,
    });
  }

  try {
    const result = await shareTokenModel.validateToken(token, pin);

    if (!result.valid) {
      // Conta falhas só de PIN errado — não conta token expirado/revogado
      if (result.reason === 'password_incorrect') {
        limiter.registerFailure(token);
      }
      const code = result.reason === 'not_found' ? 404 : 401;
      return res.status(code).json({ success: false, reason: result.reason });
    }

    // Sucesso — limpa contadores
    limiter.clearFailures(token);

    // Carrega payload publico (plano completo + criativos sanitizados)
    const extras = await loadPublicPayload(result.plan.id, result.plan.tenant_id);

    // NUNCA expor tenant_id ou client_id ao publico
    const { tenant_id, client_id, ...publicPlan } = result.plan;

    return res.json({
      success: true,
      plan: {
        ...publicPlan,
        objective: extras.plan?.objective ?? publicPlan.objective,
        central_promise: extras.plan?.central_promise ?? null,
        strategy_notes: extras.plan?.strategy_notes ?? null,
      },
      creatives: extras.creatives,
      tokenId: result.tokenData?.id,
    });
  } catch (err) {
    console.error('[ERRO][API:public/content-plan/validate-token]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
