/**
 * @fileoverview Endpoint: Lista os agentes disponíveis
 * @route GET /api/agentes/agents
 *
 * Response: { success: true, data: AgentConfig[] }
 */

import { listAgentConfigs } from '../../../models/agentes/copycreator/prompts/index';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const agents = listAgentConfigs();
    return res.json({ success: true, data: agents });
  } catch (err) {
    console.error('[/api/agentes/agents] Erro:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
