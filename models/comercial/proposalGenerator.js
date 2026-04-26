/**
 * models/comercial/proposalGenerator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Orquestrador da geração de proposta com IA — 4 fases sequenciais.
 *
 * Eventos SSE:
 *   - { type: 'phase',      phase, step, total, message }
 *   - { type: 'phase_done', phase, ...payload }
 *   - { type: 'done', proposalData }
 *   - { type: 'error', message }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { runCompletion } = require('../ia/completion');
const { getSetting } = require('../settings.model');
const { updateProposalData } = require('./proposal.model');
const { createNotification } = require('../clientForm');
const { DEFAULT_PROPOSAL_DIAGNOSTIC_SYSTEM }  = require('./prompts/proposalDiagnostic');
const { DEFAULT_PROPOSAL_OPPORTUNITY_SYSTEM } = require('./prompts/proposalOpportunity');
const { DEFAULT_PROPOSAL_PILLARS_SYSTEM }     = require('./prompts/proposalPillars');
const { DEFAULT_PROPOSAL_PROJECTION_SYSTEM }  = require('./prompts/proposalProjection');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parser JSON tolerante a fences markdown e texto antes/depois.
 */
function safeParseJson(raw) {
  if (!raw) throw new Error('Output IA vazio');
  let text = String(raw).trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Nenhum JSON encontrado no output');
  return JSON.parse(match[0]);
}

function buildProspectContext(prospect) {
  const lines = [];
  if (prospect.company_name) lines.push(`Empresa: ${prospect.company_name}`);
  if (prospect.contact_name) lines.push(`Contato: ${prospect.contact_name}`);
  if (prospect.niche)        lines.push(`Nicho: ${prospect.niche}`);
  const loc = [prospect.city, prospect.state].filter(Boolean).join('/');
  if (loc)                   lines.push(`Localização: ${loc}`);
  if (prospect.website)      lines.push(`Site: ${prospect.website}`);
  if (prospect.instagram)    lines.push(`Instagram: ${prospect.instagram}`);
  return lines.join('\n');
}

async function loadPromptOverride(tenantId, promptId, defaultPrompt) {
  const custom = await getSetting(tenantId, `prompt_library_${promptId}`);
  return custom || defaultPrompt;
}

// ─── Fases ───────────────────────────────────────────────────────────────────

async function generateDiagnostic({ tenantId, leadContext, leadAnalysisText }) {
  const sys = await loadPromptOverride(tenantId, 'comercial_proposal_diagnostic', DEFAULT_PROPOSAL_DIAGNOSTIC_SYSTEM);
  const prompt = sys
    .replace('{LEAD_CONTEXT}',  leadContext)
    .replace('{LEAD_ANALYSIS}', leadAnalysisText || '(análise IA prévia indisponível)');
  const userMsg = 'Gere os 3 parágrafos do diagnóstico seguindo exatamente as regras de voz Sigma.';
  const result = await runCompletion('strong', prompt, userMsg, 1200, { tenantId, operationType: 'comercial_proposal_diagnostic' });
  return result.text.trim();
}

async function generateOpportunity({ tenantId, leadContext, leadAnalysisText, diagnosticText }) {
  const sys = await loadPromptOverride(tenantId, 'comercial_proposal_opportunity', DEFAULT_PROPOSAL_OPPORTUNITY_SYSTEM);
  const prompt = sys
    .replace('{LEAD_CONTEXT}',   leadContext)
    .replace('{LEAD_ANALYSIS}',  leadAnalysisText || '(análise IA prévia indisponível)')
    .replace('{DIAGNOSTIC_TEXT}', diagnosticText || '');
  const userMsg = 'Gere os 2-3 parágrafos da oportunidade dando continuidade tonal ao diagnóstico.';
  const result = await runCompletion('strong', prompt, userMsg, 1200, { tenantId, operationType: 'comercial_proposal_opportunity' });
  return result.text.trim();
}

async function generatePillars({ tenantId, leadContext, leadAnalysisText }) {
  const sys = await loadPromptOverride(tenantId, 'comercial_proposal_pillars', DEFAULT_PROPOSAL_PILLARS_SYSTEM);
  const prompt = sys
    .replace('{LEAD_CONTEXT}',  leadContext)
    .replace('{LEAD_ANALYSIS}', leadAnalysisText || '(análise IA prévia indisponível)');
  const userMsg = 'Retorne APENAS o JSON válido com os 3 pilares — sem markdown, sem texto antes ou depois.';
  const result = await runCompletion('strong', prompt, userMsg, 2000, { tenantId, operationType: 'comercial_proposal_pillars' });
  const parsed = safeParseJson(result.text);
  if (!Array.isArray(parsed.pillars) || parsed.pillars.length !== 3) {
    throw new Error('IA não retornou 3 pilares válidos');
  }
  return parsed.pillars;
}

