/**
 * @fileoverview Endpoint: Timeline do pipeline de um cliente
 * @route GET /api/clients/[id]/pipeline-timeline
 *
 * Retorna a timeline de execução dos agentes para um cliente,
 * cruzando marketing_stages, ai_agent_history e ai_knowledge_base.
 */

import { resolveTenantId } from '../../../../infra/get-tenant-id';
import { query }           from '../../../../infra/db';

const STAGE_AGENT_MAP = {
  diagnosis:   ['agente1'],
  competitors: ['agente2a', 'agente2b'],
  audience:    ['agente3'],
  avatar:      ['agente4a', 'agente4b'],
  positioning: ['agente5'],
};

const STAGE_ORDER = ['diagnosis', 'competitors', 'audience', 'avatar', 'positioning'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  const tenantId = await resolveTenantId(req);
  const clientId = req.query.id;

  if (!clientId) {
    return res.status(400).json({ success: false, error: 'clientId é obrigatório' });
  }

  try {
    // Busca stages do cliente
    const stages = await query(
      `SELECT stage_key, status, updated_at FROM marketing_stages WHERE client_id = $1`,
      [clientId]
    );
    const stageMap = {};
    for (const s of stages) stageMap[s.stage_key] = s;

    // Busca histórico de agentes (último por agente)
    const history = await query(
      `SELECT DISTINCT ON (agent_name)
         agent_name, model_used, created_at
       FROM ai_agent_history
       WHERE client_id = $1 AND tenant_id = $2
       ORDER BY agent_name, created_at DESC`,
      [clientId, tenantId]
    );
    const historyMap = {};
    for (const h of history) historyMap[h.agent_name] = h;

    // Busca versões da KB
    const kbRows = await query(
      `SELECT category, metadata->>'version' as version, metadata->>'agentName' as agent_name
       FROM ai_knowledge_base
       WHERE client_id = $1 AND tenant_id = $2`,
      [clientId, tenantId]
    );
    const kbMap = {};
    for (const k of kbRows) {
      if (k.agent_name) kbMap[k.agent_name] = k.version;
    }

    // Monta timeline
    const timeline = [];

    for (const stageKey of STAGE_ORDER) {
      const stage = stageMap[stageKey] || null;
      const agents = STAGE_AGENT_MAP[stageKey] || [];

      for (const agentName of agents) {
        const hist = historyMap[agentName] || null;

        timeline.push({
          stageKey,
          agentName,
          status: stage?.status || 'pending',
          modelUsed: hist?.model_used || null,
          executedAt: hist?.created_at || null,
          version: kbMap[agentName] ? parseInt(kbMap[agentName]) : null,
        });
      }
    }

    return res.json({ success: true, data: timeline });
  } catch (err) {
    console.error('[ERRO][API:pipeline-timeline]', { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
}
