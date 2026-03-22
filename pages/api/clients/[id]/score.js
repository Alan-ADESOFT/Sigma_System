/**
 * @fileoverview Endpoint: Score de qualidade por etapa
 * @route GET  /api/clients/[id]/score?stageKey=xxx → retorna score mais recente
 * @route POST /api/clients/[id]/score { stageKey, outputText } → dispara análise
 */

import { resolveTenantId }      from '../../../../infra/get-tenant-id';
import { queryOne }             from '../../../../infra/db';
import { analyzeOutputQuality } from '../../../../models/agentes/qualityAnalyzer';

export default async function handler(req, res) {
  const tenantId = await resolveTenantId(req);
  const clientId = req.query.id;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
  }

  try {
    // ── GET: retorna score mais recente da etapa ─────────────────────────
    if (req.method === 'GET') {
      const { stageKey } = req.query;
      if (!stageKey) {
        return res.status(400).json({ success: false, error: 'stageKey é obrigatório' });
      }

      const row = await queryOne(
        `SELECT score, details, suggestions, analyzed_at, version
         FROM stage_quality_scores
         WHERE client_id = $1 AND stage_key = $2
         ORDER BY version DESC LIMIT 1`,
        [clientId, stageKey]
      );

      return res.json({ success: true, data: row || null });
    }

    // ── POST: dispara análise em background ──────────────────────────────
    if (req.method === 'POST') {
      const { stageKey, outputText } = req.body;
      if (!stageKey || !outputText) {
        return res.status(400).json({ success: false, error: 'stageKey e outputText são obrigatórios' });
      }

      // Busca dados do cliente para contexto
      const client = await queryOne(
        'SELECT company_name, niche FROM marketing_clients WHERE id = $1',
        [clientId]
      );

      // Dispara em background — não bloqueia resposta
      setImmediate(async () => {
        try {
          await analyzeOutputQuality(stageKey, outputText, client, clientId, tenantId);
        } catch (err) {
          console.error('[ERRO][API:score] Falha na análise em background', { stageKey, error: err.message });
        }
      });

      return res.json({ success: true, message: 'Análise iniciada' });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('[ERRO][API:score]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
