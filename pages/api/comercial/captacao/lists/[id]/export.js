/**
 * pages/api/comercial/captacao/lists/[id]/export.js
 *   GET → CSV com todos os leads da lista
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const leadList = require('../../../../../../models/comercial/leadList.model');

function csvEscape(val) {
  if (val == null) return '';
  const str = String(val);
  if (/[",\n;]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function slugify(s) {
  return String(s || 'leads')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'leads';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:comercial/captacao/lists/[id]/export]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;

    const list = await leadList.getListById(id, tenantId);
    if (!list) return res.status(404).json({ success: false, error: 'Lista não encontrada' });

    // Pega tudo (até 5000 leads — limite seguro pra CSV)
    const { rows } = await leadList.getLeadsByListId(id, tenantId, { limit: 5000, offset: 0 });

    const headers = [
      'company_name', 'phone', 'website', 'google_rating', 'review_count',
      'city', 'state', 'niche', 'sigma_score', 'address',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map(h => csvEscape(r[h])).join(','));
    }
    const csv = '﻿' + lines.join('\n'); // BOM pra Excel reconhecer UTF-8

    const today = new Date().toISOString().slice(0, 10);
    const filename = `leads-${slugify(list.name)}-${today}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('[ERRO][API:comercial/captacao/lists/[id]/export]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
