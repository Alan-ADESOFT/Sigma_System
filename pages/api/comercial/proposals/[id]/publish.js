/**
 * pages/api/comercial/proposals/[id]/publish.js
 *   POST { ttlDays? } → publica proposta, retorna link público + mensagem.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const proposals = require('../../../../../models/comercial/proposal.model');
const { getSetting } = require('../../../../../models/settings.model');

const DEFAULT_MESSAGE = 'Olá {nome}, segue a proposta SIGMA personalizada para você. ' +
  'Acesse pelo link: {link}\n\n' +
  'O link expira em alguns dias — qualquer dúvida me chama por aqui.';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:proposals/[id]/publish]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    const proposal = await proposals.getProposalById(id, tenantId);
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposta não encontrada' });

    // Validação mínima
    const data = proposal.data || {};
    const errors = [];
    if (!data.client_name)                                 errors.push('client_name vazio');
    if (!Array.isArray(data.pillars) || data.pillars.length !== 3) errors.push('pillars deve ter 3 itens');
    if (!data.investment || data.investment.full_price == null)    errors.push('investment.full_price obrigatório');
    if (errors.length) {
      return res.status(400).json({ success: false, error: 'Proposta incompleta', details: errors });
    }

    let ttlDays = parseInt(req.body?.ttlDays, 10);
    if (!Number.isFinite(ttlDays) || ttlDays < 1 || ttlDays > 60) {
      const cfg = await getSetting(tenantId, 'comercial_proposal_ttl_days');
      ttlDays = Number(cfg) > 0 ? Number(cfg) : 7;
    }

    const updated = await proposals.publishProposal(id, tenantId, { ttlDays });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || `http://localhost:3001`;
    const publicUrl = `${baseUrl.replace(/\/$/, '')}/proposta/${updated.slug}`;

    const template = (data.custom_message && String(data.custom_message).trim())
      || DEFAULT_MESSAGE;
    const copyMessage = template
      .replace(/\{nome\}/gi, data.client_name || 'Cliente')
      .replace(/\{link\}/gi, publicUrl);

    return res.json({
      success: true,
      slug: updated.slug,
      publicUrl,
      expiresAt: updated.expires_at,
      copyMessage,
    });
  } catch (err) {
    console.error('[ERRO][API:publish]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
