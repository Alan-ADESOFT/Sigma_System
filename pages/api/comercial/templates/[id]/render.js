/**
 * pages/api/comercial/templates/[id]/render.js
 *   POST → renderiza template com vars do lead/proposta + extras.
 *
 * Body: { pipelineLeadId?, prospectId?, proposalSlug?, extraVars? }
 * Response: { success, rendered, variables: { ...resolvidas } }
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const { queryOne } = require('../../../../../infra/db');
const { verifyToken } = require('../../../../../lib/auth');
const tpl = require('../../../../../models/comercial/messageTemplate.model');

function buildPublicUrl(slug) {
  if (!slug) return '';
  const base = process.env.NEXT_PUBLIC_BASE_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || 'http://localhost:3001';
  return `${String(base).replace(/\/$/, '')}/proposta/${slug}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:templates/[id]/render]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const session = verifyToken(req.cookies?.sigma_token);
    const userId = session?.userId || null;

    const { id } = req.query;
    const template = await tpl.getTemplateById(id, tenantId);
    if (!template) return res.status(404).json({ success: false, error: 'Template não encontrado' });

    const { pipelineLeadId, prospectId, proposalSlug, extraVars } = req.body || {};

    const vars = {};

    if (pipelineLeadId) {
      const lead = await queryOne(
        `SELECT * FROM comercial_pipeline_leads WHERE id = $1 AND tenant_id = $2`,
        [pipelineLeadId, tenantId]
      );
      if (lead) {
        vars.nome_empresa = lead.company_name || '';
        vars.nome_contato = lead.contact_name || lead.company_name || '';
        vars.cidade       = lead.city || '';
        vars.nicho        = lead.niche || '';
      }
    }

    if (prospectId) {
      const prospect = await queryOne(
        `SELECT * FROM comercial_prospects WHERE id = $1 AND tenant_id = $2`,
        [prospectId, tenantId]
      );
      if (prospect) {
        vars.nome_empresa = vars.nome_empresa || prospect.company_name || '';
        vars.nome_contato = vars.nome_contato || prospect.contact_name || prospect.company_name || '';
        vars.cidade       = vars.cidade || prospect.city || '';
        vars.nicho        = vars.nicho || prospect.niche || '';
      }
    }

    if (proposalSlug) {
      vars.link_proposta = buildPublicUrl(proposalSlug);
    }

    // Nome do responsável: usuário logado
    if (userId) {
      const me = await queryOne(`SELECT name FROM tenants WHERE id = $1`, [userId]);
      vars.nome_responsavel = me?.name?.split(' ')?.[0] || me?.name || '';
    }

    // Extra vars sobrescrevem
    if (extraVars && typeof extraVars === 'object') {
      for (const [k, v] of Object.entries(extraVars)) {
        if (v != null && v !== '') vars[k] = String(v);
      }
    }

    const rendered = tpl.renderTemplate(template.content, vars);
    return res.json({ success: true, rendered, variables: vars });
  } catch (err) {
    console.error('[ERRO][API:templates/render]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
