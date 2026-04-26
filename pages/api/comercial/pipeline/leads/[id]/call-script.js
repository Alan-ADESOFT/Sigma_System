/**
 * pages/api/comercial/pipeline/leads/[id]/call-script.js
 *   POST → gera roteiro de cold call personalizado.
 *
 * Body: { variant?: 'consultive' | 'direct' | 'curious' }
 */

import { resolveTenantId } from '../../../../../../infra/get-tenant-id';
const { runCompletion } = require('../../../../../../models/ia/completion');
const { getSetting } = require('../../../../../../models/settings.model');
const { DEFAULT_CALL_SCRIPT_SYSTEM } = require('../../../../../../models/comercial/prompts/callScript');
const pipeline = require('../../../../../../models/comercial/pipeline.model');
const { getLatestAnalysis } = require('../../../../../../models/comercial/leadAnalysis.model');

const VALID_VARIANTS = ['consultive', 'direct', 'curious'];

function buildLeadContext(lead) {
  const lines = [];
  if (lead.company_name) lines.push(`Empresa: ${lead.company_name}`);
  if (lead.contact_name) lines.push(`Contato: ${lead.contact_name}`);
  if (lead.niche)        lines.push(`Nicho: ${lead.niche}`);
  const loc = [lead.city, lead.state].filter(Boolean).join('/');
  if (loc)               lines.push(`Localização: ${loc}`);
  if (lead.website)      lines.push(`Site: ${lead.website}`);
  if (lead.google_rating != null) lines.push(`Google: ${Number(lead.google_rating).toFixed(1)} (${lead.review_count || 0} reviews)`);
  if (lead.sigma_score != null)   lines.push(`Sigma Score: ${lead.sigma_score}`);
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:call-script]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;

    const lead = await pipeline.getLeadById(id, tenantId);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    let { variant } = req.body || {};
    if (!VALID_VARIANTS.includes(variant)) variant = 'consultive';

    const latest = await getLatestAnalysis(tenantId, id);
    const leadAnalysisText = latest?.analysis_text || '(análise IA prévia indisponível)';

    const customPrompt = await getSetting(tenantId, 'prompt_library_comercial_call_script');
    const systemPrompt = (customPrompt || DEFAULT_CALL_SCRIPT_SYSTEM)
      .replace('{LEAD_CONTEXT}',  buildLeadContext(lead))
      .replace('{LEAD_ANALYSIS}', leadAnalysisText)
      .replace('{VARIANT}',       variant);

    const result = await runCompletion('strong', systemPrompt, '', 1500, {
      tenantId,
      operationType: 'comercial_call_script',
    });

    return res.json({
      success: true,
      script: result.text,
      variant,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    console.error('[ERRO][API:call-script]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
