/**
 * pages/api/comercial/settings.js
 *   GET → retorna settings comerciais
 *   PUT → atualiza settings (numéricos + toggles boolean de notificações)
 */

import { resolveTenantId } from '../../../infra/get-tenant-id';
const { getSetting, setSetting } = require('../../../models/settings.model');

const NUMERIC_KEYS = [
  { key: 'comercial_list_ttl_days',     default: 5 },
  { key: 'comercial_proposal_ttl_days', default: 7 },
  { key: 'comercial_max_jobs_per_day',  default: 10 },
];

const BOOL_KEYS = [
  { key: 'comercial_notify_proposal_viewed',   default: true },
  { key: 'comercial_notify_lead_won',          default: true },
  { key: 'comercial_notify_analysis_done',     default: true },
  { key: 'comercial_notify_proposal_expiring', default: true },
];

export default async function handler(req, res) {
  console.log('[INFO][API:comercial/settings]', { method: req.method });

  try {
    const tenantId = await resolveTenantId(req);

    if (req.method === 'GET') {
      const out = {};
      for (const k of NUMERIC_KEYS) {
        const v = await getSetting(tenantId, k.key);
        out[k.key] = v != null ? Number(v) : k.default;
      }
      for (const k of BOOL_KEYS) {
        const v = await getSetting(tenantId, k.key);
        out[k.key] = v == null ? k.default : v !== 'false';
      }
      out.apify_token_configured = !!process.env.APIFY_TOKEN;
      out.zapi_configured = !!(process.env.ZAPI_INSTANCE && process.env.ZAPI_TOKEN && process.env.ZAPI_CLIENT_TOKEN);
      return res.json({ success: true, settings: out });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      for (const k of NUMERIC_KEYS) {
        if (body[k.key] !== undefined && body[k.key] !== null && body[k.key] !== '') {
          const num = Number(body[k.key]);
          if (Number.isFinite(num) && num >= 0) {
            await setSetting(tenantId, k.key, String(num));
          }
        }
      }
      for (const k of BOOL_KEYS) {
        if (body[k.key] !== undefined) {
          await setSetting(tenantId, k.key, body[k.key] ? 'true' : 'false');
        }
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:comercial/settings]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