async function generateProjection({ tenantId, leadContext }) {
  const sys = await loadPromptOverride(tenantId, 'comercial_proposal_projection', DEFAULT_PROPOSAL_PROJECTION_SYSTEM);
  const prompt = sys.replace('{LEAD_CONTEXT}', leadContext);
  const userMsg = 'Retorne APENAS o JSON válido com os 4 cards de stats e disclaimer — sem markdown, sem texto antes ou depois.';
  const result = await runCompletion('strong', prompt, userMsg, 1500, { tenantId, operationType: 'comercial_proposal_projection' });
  const parsed = safeParseJson(result.text);
  if (!Array.isArray(parsed.stats) || parsed.stats.length === 0) {
    throw new Error('IA não retornou stats de projeção válidos');
  }
  return { stats: parsed.stats, disclaimer: parsed.disclaimer || '' };
}

// ─── Orquestrador ────────────────────────────────────────────────────────────

const ALL_SECTIONS = ['diagnostic', 'opportunity', 'pillars', 'projection'];

async function generateProposalContent({
  tenantId, proposalId, prospect, leadAnalysisText,
  sections = ALL_SECTIONS, emitter,
}) {
  console.log('[INFO][ProposalGenerator] Iniciando', { tenantId, proposalId, sections });

  function emit(payload) {
    try { emitter?.emit('event', payload); } catch {}
  }

  const leadContext = buildProspectContext(prospect);
  const total = sections.length;
  let step = 0;
  const result = {};

  try {
    if (sections.includes('diagnostic')) {
      step++;
      emit({ type: 'phase', phase: 'diagnostic', step, total, message: 'Gerando diagnóstico...' });
      const diagnosticText = await generateDiagnostic({ tenantId, leadContext, leadAnalysisText });
      result.diagnostic_text = diagnosticText;
      await updateProposalData(proposalId, tenantId, { diagnostic_text: diagnosticText });
      emit({ type: 'phase_done', phase: 'diagnostic', text: diagnosticText });
    }

    if (sections.includes('opportunity')) {
      step++;
      emit({ type: 'phase', phase: 'opportunity', step, total, message: 'Gerando oportunidade...' });
      const opportunityText = await generateOpportunity({
        tenantId, leadContext, leadAnalysisText,
        diagnosticText: result.diagnostic_text || '',
      });
      result.opportunity_text = opportunityText;
      await updateProposalData(proposalId, tenantId, { opportunity_text: opportunityText });
      emit({ type: 'phase_done', phase: 'opportunity', text: opportunityText });
    }

    if (sections.includes('pillars')) {
      step++;
      emit({ type: 'phase', phase: 'pillars', step, total, message: 'Gerando 3 pilares...' });
      const pillars = await generatePillars({ tenantId, leadContext, leadAnalysisText });
      result.pillars = pillars;
      await updateProposalData(proposalId, tenantId, { pillars });
      emit({ type: 'phase_done', phase: 'pillars', pillars });
    }

    if (sections.includes('projection')) {
      step++;
      emit({ type: 'phase', phase: 'projection', step, total, message: 'Gerando projeção...' });
      const proj = await generateProjection({ tenantId, leadContext });
      result.projection_stats = proj.stats;
      result.projection_disclaimer = proj.disclaimer;
      await updateProposalData(proposalId, tenantId, {
        projection_stats: proj.stats,
        projection_disclaimer: proj.disclaimer,
      });
      emit({ type: 'phase_done', phase: 'projection', stats: proj.stats, disclaimer: proj.disclaimer });
    }

    emit({ type: 'done', proposalData: result });
    console.log('[SUCESSO][ProposalGenerator] Concluído', { proposalId });

    // Sininho do dashboard — útil quando o usuário minimizou o drawer
    try {
      const sectionsList = sections.map((s) => ({
        diagnostic: 'diagnóstico',
        opportunity: 'oportunidade',
        pillars: 'pilares',
        projection: 'projeção',
      }[s] || s)).join(', ');
      await createNotification(
        tenantId,
        'comercial_proposal_ai_done',
        'Proposta gerada com IA',
        `Conteúdo gerado para ${prospect?.company_name || 'a proposta'} (${sectionsList}). Abra para revisar.`,
        null,
        {
          proposalId,
          sections,
          href: `/dashboard/comercial/propostas/${proposalId}/edit`,
        }
      );
    } catch (notifyErr) {
      console.warn('[WARN][ProposalGenerator] sininho falhou', { error: notifyErr.message });
    }

    return result;
  } catch (err) {
    console.error('[ERRO][ProposalGenerator]', { error: err.message, stack: err.stack });
    emit({ type: 'error', message: err.message });

    // Sininho de erro — usuário não fica na escuridão
    try {
      await createNotification(
        tenantId,
        'comercial_proposal_ai_failed',
        'Falha ao gerar proposta',
        `Não foi possível gerar o conteúdo da proposta de ${prospect?.company_name || ''}: ${err.message}`,
        null,
        {
          proposalId,
          error: err.message,
          href: `/dashboard/comercial/propostas/${proposalId}/edit`,
        }
      );
    } catch (notifyErr) {
      console.warn('[WARN][ProposalGenerator] sininho de erro falhou', { error: notifyErr.message });
    }

    throw err;
  }
}

module.exports = {
  generateProposalContent,
  // Helpers expostos pra reuso/teste
  safeParseJson,
};
