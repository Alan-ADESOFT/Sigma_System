/**
 * models/comercial/leadAnalysis.model.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CRUD do histórico de análises IA de leads.
 * Multi-tenant.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query, queryOne } = require('../../infra/db');

/**
 * Persiste uma análise. Atualiza também o cache em comercial_pipeline_leads.
 */
async function saveAnalysis(tenantId, {
  pipelineLeadId, analysisText, sigmaScore, citations, sourcesUsed,
  modelUsed, tokensInput, tokensOutput, durationMs, createdBy,
}) {
  console.log('[INFO][model:leadAnalysis:saveAnalysis]', { tenantId, pipelineLeadId, sigmaScore });

  let row;
  try {
    row = await queryOne(
      `INSERT INTO comercial_lead_analyses
         (tenant_id, pipeline_lead_id, analysis_text, sigma_score, citations,
          sources_used, model_used, tokens_input, tokens_output, duration_ms, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tenantId, pipelineLeadId, analysisText, sigmaScore,
        JSON.stringify(citations || []),
        JSON.stringify(sourcesUsed || {}),
        modelUsed || null,
        tokensInput || 0,
        tokensOutput || 0,
        durationMs || 0,
        createdBy || null,
      ]
    );
  } catch (err) {
    if (/relation .* does not exist/i.test(err.message)) {
      throw new Error('Tabela comercial_lead_analyses não existe. Execute as migrations Sprint 2 (infra/migrations/20260426_comercial_sprint2.sql).');
    }
    throw err;
  }

  // Atualiza cache na tabela do lead — best-effort, não derruba se colunas não existirem
  try {
    await query(
      `UPDATE comercial_pipeline_leads
          SET ai_analysis = $1,
              ai_analyzed_at = now(),
              ai_sigma_score = $2,
              last_activity_at = now()
        WHERE id = $3 AND tenant_id = $4`,
      [analysisText, sigmaScore, pipelineLeadId, tenantId]
    );
  } catch (err) {
    if (/column .* does not exist/i.test(err.message)) {
      console.warn('[WARN][saveAnalysis] colunas ai_* ausentes em comercial_pipeline_leads — rode migration Sprint 2', { error: err.message });
      // Tenta UPDATE mínimo só de last_activity_at
      try {
        await query(
          `UPDATE comercial_pipeline_leads SET last_activity_at = now()
            WHERE id = $1 AND tenant_id = $2`,
          [pipelineLeadId, tenantId]
        );
      } catch {}
    } else {
      throw err;
    }
  }

  console.log('[SUCESSO][model:leadAnalysis:saveAnalysis]', { id: row.id });
  return row;
}

async function getLatestAnalysis(tenantId, pipelineLeadId) {
  return queryOne(
    `SELECT * FROM comercial_lead_analyses
      WHERE tenant_id = $1 AND pipeline_lead_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [tenantId, pipelineLeadId]
  );
}

async function getAnalysisHistory(tenantId, pipelineLeadId, limit = 5) {
  return query(
    `SELECT id, sigma_score, model_used, sources_used, duration_ms, created_at
       FROM comercial_lead_analyses
      WHERE tenant_id = $1 AND pipeline_lead_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [tenantId, pipelineLeadId, limit]
  );
}

async function deleteAnalysis(tenantId, id) {
  await query(
    `DELETE FROM comercial_lead_analyses WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
}

module.exports = {
  saveAnalysis,
  getLatestAnalysis,
  getAnalysisHistory,
  deleteAnalysis,
};
