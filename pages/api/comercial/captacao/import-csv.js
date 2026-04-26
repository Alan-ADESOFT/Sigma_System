/**
 * pages/api/comercial/captacao/import-csv.js
 *   POST → cria lista com source='csv' a partir de leads enviados
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
const { verifyToken } = require('../../../../lib/auth');
const leadList = require('../../../../models/comercial/leadList.model');
const { calculateSigmaScore } = require('../../../../models/comercial/sigmaScore');
const { getSetting } = require('../../../../models/settings.model');

const MAX_LEADS = 1000;

export const config = {
  api: {
    bodyParser: { sizeLimit: '4mb' },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/captacao/import-csv]');

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { name, leads } = req.body || {};
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'leads (array) obrigatório' });
    }
    if (leads.length > MAX_LEADS) {
      return res.status(413).json({ success: false, error: `Máximo ${MAX_LEADS} leads por upload` });
    }

    const cfgTtl = await getSetting(tenantId, 'comercial_list_ttl_days');
    const ttlDays = Number(cfgTtl) > 0 ? Number(cfgTtl) : 5;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const list = await leadList.createList(tenantId, {
      name: name || `Importação CSV ${new Date().toISOString().slice(0, 10)}`,
      source: 'csv',
      filters: { source: 'csv', count: leads.length },
      expiresAt,
      createdBy: userId,
    });

    // Normaliza + calcula score
    const normalized = leads
      .filter(l => l && l.company_name && String(l.company_name).trim())
      .map(l => {
        const has_website = !!(l.website && String(l.website).trim());
        const lead = {
          company_name: String(l.company_name).trim(),
          phone:        l.phone        ? String(l.phone).trim()        : null,
          website:      l.website      ? String(l.website).trim()      : null,
          google_rating: l.google_rating != null && l.google_rating !== '' ? Number(l.google_rating) : null,
          review_count:  l.review_count  != null && l.review_count !== ''  ? Number(l.review_count)  : 0,
          address: l.address || null,
          city:    l.city    || null,
          state:   l.state   || null,
          niche:   l.niche   || null,
          has_website,
          instagram_handle: l.instagram_handle || null,
          raw_data: { source: 'csv', original: l },
        };
        lead.sigma_score = calculateSigmaScore(lead);
        return lead;
      });

    const inserted = await leadList.addLeadsToList(list.id, tenantId, normalized);
    await leadList.updateListStatus(list.id, tenantId, {
      status: 'completed',
      totalLeads: inserted,
    });

    console.log('[SUCESSO][API:comercial/captacao/import-csv]', { listId: list.id, inserted });
    return res.status(201).json({
      success: true,
      listId: list.id,
      totalLeads: inserted,
    });
  } catch (err) {
    console.error('[ERRO][API:comercial/captacao/import-csv]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
