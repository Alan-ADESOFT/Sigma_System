/**
 * pages/api/clients/[id]/form-responses.js
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  — Retorna respostas do formulário (onboarding ou legado) com labels.
 * PUT  — Atualiza respostas de uma etapa específica.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { query, queryOne } from '../../../../infra/db';
import { ONBOARDING_STAGES } from '../../../../assets/data/onboardingQuestions';
import { FORM_STEPS } from '../../../../assets/data/formQuestions';

export default async function handler(req, res) {
  try {
    const tenantId = await resolveTenantId(req);
    const { id: clientId } = req.query;

    if (!clientId) {
      return res.status(400).json({ success: false, error: 'clientId obrigatório' });
    }

    if (req.method === 'GET') {
      return handleGet(clientId, tenantId, res);
    }

    if (req.method === 'PUT') {
      return handlePut(clientId, tenantId, req.body, res);
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:form-responses]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/* ── GET — retorna respostas com pares pergunta/resposta ── */
async function handleGet(clientId, tenantId, res) {
  console.log('[INFO][API:form-responses] GET', { clientId });

  // 1. Verifica se tem onboarding
  const onboarding = await queryOne(
    `SELECT id FROM onboarding_progress WHERE client_id = $1`,
    [clientId]
  );

  if (onboarding) {
    // Busca respostas do onboarding
    const rows = await query(
      `SELECT stage_number, responses_json, submitted, submitted_at
       FROM onboarding_stage_responses
       WHERE client_id = $1
       ORDER BY stage_number ASC`,
      [clientId]
    );

    const responseMap = {};
    for (const r of rows) {
      responseMap[r.stage_number] = r;
    }

    const stages = ONBOARDING_STAGES.map(stage => {
      const resp = responseMap[stage.stage];
      const answers = resp?.responses_json || {};

      const fields = stage.questions.map(q => ({
        id: q.id,
        label: q.label,
        type: q.type,
        value: answers[q.id] ?? null,
        options: q.options || null,
      }));

      return {
        stageNumber: stage.stage,
        title: stage.title,
        description: stage.description,
        submitted: resp?.submitted || false,
        submittedAt: resp?.submitted_at || null,
        fields,
      };
    });

    console.log('[SUCESSO][API:form-responses] GET onboarding', { clientId, stages: stages.length });
    return res.json({ success: true, type: 'onboarding', stages });
  }

  // 2. Fallback: formulário legado
  const legacyResp = await queryOne(
    `SELECT r.data, r.submitted_at FROM client_form_responses r
     JOIN client_form_tokens t ON t.id = r.token_id
     WHERE t.client_id = $1
     ORDER BY r.created_at DESC LIMIT 1`,
    [clientId]
  );

  if (!legacyResp || !legacyResp.data) {
    return res.json({ success: true, type: 'none', stages: [] });
  }

  const data = legacyResp.data;

  const stages = FORM_STEPS.map(step => {
    const fields = step.questions.map(q => ({
      id: q.id,
      label: q.label,
      type: q.type,
      value: data[q.id] ?? null,
      options: q.options || null,
    }));

    return {
      stageNumber: step.step,
      title: step.title,
      description: step.description || '',
      submitted: true,
      submittedAt: legacyResp.submitted_at || null,
      fields,
    };
  });

  console.log('[SUCESSO][API:form-responses] GET legado', { clientId, stages: stages.length });
  return res.json({ success: true, type: 'legacy', stages });
}

/* ── PUT — atualiza respostas de uma etapa ── */
async function handlePut(clientId, tenantId, body, res) {
  const { stageNumber, responses, type } = body || {};

  if (!stageNumber || !responses) {
    return res.status(400).json({ success: false, error: 'stageNumber e responses são obrigatórios' });
  }

  console.log('[INFO][API:form-responses] PUT', { clientId, stageNumber, type });

  if (type === 'onboarding') {
    await queryOne(
      `INSERT INTO onboarding_stage_responses
         (client_id, tenant_id, stage_number, responses_json)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (client_id, stage_number) DO UPDATE
         SET responses_json = $4::jsonb`,
      [clientId, tenantId, stageNumber, JSON.stringify(responses)]
    );

    console.log('[SUCESSO][API:form-responses] PUT onboarding', { clientId, stageNumber });
    return res.json({ success: true, message: 'Respostas atualizadas.' });
  }

  // Legado: mescla no JSONB existente
  const existing = await queryOne(
    `SELECT r.id, r.data FROM client_form_responses r
     JOIN client_form_tokens t ON t.id = r.token_id
     WHERE t.client_id = $1
     ORDER BY r.created_at DESC LIMIT 1`,
    [clientId]
  );

  if (!existing) {
    return res.status(404).json({ success: false, error: 'Nenhuma resposta encontrada' });
  }

  const merged = { ...(existing.data || {}), ...responses };

  await query(
    `UPDATE client_form_responses SET data = $1, updated_at = now() WHERE id = $2`,
    [JSON.stringify(merged), existing.id]
  );

  console.log('[SUCESSO][API:form-responses] PUT legado', { clientId, stageNumber });
  return res.json({ success: true, message: 'Respostas atualizadas.' });
}
