/**
 * pages/api/content-planning/plans/[id]/share-tokens.js
 *   GET  → lista tokens do plano (escopo do tenant)
 *   POST → gera novo link { durationDays?=7, pin? }
 *          revoga tokens 'active' anteriores. Retorna { token, link, expiresAt }.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../../lib/auth');
const shareTokenModel = require('../../../../../models/contentPlanning/shareToken');
const { queryOne } = require('../../../../../infra/db');

function buildPublicLink(token) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
  return `${base}/aprovacao/${token}`;
}

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const { id: planId } = req.query;
  const session = verifyToken(req.cookies?.sigma_token);
  const userId = session?.userId || null;

  if (!planId) return res.status(400).json({ success: false, error: 'id obrigatorio' });

  try {
    const plan = await queryOne(
      'SELECT id FROM content_plans WHERE id = $1 AND tenant_id = $2',
      [planId, tenantId]
    );
    if (!plan) return res.status(404).json({ success: false, error: 'Planejamento nao encontrado' });

    if (req.method === 'GET') {
      const tokens = await shareTokenModel.listTokensByPlan(planId, tenantId);
      // Não vaza password_hash
      const safe = tokens.map(({ password_hash, ...rest }) => ({
        ...rest,
        has_password: !!password_hash,
      }));
      return res.json({ success: true, tokens: safe });
    }

    if (req.method === 'POST') {
      const { durationDays = 7, pin } = req.body || {};

      let cleanPin = null;
      if (pin) {
        const s = String(pin).trim();
        if (!/^\d{4}$/.test(s)) {
          return res.status(400).json({ success: false, error: 'pin deve ter exatamente 4 digitos' });
        }
        cleanPin = s;
      }

      const token = await shareTokenModel.createShareToken(tenantId, planId, {
        durationDays: parseInt(durationDays, 10) || 7,
        pin: cleanPin,
        createdBy: userId,
      });

      return res.status(201).json({
        success: true,
        token: token.token,
        link: buildPublicLink(token.token),
        expiresAt: token.expires_at,
        hasPassword: !!cleanPin,
      });
    }

    return res.status(405).json({ success: false, error: 'Metodo nao permitido' });
  } catch (err) {
    console.error('[ERRO][API:content-planning/plans/[id]/share-tokens]', { planId, error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
