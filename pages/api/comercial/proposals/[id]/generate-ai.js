/**
 * pages/api/comercial/proposals/[id]/generate-ai.js
 *   POST { sections?: ['diagnostic','opportunity','pillars','projection'] }
 *   → cria emitter, dispara generateProposalContent fire-and-forget.
 */

import { resolveTenantId } from '../../../../../infra/get-tenant-id';
const { createJobEmitter } = require('../../../../../infra/pipelineEmitter');
const { checkRateLimit, logRateLimitEvent } = require('../../../../../infra/rateLimit');
const proposals = require('../../../../../models/comercial/proposal.model');
const prospects = require('../../../../../models/comercial/prospect.model');
const { getLatestAnalysis } = require('../../../../../models/comercial/leadAnalysis.model');
const { generateProposalContent } = require('../../../../../models/comercial/proposalGenerator');

const VALID_SECTIONS = ['diagnostic', 'opportunity', 'pillars', 'projection'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }
  console.log('[INFO][API:proposals/[id]/generate-ai]', { id: req.query?.id });

  try {
    const tenantId = await resolveTenantId(req);
    const { id } = req.query;
    const proposal = await proposals.getProposalById(id, tenantId);
    if (!proposal) return res.status(404).json({ success: false, error: 'Proposta não encontrada' });

    const prospect = await prospects.getProspectById(proposal.prospect_id, tenantId);
    if (!prospect) return res.status(404).json({ success: false, error: 'Prospect não encontrado' });

    let { sections, force } = req.body || {};
    if (!Array.isArray(sections) || sections.length === 0) sections = VALID_SECTIONS;
    sections = sections.filter(s => VALID_SECTIONS.includes(s));
    if (sections.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhuma seção válida' });
    }

    // Guard anti-regeneração — economiza tokens. Só roda se nunca rodou OU se força explícita.
    if (proposal.data?.ai_generated_at && !force) {
      const at = new Date(proposal.data.ai_generated_at).toLocaleString('pt-BR');
      return res.status(409).json({
        success: false,
        error: `Esta proposta já foi gerada com IA em ${at}. Edite manualmente as seções para preservar tokens.`,
        alreadyGeneratedAt: proposal.data.ai_generated_at,
      });
    }

    const maxPerDay = Number(process.env.COMERCIAL_RATE_LIMIT_PROPOSAL_AI_PER_DAY) || 30;
    const rl = await checkRateLimit(tenantId, 'comercial_proposal_ai', maxPerDay, 24 * 60);
    if (!rl.ok) {
      return res.status(429).json({
        success: false,
        error: `Limite diário (${maxPerDay} gerações/dia) atingido. Tente em ${Math.ceil(rl.resetIn / 60)} min.`,
        retryAfter: rl.resetIn,
      });
    }

    // Carrega análise do lead se houver
    let leadAnalysisText = '';
    if (prospect.pipeline_lead_id) {
      const latest = await getLatestAnalysis(tenantId, prospect.pipeline_lead_id);
      if (latest) leadAnalysisText = latest.analysis_text;
    }

    const jobId = `proposal_${id}_${Date.now()}`;
    const emitter = createJobEmitter(jobId);

    // Marca já como gerada (otimista). Se a geração falhar o usuário pode
    // resetar o flag manualmente via PUT ou enviando { force: true }.
    try {
      await proposals.updateProposalData(id, tenantId, {
        ai_generated_at: new Date().toISOString(),
      });
    } catch (markErr) {
      console.warn('[WARN][generate-ai] não conseguiu marcar ai_generated_at', { error: markErr.message });
    }

    setImmediate(() => {
      generateProposalContent({ tenantId, proposalId: id, prospect, leadAnalysisText, sections, emitter })
        .catch(err => console.error('[ERRO][generate-ai fire-and-forget]', { error: err.message }));
    });

    await logRateLimitEvent(tenantId, 'comercial_proposal_ai', { proposalId: id, sections });

    return res.status(202).json({ success: true, jobId, sections });
  } catch (err) {
    console.error('[ERRO][API:generate-ai]', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, error: err.message });
  }
}
